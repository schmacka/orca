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
import { runLineageDeleteAll } from './delete-worktree-lineage-delete-all'

function makeWorktree(id: string): Worktree {
  return {
    id,
    instanceId: `${id}-instance`,
    repoId: 'repo-1',
    path: `/workspaces/${id}`,
    head: 'abc123',
    branch: id,
    isBare: false,
    isMainWorktree: false,
    displayName: id,
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

describe('runLineageDeleteAll', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("runs the parent worktree's beads disposition once the lineage delete resolves", async () => {
    const parent = makeWorktree('parent')
    const child = makeWorktree('child')
    const deleted: WorktreeRemovalTarget[] = [
      { id: 'child', executionHostId: null },
      { id: 'parent', executionHostId: null }
    ]
    vi.mocked(runWorktreeDeletesInParallel).mockResolvedValue(deleted)
    const closeModal = vi.fn()
    const onDeleted = vi.fn()
    const runBeadsDisposition = vi.fn().mockResolvedValue(null)

    runLineageDeleteAll({
      deleteAllTargetCount: 2,
      lineageDeleteIdentities: [child, parent],
      resolveConfirmedTargets: () => [child, parent],
      forceOnConfirm: true,
      onForceDeleted: vi.fn(),
      closeModal,
      onDeleted,
      worktreeId: 'parent',
      hostId: null,
      runBeadsDisposition
    })

    expect(closeModal).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalledWith(deleted))
    expect(runBeadsDispositionAfterDelete).toHaveBeenCalledWith({
      deletedTargets: deleted,
      worktreeId: 'parent',
      hostId: null,
      run: runBeadsDisposition
    })
  })

  it('still reports the (empty) result to the disposition helper when the lineage delete fails', async () => {
    const parent = makeWorktree('parent')
    const child = makeWorktree('child')
    vi.mocked(runWorktreeDeletesInParallel).mockResolvedValue([])
    const onDeleted = vi.fn()
    const runBeadsDisposition = vi.fn()

    runLineageDeleteAll({
      deleteAllTargetCount: 2,
      lineageDeleteIdentities: [child, parent],
      resolveConfirmedTargets: () => [child, parent],
      forceOnConfirm: true,
      onForceDeleted: vi.fn(),
      closeModal: vi.fn(),
      onDeleted,
      worktreeId: 'parent',
      hostId: null,
      runBeadsDisposition
    })

    await vi.waitFor(() => expect(runBeadsDispositionAfterDelete).toHaveBeenCalled())
    expect(onDeleted).not.toHaveBeenCalled()
    expect(runBeadsDispositionAfterDelete).toHaveBeenCalledWith({
      deletedTargets: [],
      worktreeId: 'parent',
      hostId: null,
      run: runBeadsDisposition
    })
  })
})
