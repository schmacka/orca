import { beforeEach, describe, it, expect, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import type { BeadsResult } from '../../../../shared/beads/beads-contract'
import type { BeadsIssueDetails } from '../../../../shared/beads/beads-issue-types'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'

const mocks = vi.hoisted(() => {
  const closeBeadsIssue =
    vi.fn<
      (repo: BeadsRepoRef, id: string, reason: string) => Promise<BeadsResult<BeadsIssueDetails>>
    >()
  const unclaimBeadsIssue =
    vi.fn<(repo: BeadsRepoRef, id: string) => Promise<BeadsResult<BeadsIssueDetails>>>()

  const repo: Repo = {
    id: 'repo-1',
    path: '/work/app',
    displayName: 'app',
    badgeColor: '#000000',
    addedAt: 0,
    connectionId: null,
    executionHostId: null
  }

  const store = {
    closeBeadsIssue,
    unclaimBeadsIssue
  }

  return { store, closeBeadsIssue, unclaimBeadsIssue, repo }
})

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => mocks.store
  }
}))

import { beadsDispositionNeeded, runBeadsDisposition } from './beads-worktree-disposition'

const BEAD_WORKTREE = {
  linkedWorkItem: { provider: 'beads' as const, beadsIdentifier: 'cwf.3' },
  beadStatusCategory: 'wip' as const
}

const REPO_REF: BeadsRepoRef = {
  id: 'repo-1',
  path: '/work/app',
  connectionId: null,
  executionHostId: null
}

describe('beadsDispositionNeeded', () => {
  // 'wip' is the case that matters: a claimed bead is in_progress.
  it('asks when a claimed bead is removed', () => {
    expect(beadsDispositionNeeded(BEAD_WORKTREE)).toBe(true)
  })

  it('asks for an open bead', () => {
    expect(beadsDispositionNeeded({ ...BEAD_WORKTREE, beadStatusCategory: 'active' })).toBe(true)
  })

  it('asks for a deferred bead', () => {
    expect(beadsDispositionNeeded({ ...BEAD_WORKTREE, beadStatusCategory: 'frozen' })).toBe(true)
  })

  it('stays quiet when the bead is already closed', () => {
    expect(beadsDispositionNeeded({ ...BEAD_WORKTREE, beadStatusCategory: 'done' })).toBe(false)
  })

  it('stays quiet for another provider', () => {
    expect(
      beadsDispositionNeeded({
        linkedWorkItem: { provider: 'jira' as const },
        beadStatusCategory: null
      })
    ).toBe(false)
  })

  it('stays quiet with no linked item', () => {
    expect(beadsDispositionNeeded({ linkedWorkItem: null, beadStatusCategory: null })).toBe(false)
  })

  it('stays quiet when the status is unknown, rather than prompting about a bead it cannot describe', () => {
    expect(beadsDispositionNeeded({ ...BEAD_WORKTREE, beadStatusCategory: null })).toBe(false)
  })
})

describe('runBeadsDisposition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for leave disposition', async () => {
    const result = await runBeadsDisposition({
      disposition: 'leave',
      repo: REPO_REF,
      issueId: 'cwf.3',
      reason: ''
    })
    expect(result).toBeNull()
  })

  it('calls unclaimBeadsIssue for unclaim disposition', async () => {
    mocks.unclaimBeadsIssue.mockResolvedValue({ ok: true, value: {} as BeadsIssueDetails })

    await runBeadsDisposition({
      disposition: 'unclaim',
      repo: REPO_REF,
      issueId: 'cwf.3',
      reason: ''
    })

    expect(mocks.unclaimBeadsIssue).toHaveBeenCalledWith(REPO_REF, 'cwf.3')
  })

  it('calls closeBeadsIssue for close disposition with reason', async () => {
    mocks.closeBeadsIssue.mockResolvedValue({ ok: true, value: {} as BeadsIssueDetails })

    await runBeadsDisposition({
      disposition: 'close',
      repo: REPO_REF,
      issueId: 'cwf.3',
      reason: 'Completed'
    })

    expect(mocks.closeBeadsIssue).toHaveBeenCalledWith(REPO_REF, 'cwf.3', 'Completed')
  })

  it('refuses empty reason for close disposition', async () => {
    await runBeadsDisposition({
      disposition: 'close',
      repo: REPO_REF,
      issueId: 'cwf.3',
      reason: ''
    })

    expect(mocks.closeBeadsIssue).not.toHaveBeenCalled()
  })

  it('refuses whitespace-only reason for close disposition', async () => {
    await runBeadsDisposition({
      disposition: 'close',
      repo: REPO_REF,
      issueId: 'cwf.3',
      reason: '   '
    })

    expect(mocks.closeBeadsIssue).not.toHaveBeenCalled()
  })
})
