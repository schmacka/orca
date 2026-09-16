import type { Worktree } from '../../../../shared/worktree/types'
import type { WorktreeRemovalTarget } from '../../../../shared/worktree/removal'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { BeadsResult } from '../../../../shared/beads/beads-contract'
import type { BeadsIssueDetails } from '../../../../shared/beads/beads-issue-types'
import { runWorktreeDeletesInParallel } from './delete-worktree-flow'
import { runBeadsDispositionAfterDelete } from './beads-disposition-after-delete'

/**
 * The dialog's primary (non-force) confirmed delete.
 *
 * Runs through the shared toast wrapper, closing immediately because the
 * workspace cards already show the deleting state while it runs.
 */
export function runDialogConfirmedDelete(args: {
  currentWorktrees: readonly Worktree[]
  forceOnConfirm: boolean
  onForceDeleted: (target: WorktreeRemovalTarget) => void
  closeModal: () => void
  onDeleted: ((deleted: WorktreeRemovalTarget[]) => void) | null | undefined
  worktreeId: string
  hostId: ExecutionHostId | null
  runBeadsDisposition: () => Promise<BeadsResult<BeadsIssueDetails> | null>
}): void {
  const deletePromise = runWorktreeDeletesInParallel(args.currentWorktrees, {
    force: args.forceOnConfirm,
    onForceDeleted: args.onForceDeleted
  })
  // Why: the workspace card owns the in-progress feedback, so the
  // confirmation should get out of the way as soon as deletion begins.
  args.closeModal()
  void deletePromise.then((deletedTargets) => {
    if (deletedTargets.length > 0) {
      args.onDeleted?.(deletedTargets)
    }
    runBeadsDispositionAfterDelete({
      deletedTargets,
      worktreeId: args.worktreeId,
      hostId: args.hostId,
      run: args.runBeadsDisposition
    })
  })
}
