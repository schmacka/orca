import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'

const { listMock, claimMock } = vi.hoisted(() => ({ listMock: vi.fn(), claimMock: vi.fn() }))

vi.mock('../beads/beads-read-service', () => ({
  countBeadsIssues: vi.fn(),
  getBeadsChangeToken: vi.fn(),
  getBeadsIssueDetails: vi.fn(),
  getBeadsSchema: vi.fn(),
  getBeadsWorkspaceStatus: vi.fn(),
  listBeadsIssues: listMock
}))

vi.mock('../beads/beads-write-service', () => ({
  addBeadsComment: vi.fn(),
  claimBeadsIssue: claimMock,
  closeBeadsIssue: vi.fn(),
  createBeadsIssue: vi.fn(),
  deferBeadsIssue: vi.fn(),
  deleteBeadsIssue: vi.fn(),
  reopenBeadsIssue: vi.fn(),
  undeferBeadsIssue: vi.fn(),
  updateBeadsIssue: vi.fn()
}))

import { BeadsError } from '../beads/beads-error'
import { RuntimeBeadsCommands } from './runtime-beads-commands'
import {
  installRuntimeBeadsCommandSurface,
  type RuntimeBeadsCommandSurface
} from './runtime-beads-command-surface'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the commands only read id, path and connectionId from the resolved repo.
const REPO = { id: 'r1', path: '/srv/repo', connectionId: null } as Repo

function makeCommands(): RuntimeBeadsCommands {
  return new RuntimeBeadsCommands({
    resolveRepo: vi.fn(async () => REPO),
    getLocalGitArgs: () => [{ wslDistro: 'Ubuntu' }]
  })
}

beforeEach(() => {
  listMock.mockReset()
  claimMock.mockReset()
})

describe('RuntimeBeadsCommands', () => {
  it('resolves the repo selector to an execution target and wraps the result', async () => {
    listMock.mockResolvedValue({ issues: [], hasMore: false })
    const request = { view: 'ready' as const, filter: {}, limit: 200 }
    await expect(makeCommands().beadsListIssues('id:r1', request)).resolves.toEqual({
      ok: true,
      value: { issues: [], hasMore: false }
    })
    expect(listMock).toHaveBeenCalledWith(
      { repoPath: '/srv/repo', connectionId: null, wslDistro: 'Ubuntu' },
      request
    )
  })

  it('returns typed failures instead of throwing', async () => {
    claimMock.mockRejectedValue(new BeadsError('busy', 'locked'))
    await expect(makeCommands().beadsClaimIssue('id:r1', 'p-1', 'me')).resolves.toEqual({
      ok: false,
      error: { kind: 'busy', message: 'locked' }
    })
  })

  it('installs every beads method on a runtime surface', () => {
    const commands = makeCommands()
    const surface: Partial<RuntimeBeadsCommandSurface> = {}
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: installRuntimeBeadsCommandSurface fills every surface key, which the loop below verifies.
    installRuntimeBeadsCommandSurface(surface as RuntimeBeadsCommandSurface, commands)
    for (const name of Object.getOwnPropertyNames(RuntimeBeadsCommands.prototype)) {
      if (name.startsWith('beads')) {
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: names are filtered to own beads* prototype methods, which the surface installs one-to-one.
        expect(typeof surface[name as keyof RuntimeBeadsCommandSurface]).toBe('function')
      }
    }
  })
})
