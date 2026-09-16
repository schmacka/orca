import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BeadsResult } from '../../../../shared/beads/beads-contract'
import type { BeadsIssueDetails } from '../../../../shared/beads/beads-issue-types'
import type { WorktreeRemovalTarget } from '../../../../shared/worktree/removal'

vi.mock('sonner', () => ({
  toast: { warning: vi.fn() }
}))

import { toast } from 'sonner'
import { runBeadsDispositionAfterDelete } from './beads-disposition-after-delete'

function issueDetails(): BeadsIssueDetails {
  return {
    issue: {
      id: 'cwf.3',
      title: 'Test issue',
      status: 'open',
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

const target: WorktreeRemovalTarget = { id: 'wt-1', executionHostId: null }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runBeadsDispositionAfterDelete', () => {
  it('runs the disposition when its worktree is among the deleted targets', async () => {
    const run = vi.fn<() => Promise<BeadsResult<BeadsIssueDetails> | null>>(async () => ({
      ok: true,
      value: issueDetails()
    }))

    runBeadsDispositionAfterDelete({
      deletedTargets: [target],
      worktreeId: 'wt-1',
      hostId: null,
      run
    })
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
  })

  it('does not run for a delete that failed (target missing from deletedTargets)', () => {
    const run = vi.fn<() => Promise<BeadsResult<BeadsIssueDetails> | null>>()

    runBeadsDispositionAfterDelete({
      deletedTargets: [],
      worktreeId: 'wt-1',
      hostId: null,
      run
    })

    expect(run).not.toHaveBeenCalled()
  })

  it('does not run for a different worktree that happened to be deleted', () => {
    const run = vi.fn<() => Promise<BeadsResult<BeadsIssueDetails> | null>>()

    runBeadsDispositionAfterDelete({
      deletedTargets: [{ id: 'wt-2', executionHostId: null }],
      worktreeId: 'wt-1',
      hostId: null,
      run
    })

    expect(run).not.toHaveBeenCalled()
  })

  it('matches on host as well as id, not id alone', () => {
    const run = vi.fn<() => Promise<BeadsResult<BeadsIssueDetails> | null>>()

    runBeadsDispositionAfterDelete({
      deletedTargets: [{ id: 'wt-1', executionHostId: 'ssh:builder' }],
      worktreeId: 'wt-1',
      hostId: null,
      run
    })

    expect(run).not.toHaveBeenCalled()
  })

  it('warns without throwing when the disposition itself fails', async () => {
    const run = vi.fn<() => Promise<BeadsResult<BeadsIssueDetails> | null>>(async () => ({
      ok: false,
      error: { kind: 'failed', message: 'bd close failed' }
    }))

    runBeadsDispositionAfterDelete({
      deletedTargets: [target],
      worktreeId: 'wt-1',
      hostId: null,
      run
    })

    await vi.waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        'Could not update the linked bead',
        expect.objectContaining({ description: 'bd close failed' })
      )
    )
  })

  it('warns without throwing when the disposition rejects, never surfacing the rejection', async () => {
    const run = vi.fn<() => Promise<BeadsResult<BeadsIssueDetails> | null>>(() =>
      Promise.reject(new Error('bd not found'))
    )

    expect(() =>
      runBeadsDispositionAfterDelete({
        deletedTargets: [target],
        worktreeId: 'wt-1',
        hostId: null,
        run
      })
    ).not.toThrow()

    await vi.waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith(
        'Could not update the linked bead',
        expect.objectContaining({ description: 'bd not found' })
      )
    )
  })
})
