import type { DesktopP2pPairedDevice, DesktopP2pStatus } from '@memorilo/desktop-api'
import type { ElectronApplication, Page } from '@playwright/test'
import type Database from 'better-sqlite3'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test } from '@playwright/test'
import BetterSqlite3 from 'better-sqlite3'

interface P2pBridge {
  acceptInvitation: (invitation: string) => Promise<string>
  completePairing: (response: string) => Promise<DesktopP2pPairedDevice>
  createInvitation: () => Promise<string>
  getStatus: () => Promise<DesktopP2pStatus>
}

interface P2pRendererWindow extends Window {
  desktop: { p2p: P2pBridge }
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const desktopDirectory = resolve(repositoryRoot, 'apps/desktop')
const electronModule: unknown = createRequire(import.meta.url)('electron')
if (typeof electronModule !== 'string')
  throw new TypeError('Electron package did not resolve to an executable path')
const electronExecutablePath = electronModule

const currentDatabaseNotes = [
  {
    checkpointSequence: 4,
    createdAt: 1787250091307,
    id: '844d70ad-6cdb-49f0-a2b4-ff552b4e1f38',
    latestSequence: 4,
    snapshotBase64: [
      'bG9ybwAAAAAAAAAAAAAAAAhb1kQAA3MEAABMT1JPAAQiTRhgQIIuBAAA8AMAGgAaARABo8EQgD3gPB4BAQABAPAIBQEAAAEAKQgE',
      'AQAAIAQBAwAiBAAAAAgKABAkCgAQFgUAEB4FABAmBQDxXy7SAQJpZA1zY2hlbWFWZXJzaW9uD2xlYXJuaW5nRW5hYmxlZAV0aXRs',
      'ZQdlbnRyeUlkBGtpbmQJdG9waWNUeXBlCmVkaXRvck1vZGUMYmxvY2tUcmVlS2V5CG5vZGVOYW1lCmF0dHJpYnV0ZXMHIQDxGUlk',
      'B2NoZWNrZWQFb3JkZXIJY29sbGFwc2VkBHRleHQIbm90ZU1ldGFxAEFpZXMxbAD/uDplZTgyYmRkMi00ODI4LTRmNGUtYTA4My03',
      'MDkwZTUyZmI0YWI6YmxvY2tzCQECAgEAAwEBgFIBBBgIAAQCCgAEAgQAAwEEBAADAwYEAAUFCAAcAQAGAgMFCAQCIwUIAg8KCAIT',
      'CggCEwoIAhMKFBYICwEQDAsBEAYLARAGCwEQBgsBEAQLAjQBAKkCBSQ4NDRkNzBhZC02Y2RiLTQ5ZjAtYTJiNC1mZjU1MmI0ZTFm',
      'MzgDAQEFCjIwMjYtMDgtMjEABAABBSTGABEhBQXyAPEABQdyZWd1bGFyBQADAAUxFAAPBgEZYAALAAEFBIcB0wUDZG9jCAAADwAA',
      'AAsTAPM1BGxpc3QIBQUFB291dGxpbmULBSQxNTliMDczZi05NTU1LTQ1MjgtYmI2Mi1kZmQyNjUyYjJkODQMAg0ADgIAEwAAAA9L',
      'APEECXBhcmFncmFwaAgAABcAAAATBcoB9goJAgACAGZyAfHdr5uppP2soQEeAAIAdnYCEQDwCCCjg8OA2Ie4nh40AAwAoVn1IpNr',
      '7vEAAQDmEBoQARsC8e5rkyL1WaHmAgACABUy6QJgJAcEAAAB0AJwASYEAAIBMukCEC7aAhAKBQAQEgUANxqWAoUCcQZzdGF0dXPH',
      'AhEOMALxBUhpZ2hsaWdodAlzdGFydGVkQXQHCgCxQXQHZHVlRGF0ZQcpACBJZBAA9htUaW1lCnJlcGVhdFJ1bGUUY2FyZEl0ZW1E',
      'ZWZpbml0aW9uSWQFZW5kQXTaAiIJZeICJE1z/AJzBmFsbERheQMDoXJlbWluZGVycxBpAAWSADRJZA8bAPYDTWludXRlcwt0YXNr',
      'SGlzdG9yZAMBbwEPIgIf9AUMAQICBAAGAgGAAoGANwEEDwEACCcDwQUDBgANCAATBCYpAAQAZygPBAsDBQwD9QAGBAEBAxYBAO8B',
      'CBMBAAJJAp8DAAQABQAGAAdRAhP6FwgACQAKAAsADAINAwAOAg8CEAARABIAEwAIARQAAzEyMwAFAQABtwIPcAAF8AM0ZTllNzlj',
      'MS02NmY0LTQ0MjEkBO81LTIxZjJkYWMzYmE4N3AABm4ACQAAAAXUApUBFAAADQAAAAnWApAAowK0As8CBAAAAAAABaFiuAEAAAAF',
      'AAAADAAePOA9gBDBowAAAAABDAChWfUik2vu8QAAAACqXPdZRgQAAG4EAABMT1JPAAQiTRhgQIIBBAAA8RkAAgEAB2VudHJpZXME',
      'Bgl0b3BpY1R5cGUEB3JlZ3VsYXIEa2luZAQFGQDxAAxibG9ja1RyZWVLZXkEMS0A8Rc6ZWU4MmJkZDItNDgyOC00ZjRlLWEwODMt',
      'NzA5MGU1MmZiNGFiOjkAEXNpAF95SWQEJDUAEfAjBXRpdGxlBAAKZWRpdG9yTW9kZQMAAAGjwRCAPeA8HgAKAAkABQAGAAgABwkE',
      'AAsAAADNAA+WAB/yAAQDCmF0dHJpYnV0ZXMGAPEAYARub2RlCAUAl05hbWUEA2RvY3sAnw4ADAANCQQAD3UANIMTBnN0YXR1c30A',
      'kQdvdXRsaW5lDjcB8QdIaWdobGlnaHQACXN0YXJ0ZWRBdAAHCwAACQCRZHVlRGF0ZQAHLQAAXQHwQzE1OWIwNzNmLTk1NTUtNDUy',
      'OC1iYjYyLWRmZDI2NTJiMmQ4NAdkdWVUaW1lAApyZXBlYXRSdWxlABRjYXJkSXRlbURlZmluaXRpb25JZAAFZW5yAOIJY29sbGFw',
      'c2VkAQAJZQoAoE1zAwAHY2hlY2sWAPENBmFsbERheQEABW9yZGVyAAlyZW1pbmRlcnMAEJ0ABcoARElkAA8dADBNaW55AQP7AAt4',
      'AfUABGxpc3QAAvHua5Mi9Vmh/AGfGgEQAREJBAATgQE03wELdGFza0hpc3RvcnmLAAOvCXBhcmFncmFwaJAAAJ8bARQBFQkEABeQ',
      'ACcSAmoDUQR0ZXh0BQDIBwGjg8OA2Ie4nh4y+AJkGAAZAQwAEwEfBXIAJwn4Ag+DAjvwAzRlOWU3OWMxLTY2ZjQtNDQyMRUE7zUt',
      'MjFmMmRhYzNiYTg3gwKaFAFwAWcAIgAgACGBAR8JgQE0D4MCGwaQAFcmACQAJZAAHw2QACcPgwIAx/Hdr5uppP2soQEeAHUAdCgA',
      'KQANAAKQAxAZBwUmAwGxAmUuAQMxMjMwAPABAwQCAQACAQQCATQCAQYAADwABFEBEw88AAZqAGAaAQAAAwTHAPNPAAAACgCACG5v',
      'dGVNZXRhAAEABA1zY2hlbWFWZXJzaW9uAwIPbGVhcm5pbmdFbmFibGVkAQECaWQEJDg0NGQ3MGFkLTZjZGItNDlmMC1hMmI0LWZm',
      'NTUyYjRlMWYzOGEGtwoyMDI2LTA4LTIxXgaxAAACAAEAAwAJAIO3BlZpZXMDASAAIQQC0gAhCAUHAEEAAgEIBgAwAAkBGQCfAwEB',
      'gAAAMwCDjgYfJgMBVwEEIwFgBAIIBAAJYQD+BQAIDRYIExwIGwgFCA0ABAACBAEGHAAAEgCgNDMANAAIBwAAAUcB8BsMAQICBAAG',
      'AgGAAoGAAAAAxgA7AbwCTAO2AzcFxwU6BnYGoAYgB1sHDQAAAAAAmHHL9wEAAAAFAAAADQAAo8EQgD3gPB4EAAAAATMAgzF0b3Bp',
      'YzplZTgyYmRkMi00ODI4LTRmNGUtYTA4My03MDkwZTUyZmI0YWI6YmxvY2tzkHHL+RkEAAAAAAAA',
    ].join(''),
    title: '2026-08-21',
    updatedAt: 1787313803066,
  },
  {
    checkpointSequence: 1,
    createdAt: 1787331007597,
    id: '82358736-432e-45c4-a560-5bb7470b9e22',
    latestSequence: 1,
    snapshotBase64: [
      'bG9ybwAAAAAAAAAAAAAAALkg4vgAA+oDAABMT1JPAAQiTRhgQIKvAwAA9g4BubX5jf/C3+zSAQQAAgB2dgKWu6HU2O2g8bEBNBwA',
      '0AYADACx4oNtiohdlgABAPABGgAaARABll2Iim2D4rEBARQA8AkABQEAAAEAKQgEAQAAIAQBAwAiBAAAAAgKABAkCgAQFgUAEB4F',
      'ABAmBQDxXy7SAQJpZA1zY2hlbWFWZXJzaW9uD2xlYXJuaW5nRW5hYmxlZAV0aXRsZQdlbnRyeUlkBGtpbmQJdG9waWNUeXBlCmVk',
      'aXRvck1vZGUMYmxvY2tUcmVlS2V5CG5vZGVOYW1lCmF0dHJpYnV0ZXMHIQDxGUlkB2NoZWNrZWQFb3JkZXIJY29sbGFwc2VkBHRl',
      'eHQIbm90ZU1ldGFxAEFpZXMxbAD/uDplYWQzNjM3MC1jYmFlLTQ2MzUtYmM4YS0xY2I1OWFhM2M4YzY6YmxvY2tzCQECAgEAAwEB',
      'gFIBBBgIAAQCCgAEAgQAAwEEBAADAwYEAAUFCAAcAQAGAgMFCAQCIwUIAg8KCAITCggCEwoIAhMKFBYICwEQDAsBEAYLARAGCwEQ',
      'BgsBEAQLAjQBAKkCBSQ4MjM1ODczNi00MzJlLTQ1YzQtYTU2MC01YmI3NDcwYjllMjIDAQEFCjIwMjYtMDgtMjIABAABBSTGABEh',
      'BQXyAPEABQdyZWd1bGFyBQADAAUxFAAPBgEZYAALAAEFBIcB0wUDZG9jCAAADwAAAAsTAPM1BGxpc3QIBQUFB291dGxpbmULBSRm',
      'MWFkYzYyNC1lMjk5LTQ0YzMtOTM0MC03YzMzNjgyY2RjMzIMAg0ADgIAEwAAAA9LAPEECXBhcmFncmFwaAgAABcAAAATBcoB4AkC',
      'AAwA0tl+F/G+WrkAAQDmAxoDARsCuVq+8Rd+2dK6AgACABUyvQJgEAMEAAABpAKXASYEAAIBMtYBRQJxBnN0YXR1c4cCEQ7wAfEF',
      'SGlnaGxpZ2h0CXN0YXJ0ZWRBdAcKALFBdAdkdWVEYXRlBykAIElkEAD2G1RpbWUKcmVwZWF0UnVsZRRjYXJkSXRlbURlZmluaXRp',
      'b25JZAVlbmRBdJoCIgllogIkTXO8AnMGYWxsRGF5wwKhcmVtaW5kZXJzEGkABZIANElkDxsAME1pbgQD9RgLdGFza0hpc3RvcnkA',
      'EgEEBAEABAICBgAEBAsBBQIGAQBdCBMBAAKXAZ8DAAQABQAGAAefARPwGwgACQAKAAsADAINAwAOAg8CEAARABIAEwAIARQAAsWT',
      'AAAMACgA2gIEAAAAAAD8CtWkAQAAAAUAAAACAGZyAQwA0tl+F/G+WrkAAAAAnvCQJ8cDAACtAwAATE9STwAEIk0YYECCQAMAAPEZ',
      'AAIBAAdlbnRyaWVzBAYJdG9waWNUeXBlBAdyZWd1bGFyBGtpbmQEBRkA8QAMYmxvY2tUcmVlS2V5BDEtAPEXOmVhZDM2MzcwLWNi',
      'YWUtNDYzNS1iYzhhLTFjYjU5YWEzYzhjNjo5ABFzaQBfeUlkBCQ1ABHwIwV0aXRsZQQACmVkaXRvck1vZGUDAAABll2Iim2D4rEA',
      'CgAJAAUABgAIAAcJBAALAAAAzQAPlgAf8gAEAwphdHRyaWJ1dGVzBgDxAGAEbm9kZQgFAJdOYW1lBANkb2N7AJ8OAAwADQkEAA91',
      'ADSDEwZzdGF0dXN9AJEHb3V0bGluZQ43AfEHSGlnaGxpZ2h0AAlzdGFydGVkQXQABwsAAAkAkWR1ZURhdGUABy0AAF0B8ENmMWFk',
      'YzYyNC1lMjk5LTQ0YzMtOTM0MC03YzMzNjgyY2RjMzIHZHVlVGltZQAKcmVwZWF0UnVsZQAUY2FyZEl0ZW1EZWZpbml0aW9uSWQA',
      'BWVucgDiCWNvbGxhcHNlZAEACWUKAKBNcwMAB2NoZWNrFgDxDQZhbGxEYXkBAAVvcmRlcgAJcmVtaW5kZXJzABCdAAXKAERJZAAP',
      'HQAwTWlueQED+wALeAH1AARsaXN0AAK5Wr7xF37Z0vwBnxoBEAERCQQAE4EBNN8BC3Rhc2tIaXN0b3J5iwADrwlwYXJhZ3JhcGiQ',
      'AACfGwEUARUJBAAXkAAnEgJqA1EEdGV4dAUA2AcBlruh1NjtoPGxATL5AnQYABkADQACDQEQGYQCJwMBLgBkLgECxZMBNQHzXQME',
      'AgEAAgEEAgE0AgECAAAACgCACG5vdGVNZXRhAAEABA1zY2hlbWFWZXJzaW9uAwIPbGVhcm5pbmdFbmFibGVkAQECaWQEJDgyMzU4',
      'NzM2LTQzMmUtNDVjNC1hNTYwLTViYjc0NzBiOWUyMrQDtwoyMDI2LTA4LTIyNgOxAAACAAEAAwAJAIMKBFZpZXMDASAAIQQCqAAh',
      'CAUHAEEAAgEIBgAwAAkBGQCfAwEBgAAAMwCD4QMfC2UAxggABAEWBggFBQMABA8AUAIIAAUEvgEIbwDwBADGADsBvAJMA7cD8wNz',
      'BK4ECQAAAAAA5Kir6AEAAAAFAAAADQAAll2Iim2D4rEEAAAAATMAgzF0b3BpYzplYWQzNjM3MC1jYmFlLTQ2MzUtYmM4YS0xY2I1',
      'OWFhM2M4YzY6YmxvY2tzM22Oq1gDAAAAAAAA',
    ].join(''),
    title: '2026-08-22',
    updatedAt: 1787336610625,
  },
] as const

function seedSourceDatabase(databasePath: string): void {
  const database: Database.Database = new BetterSqlite3(databasePath)
  try {
    database.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE notes (
        row_id INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular', 'journal')),
        checkpoint_snapshot BLOB,
        checkpoint_sequence INTEGER NOT NULL DEFAULT 0 CHECK (checkpoint_sequence >= 0),
        latest_sequence INTEGER NOT NULL DEFAULT 0 CHECK (latest_sequence >= checkpoint_sequence),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE journals (
        note_row_id INTEGER PRIMARY KEY REFERENCES notes(row_id) ON DELETE CASCADE,
        journal_date TEXT NOT NULL UNIQUE,
        has_user_content INTEGER NOT NULL CHECK (has_user_content IN (0, 1))
      );
    `)
    const insertNote = database.prepare(`
      INSERT INTO notes (
        id, title, kind, checkpoint_snapshot, checkpoint_sequence,
        latest_sequence, created_at, updated_at
      ) VALUES (?, ?, 'journal', ?, ?, ?, ?, ?)
    `)
    const insertJournal = database.prepare(`
      INSERT INTO journals (note_row_id, journal_date, has_user_content)
      VALUES (?, ?, 1)
    `)
    database.transaction(() => {
      for (const note of currentDatabaseNotes) {
        const inserted = insertNote.run(
          note.id,
          note.title,
          Buffer.from(note.snapshotBase64, 'base64'),
          note.checkpointSequence,
          note.latestSequence,
          note.createdAt,
          note.updatedAt,
        )
        insertJournal.run(inserted.lastInsertRowid, note.title)
      }
    })()
    database.pragma('user_version = 1')
  }
  finally {
    database.close()
  }
}

function launchPeer(databasePath: string, deviceName: string, userDataDirectory: string): Promise<ElectronApplication> {
  return electron.launch({
    args: [desktopDirectory, `--user-data-dir=${userDataDirectory}`],
    cwd: repositoryRoot,
    env: {
      ...process.env,
      MEMORILO_DATABASE_PATH: databasePath,
      MEMORILO_DEVICE_NAME: deviceName,
      MEMORILO_EMBEDDING_MODEL_OFFLINE: '1',
      MEMORILO_E2E_HIDE_WINDOW: '1',
      MEMORILO_SHELF_IMAGE_CACHE_PATH: ':memory:',
    },
    executablePath: electronExecutablePath,
  })
}

async function waitForApplication(window: Page): Promise<void> {
  await window.getByRole('link', { name: 'Journals' }).waitFor()
}

test('synchronizes the captured existing database to a new peer', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'memorilo-p2p-existing-database-'))
  const sourceDatabasePath = resolve(directory, 'source.sqlite')
  const destinationDatabasePath = resolve(directory, 'destination.sqlite')
  seedSourceDatabase(sourceDatabasePath)
  let sourceApplication: ElectronApplication | null = null
  let destinationApplication: ElectronApplication | null = null
  try {
    sourceApplication = await launchPeer(sourceDatabasePath, 'Captured database', resolve(directory, 'source-user-data'))
    destinationApplication = await launchPeer(destinationDatabasePath, 'New peer', resolve(directory, 'destination-user-data'))
    const sourceWindow = await sourceApplication.firstWindow()
    const destinationWindow = await destinationApplication.firstWindow()
    await Promise.all([waitForApplication(sourceWindow), waitForApplication(destinationWindow)])

    const invitation = await sourceWindow.evaluate(() => (
      (window as unknown as P2pRendererWindow).desktop.p2p.createInvitation()
    ))
    const response = await destinationWindow.evaluate(invitationCode => (
      (window as unknown as P2pRendererWindow).desktop.p2p.acceptInvitation(invitationCode)
    ), invitation)
    await sourceWindow.evaluate(pairingResponse => (
      (window as unknown as P2pRendererWindow).desktop.p2p.completePairing(pairingResponse)
    ), response)

    await expect.poll(() => destinationWindow.evaluate(() => (
      (window as unknown as P2pRendererWindow).desktop.p2p.getStatus()
    )), { timeout: 20_000 }).toMatchObject({
      devices: [{ deviceName: 'Captured database', error: null, state: 'synced' }],
      error: null,
      state: 'ready',
    })

    await destinationWindow.getByRole('link', { name: 'Pages' }).click()
    await expect(destinationWindow.getByRole('main', { name: 'Pages' })).toBeVisible()
    await expect(destinationWindow.getByRole('button', { name: 'Open Note: 2026-08-21' })).toBeVisible()
    await expect(destinationWindow.getByRole('button', { name: 'Open Note: 2026-08-22' }).first()).toBeVisible()
    await destinationWindow.getByRole('button', { name: 'Open Note: 2026-08-21' }).click()
    await expect(destinationWindow.getByRole('textbox', { name: 'Editor content' })).toContainText('123')
  }
  finally {
    await Promise.all([
      sourceApplication?.close(),
      destinationApplication?.close(),
    ])
    await rm(directory, { force: true, recursive: true })
  }
})
