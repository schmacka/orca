import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { Repo } from '../../../shared/repo-types'
import type { WorkspaceLinkedItem } from '../../../shared/worktree/types'
import type { BeadsResult } from '../../../shared/beads/beads-contract'
import type { BeadsIssueDetails } from '../../../shared/beads/beads-issue-types'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn()
  }
}))

// Why: the module reads only `settings.beadsAutoClaim`, `repos`, and calls
// `claimBeadsIssue` — a minimal store keeps the fixture honest about what the
// production code actually touches, rather than a full AppState mock.
type TestSettings = Pick<GlobalSettings, 'beadsAutoClaim'> | null

const claimBeadsIssue =
  vi.fn<(repo: BeadsRepoRef, id: string) => Promise<BeadsResult<BeadsIssueDetails>>>()

const REPO: Repo = {
  id: 'repo-1',
  path: '/work/app',
  displayName: 'app',
  badgeColor: '#000000',
  addedAt: 0,
  connectionId: null,
  executionHostId: null
}

const store: { settings: TestSettings; repos: Repo[]; claimBeadsIssue: typeof claimBeadsIssue } = {
  settings: { beadsAutoClaim: true },
  repos: [REPO],
  claimBeadsIssue
}

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))

import { autoClaimBeadsWorktree, type BeadsAutoClaimWorktree } from './beads-worktree-auto-claim'

const BEADS_LINKED_ITEM: WorkspaceLinkedItem = {
  provider: 'beads',
  type: 'issue',
  number: 0,
  title: 'cwf.3 Wire up auto-claim',
  url: 'bd://cwf.3',
  beadsIdentifier: 'cwf.3',
  repoId: 'repo-1'
}

const GITHUB_LINKED_ITEM: WorkspaceLinkedItem = {
  provider: 'github',
  type: 'issue',
  number: 42,
  title: 'Some GitHub issue',
  url: 'https://github.com/example/repo/issues/42'
}

function worktree(overrides: Partial<BeadsAutoClaimWorktree> = {}): BeadsAutoClaimWorktree {
  return {
    id: 'repo-1::/work/app/.worktrees/wt',
    repoId: 'repo-1',
    linkedWorkItem: BEADS_LINKED_ITEM,
    ...overrides
  }
}

function issueDetails(): BeadsIssueDetails {
  return {
    issue: {
      id: 'cwf.3',
      title: 'Wire up auto-claim',
      status: 'in_progress',
      priority: 1,
      issueType: 'task',
      labels: [],
      createdAt: '2026-09-16T00:00:00.000Z',
      updatedAt: '2026-09-16T00:00:00.000Z',
      dependencyCount: 0,
      dependentCount: 0,
      commentCount: 0,
      blockedBy: [],
      dependencyEdges: []
    },
    dependencies: [],
    dependents: [],
    comments: []
  }
}

function okResult(): BeadsResult<BeadsIssueDetails> {
  return { ok: true, value: issueDetails() }
}

beforeEach(() => {
  vi.clearAllMocks()
  store.settings = { beadsAutoClaim: true }
  store.repos = [REPO]
})

describe('autoClaimBeadsWorktree', () => {
  it('claims the linked bead using the repo from state.repos and the current actor via the store', async () => {
    claimBeadsIssue.mockResolvedValueOnce(okResult())

    await autoClaimBeadsWorktree(worktree())

    expect(claimBeadsIssue).toHaveBeenCalledTimes(1)
    const [repoArg, idArg] = claimBeadsIssue.mock.calls[0]
    expect(repoArg).toEqual({
      id: 'repo-1',
      path: '/work/app',
      connectionId: null,
      executionHostId: null
    })
    expect(idArg).toBe('cwf.3')
    expect(toast.success).toHaveBeenCalledWith('Claimed cwf.3')
  })

  it('does not claim when the linked item is not a bead', async () => {
    await autoClaimBeadsWorktree(worktree({ linkedWorkItem: GITHUB_LINKED_ITEM }))

    expect(claimBeadsIssue).not.toHaveBeenCalled()
  })

  it('does not claim when the linked item is missing', async () => {
    await autoClaimBeadsWorktree(worktree({ linkedWorkItem: null }))

    expect(claimBeadsIssue).not.toHaveBeenCalled()
  })

  it('does not claim when beadsAutoClaim is false', async () => {
    store.settings = { beadsAutoClaim: false }

    await autoClaimBeadsWorktree(worktree())

    expect(claimBeadsIssue).not.toHaveBeenCalled()
  })

  it('warns and resolves without throwing when the claim rejects', async () => {
    claimBeadsIssue.mockRejectedValueOnce(new Error('bd busy'))

    await expect(autoClaimBeadsWorktree(worktree())).resolves.toBeUndefined()

    expect(toast.warning).toHaveBeenCalledWith('Could not claim cwf.3: bd busy')
  })

  it('warns without throwing when the claim resolves as a tracked failure', async () => {
    claimBeadsIssue.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'busy', message: 'bd database is locked' }
    })

    await expect(autoClaimBeadsWorktree(worktree())).resolves.toBeUndefined()

    expect(toast.warning).toHaveBeenCalledWith('Could not claim cwf.3: bd database is locked')
  })
})
