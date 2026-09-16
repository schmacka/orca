import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { Worktree } from '../../../../shared/worktree/types'
import {
  toWorktreeRemovalTarget,
  type WorktreeRemovalTarget
} from '../../../../shared/worktree/removal'
import type { RemoveWorktreeOptions } from '@/store/slices/worktree-removal-options'
import type { RendererRemoveWorktreeResult } from '@/store/slices/renderer-remove-worktree-result'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { BeadsResult } from '../../../../shared/beads/beads-contract'
import type { BeadsIssueDetails } from '../../../../shared/beads/beads-issue-types'
import { prepareActiveWorktreeFocusAfterDelete } from './active-worktree-focus-after-delete'
import { showWorkspaceListChangedToast } from './stale-workspace-list-toast'
import { runBeadsDispositionAfterDelete } from './beads-disposition-after-delete'

/**
 * The dialog's explicit "Force Delete" retry.
 *
 * Runs the destructive retry directly rather than through the shared toast
 * wrapper, preserving the legacy button behaviour, and closes immediately
 * because the workspace cards already show the deleting state.
 */
export function runDialogForceDelete(args: {
  worktreeId: string
  currentWorktrees: readonly Worktree[]
  removeWorktree: (
    target: WorktreeRemovalTarget,
    force?: boolean,
    options?: RemoveWorktreeOptions
  ) => Promise<({ ok: true } & RendererRemoveWorktreeResult) | { ok: false; error: string }>
  closeModal: () => void
  onDeleted: ((deleted: WorktreeRemovalTarget[]) => void) | null | undefined
  hostId: ExecutionHostId | null
  runBeadsDisposition: () => Promise<BeadsResult<BeadsIssueDetails> | null>
}): void {
  const {
    worktreeId,
    currentWorktrees,
    removeWorktree,
    closeModal,
    onDeleted,
    hostId,
    runBeadsDisposition
  } = args
  // Why: this branch preserves the legacy "Force Delete" button behavior
  // inside the dialog — it runs the destructive retry directly without
  // the shared toast wrapper. Close immediately because workspace cards
  // already show the deleting state while the retry runs.
  // Why the lookup (STA-4343): the confirmed row carries the host the
  // removal must land on; a bare id would let force delete another host's
  // checkout at the same path.
  const forceTarget = currentWorktrees.find((entry) => entry.id === worktreeId)
  if (!forceTarget) {
    // Same recovery as a stale confirmed batch: say so and close, rather
    // than leaving a destructive button that silently does nothing.
    showWorkspaceListChangedToast()
    closeModal()
    return
  }
  const commitFocus = prepareActiveWorktreeFocusAfterDelete(worktreeId)
  // Why (#11960): this IS the explicit Force Delete, so it may also waive
  // the PTY-stop proof — unlike the confirmed delete in the branch below.
  const deletePromise = removeWorktree(toWorktreeRemovalTarget(forceTarget), true, {
    allowUnverifiedPtyStop: true
  })
  closeModal()
  deletePromise
    .then((result) => {
      if (!result.ok) {
        toast.error(
          translate(
            'auto.components.sidebar.DeleteWorktreeDialog.42e610d6cf',
            'Force delete failed'
          ),
          {
            description: result.error
          }
        )
        return
      }
      commitFocus()
      const deleted = [toWorktreeRemovalTarget(forceTarget)]
      onDeleted?.(deleted)
      runBeadsDispositionAfterDelete({
        deletedTargets: deleted,
        worktreeId,
        hostId,
        run: runBeadsDisposition
      })
    })
    .catch((err: unknown) => {
      toast.error(
        translate(
          'auto.components.sidebar.DeleteWorktreeDialog.4f6750ca7b',
          'Failed to delete workspace'
        ),
        {
          description: err instanceof Error ? err.message : String(err)
        }
      )
    })
}
