import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { WorktreeRemovalTarget } from '../../../../shared/worktree/removal'
import type { BeadsResult } from '../../../../shared/beads/beads-contract'
import type { BeadsIssueDetails } from '../../../../shared/beads/beads-issue-types'

/**
 * Runs the disposition captured for one worktree once its delete is confirmed
 * to have succeeded. A failed close/unclaim only warns: the worktree delete
 * already succeeded and must never be reported as failed or undone by this.
 */
export function runBeadsDispositionAfterDelete(args: {
  deletedTargets: readonly WorktreeRemovalTarget[]
  worktreeId: string
  hostId: ExecutionHostId | null
  run: () => Promise<BeadsResult<BeadsIssueDetails> | null>
}): void {
  const { deletedTargets, worktreeId, hostId, run } = args
  const wasDeleted = deletedTargets.some(
    (target) => target.id === worktreeId && target.executionHostId === hostId
  )
  if (!wasDeleted) {
    return
  }
  const warn = (description: string): void => {
    toast.warning(
      translate(
        'auto.components.sidebar.beadsDispositionAfterDeleteFailed',
        'Could not update the linked bead'
      ),
      { description }
    )
  }
  run()
    .then((result) => {
      if (result && !result.ok) {
        warn(result.error.message)
      }
    })
    .catch((err: unknown) => warn(err instanceof Error ? err.message : String(err)))
}
