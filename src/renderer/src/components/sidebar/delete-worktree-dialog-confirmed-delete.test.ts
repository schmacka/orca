import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'
import type { WorktreeRemovalTarget } from '../../../../shared/worktree/removal'

vi.mock('./delete-worktree-flow', () => ({
  runWorktreeDeletesInParallel: vi.fn()
}))
vi.mock('./beads-disposition-after-delete', () => ({
  runBeadsDispositionAfterDelete: vi.fn()
}))

import { runWorktreeDeletesInParallel } from './delete-worktree-flow'
import { runBeadsDispositionAfterDelete } from './beads-disposition-after-delete'
import { runDialogConfirmedDelete } from './delete-worktree-dialog-confirmed-delete'

function makeWorktree(): Worktree {
  return {
    id: 'wt-1',
    instanceId: 'wt-1-instance',
    repoId: 'repo-1',
    path: '/workspaces/wt-1',
    head: 'abc123',
    branch: 'wt-1',
    isBare: false,
    isMainWorktree: false,
    displayName: 'wt-1',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1
  }
}

describe('runDialogConfirmedDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs the disposition for the confirmed target once the delete resolves', async () => {
    const deleted: WorktreeRemovalTarget[] = [{ id: 'wt-1', executionHostId: null }]
    vi.mocked(runWorktreeDeletesInParallel).mockResolvedValue(deleted)
    const closeModal = vi.fn()
    const onDeleted = vi.fn()
    const runBeadsDisposition = vi.fn().mockResolvedValue(null)

    runDialogConfirmedDelete({
      currentWorktrees: [makeWorktree()],
      forceOnConfirm: true,
      onForceDeleted: vi.fn(),
      closeModal,
      onDeleted,
      worktreeId: 'wt-1',
      hostId: null,
      runBeadsDisposition
    })

    expect(closeModal).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith(deleted))
    expect(runBeadsDispositionAfterDelete).toHaveBeenCalledWith({
      deletedTargets: deleted,
      worktreeId: 'wt-1',
      hostId: null,
      run: runBeadsDisposition
    })
  })

  it('reports no deleted targets to the disposition helper when the delete fails', async () => {
    vi.mocked(runWorktreeDeletesInParallel).mockResolvedValue([])
    const onDeleted = vi.fn()
    const runBeadsDisposition = vi.fn()

    runDialogConfirmedDelete({
      currentWorktrees: [makeWorktree()],
      forceOnConfirm: true,
      onForceDeleted: vi.fn(),
      closeModal: vi.fn(),
      onDeleted,
      worktreeId: 'wt-1',
      hostId: null,
      runBeadsDisposition
    })

    await vi.waitFor(() => expect(runBeadsDispositionAfterDelete).toHaveBeenCalled())
    expect(onDeleted).not.toHaveBeenCalled()
    expect(runBeadsDispositionAfterDelete).toHaveBeenCalledWith({
      deletedTargets: [],
      worktreeId: 'wt-1',
      hostId: null,
      run: runBeadsDisposition
    })
  })
})
