import type { SyncAccount, SyncAuthStore, SyncRepository } from '@memorilo/sync'
import { Buffer } from 'node:buffer'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import argon2 from 'argon2'

const sessionCookie = 'memorilo_session'
const sessionDurationMs = 1000 * 60 * 60 * 24 * 7

export interface BrowserAuthOptions {
  readonly auth: SyncAuthStore
  readonly defaultEnabledModes?: readonly ('relay' | 'authoritative')[]
  readonly repository: SyncRepository
  readonly now?: () => number
  readonly secureCookies?: boolean
}

export interface AuthenticatedBrowserAccount {
  readonly accountId: string
  readonly username: string
  readonly csrfToken: string
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function equalToken(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

function cookieValue(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie')
  const match = cookieHeader?.match(/(?:^|;\s*)memorilo_session=([^;]+)/u)
  return match?.[1] ?? null
}

export function createBrowserAuth(options: BrowserAuthOptions) {
  const now = options.now ?? Date.now

  async function current(request: Request): Promise<AuthenticatedBrowserAccount | null> {
    const token = cookieValue(request)
    if (!token)
      return null
    const session = await options.auth.getSession(tokenHash(token), now())
    if (!session)
      return null
    const account = await options.auth.findAccountById(session.accountId)
    return account
      ? { accountId: session.accountId, csrfToken: session.csrfToken, username: account.username }
      : null
  }

  function validateCredentials(username: string, password: string): void {
    if (!/^\w[\w-]{2,31}$/u.test(username))
      throw new TypeError('Username must be 3-32 characters and contain only letters, numbers, _ or -')
    if (password.length < 12)
      throw new TypeError('Password must contain at least 12 characters')
  }

  async function createAccount(username: string, password: string, inviteToken?: string, requireEmpty = false): Promise<SyncAccount> {
    validateCredentials(username, password)
    const accountId = randomUUID()
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
    return options.auth.provisionAccount({
      accountId,
      createdAt: now(),
      enabledModes: options.defaultEnabledModes ?? ['authoritative', 'relay'],
      inviteTokenHash: inviteToken ? tokenHash(inviteToken) : undefined,
      passwordHash,
      requireEmpty,
      username,
    })
  }

  async function createInitialAccount(username: string, password: string): Promise<SyncAccount> {
    return createAccount(username, password, undefined, true)
  }

  async function register(username: string, password: string, inviteToken?: string): Promise<SyncAccount> {
    return createAccount(username, password, inviteToken)
  }

  async function createInvite(ttlMs = 1000 * 60 * 60 * 24): Promise<{ readonly token: string, readonly invite: Awaited<ReturnType<SyncAuthStore['createInvite']>> }> {
    const token = randomBytes(32).toString('base64url')
    const createdAt = now()
    const invite = await options.auth.createInvite({
      createdAt,
      expiresAt: createdAt + ttlMs,
      tokenHash: tokenHash(token),
    })
    return { invite, token }
  }

  async function login(username: string, password: string, request: Request, headers: Headers): Promise<{ readonly accountId: string, readonly csrfToken: string, readonly username: string } | null> {
    const account = await options.auth.findAccountByUsername(username)
    if (!account || !(await argon2.verify(account.passwordHash, password)))
      return null
    const token = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(24).toString('base64url')
    await options.auth.createSession({
      accountId: account.accountId,
      createdAt: now(),
      csrfToken,
      expiresAt: now() + sessionDurationMs,
      tokenHash: tokenHash(token),
    })
    const secure = options.secureCookies ?? new URL(request.url).protocol === 'https:'
    headers.append('set-cookie', `${sessionCookie}=${token}; Max-Age=${sessionDurationMs / 1000}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`)
    headers.set('x-csrf-token', csrfToken)
    return { accountId: account.accountId, csrfToken, username: account.username }
  }

  async function verifyPassword(accountId: string, password: string): Promise<boolean> {
    const account = await options.auth.findAccountById(accountId)
    return account !== null && await argon2.verify(account.passwordHash, password)
  }

  async function logout(request: Request, headers: Headers): Promise<void> {
    const token = cookieValue(request)
    if (token)
      await options.auth.revokeSession(tokenHash(token))
    headers.append('set-cookie', `${sessionCookie}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`)
  }

  async function requireCsrf(request: Request, account: AuthenticatedBrowserAccount): Promise<void> {
    const supplied = request.headers.get('x-csrf-token')
    if (!supplied || !equalToken(supplied, account.csrfToken))
      throw new Error('CSRF token mismatch')
  }

  return { createInitialAccount, createInvite, current, login, logout, register, requireCsrf, verifyPassword }
}
