# Registration, Authentication, and Pairing Contract

Type: grilling
Status: resolved
Blocked by: 01, 04

## Question

What exact security contract supports disabled, invite-only, and public registration while separating browser sessions from device synchronization credentials?

Decide account creation and invite lifecycle, password/passkey/recovery requirements, session and CSRF model, rate limits, one-time pairing challenge and dual confirmation flow, device-key storage, credential scope/expiry/rotation/revocation, PeerId binding, replay protection, step-up authentication for destructive operations, and audit requirements.

## Answer

The security and pairing contract is:

1. Registration is a deployment configuration with three values: `disabled` blocks only new account creation, `invite` requires a valid single-use invite, and `public` permits registration subject to rate and abuse controls. Changing the mode does not delete accounts, invites, or devices and does not force existing sessions to log out.
2. Accounts use a password protected by a strong Argon2id hash. Email is not required. Passkeys may be added for enhanced login and step-up authentication. Recovery uses one-time recovery codes or a server-admin reset flow; plaintext passwords, recovery codes, and invite tokens are never logged. Browser sessions use Secure, HttpOnly, SameSite cookies with server-side session records, CSRF protection on state-changing requests, and rate limits on login, registration, recovery, and pairing endpoints.
3. Server administrators create high-entropy, short-TTL, single-use, revocable invites. An invite is consumed atomically only after account creation succeeds; invalid, expired, revoked, and already-consumed invites have indistinguishable failure responses.
4. Pairing requires dual confirmation. A logged-in web user starts `Add Device`, the server creates a one-time `PairingSession`, and the client enters the server URL plus challenge/code. The client displays the target account/domain/device identity, the web user confirms the pending device, and the client confirms the account/device before the server issues the device credential. The challenge is bound to Account, device public key, PeerId, TTL, nonce, and current MembershipEpoch, and is invalidated after success, rejection, or timeout.
5. Each client device generates its own signing keypair. The private key remains in client secure storage. The server stores the public key together with Account, DeviceId, PeerId, credential scope, issuance/expiry metadata, and revocation state. PeerId/Noise authentication alone is insufficient. Revocation is checked when a session starts and at batch boundaries; credentials can be rotated without changing the local DeviceId, and old credentials are immediately rejected.
6. Device protocol messages carry authenticated account/device context, a monotonic per-device sequence or nonce, and an idempotency key. The server rejects stale membership epochs, duplicate mutations are acknowledged idempotently, and replayed or out-of-window messages fail with stable protocol errors. Synchronization credentials are separate from browser sessions and cannot call management APIs.
7. Step-up authentication is required to clear authoritative data, recent authentication is required to revoke a device, and a server-admin session plus step-up is required to change registration policy. Display-name and status changes do not require step-up. Every security-sensitive action records actor, account, device (when present), request id, timestamp, result, and reason, but never payloads or plaintext credentials.
8. Clearing authoritative data is an account-scoped destructive operation: it advances the reset generation, removes server-held Note, Personal Learning Sync, and asset data according to the repository contract, invalidates stale sync cursors/credentials through the membership epoch, and preserves account metadata and explicit device memberships unless a later account-deletion flow says otherwise. The management UI and API must state that cleared authoritative data cannot be recovered offline from the server; only data still present on an authorized client or another peer can repopulate it.
