import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('./active-worktree-focus-after-delete', () => ({
  prepareActiveWorktreeFocusAfterDelete: () => vi.fn()
}))
vi.mock('./stale-workspace-list-toast', () => ({
  showWorkspaceListChangedToast: vi.fn()
}))
vi.mock('./beads-disposition-after-delete', () => ({
  runBeadsDispositionAfterDelete: vi.fn()
}))

import { toast } from 'sonner'
import { runBeadsDispositionAfterDelete } from './beads-disposition-after-delete'
import { runDialogForceDelete } from './delete-worktree-dialog-force-delete'

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

describe('runDialogForceDelete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('runs the beads disposition for the deleted target once the retry succeeds', async () => {
    const worktree = makeWorktree()
    const removeWorktree = vi.fn().mockResolvedValue({ ok: true, restarted: false })
    const closeModal = vi.fn()
    const onDeleted = vi.fn()
    const runBeadsDisposition = vi.fn().mockResolvedValue(null)

    runDialogForceDelete({
      worktreeId: 'wt-1',
      currentWorktrees: [worktree],
      removeWorktree,
      closeModal,
      onDeleted,
      hostId: null,
      runBeadsDisposition
    })

    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(runBeadsDispositionAfterDelete).toHaveBeenCalledWith({
      deletedTargets: [{ id: 'wt-1', executionHostId: null }],
      worktreeId: 'wt-1',
      hostId: null,
      run: runBeadsDisposition
    })
  })

  it('never runs the disposition when the force-delete retry itself fails', async () => {
    const worktree = makeWorktree()
    const removeWorktree = vi.fn().mockResolvedValue({ ok: false, error: 'still dirty' })
    const closeModal = vi.fn()
    const onDeleted = vi.fn()
    const runBeadsDisposition = vi.fn()

    runDialogForceDelete({
      worktreeId: 'wt-1',
      currentWorktrees: [worktree],
      removeWorktree,
      closeModal,
      onDeleted,
      hostId: null,
      runBeadsDisposition
    })

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(onDeleted).not.toHaveBeenCalled()
    expect(runBeadsDispositionAfterDelete).not.toHaveBeenCalled()
  })
})
