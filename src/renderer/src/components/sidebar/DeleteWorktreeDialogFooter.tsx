import type { JSX, Ref } from 'react'
import { LoaderCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function DeleteWorktreeDialogFooter({
  isMainWorktree,
  isDeleting,
  canForceDelete,
  isBatchDelete,
  worktreeCount,
  canDeleteAllLineage,
  lineageDeleteTargetCount,
  disableConfirm = false,
  onCancel,
  onForceDelete,
  onDelete,
  confirmButtonRef
}: {
  isMainWorktree: boolean
  isDeleting: boolean
  canForceDelete: boolean
  isBatchDelete: boolean
  worktreeCount: number
  canDeleteAllLineage: boolean
  lineageDeleteTargetCount: number
  // Why: the beads disposition refuses "Close" with an empty reason — without
  // this the refusal is real only in the hook and the button no-ops silently.
  disableConfirm?: boolean
  onCancel: () => void
  onForceDelete: () => void
  onDelete: () => void
  confirmButtonRef: Ref<HTMLButtonElement>
}): JSX.Element {
  const label = isDeleting
    ? canForceDelete
      ? 'Force Deleting...'
      : 'Deleting...'
    : isBatchDelete
      ? `Delete ${worktreeCount} Workspaces`
      : canDeleteAllLineage
        ? `Delete ${lineageDeleteTargetCount} Workspaces`
        : canForceDelete
          ? 'Force Delete'
          : 'Delete Workspace'

  return (
    <>
      <Button variant="outline" onClick={onCancel} disabled={isDeleting}>
        {isMainWorktree
          ? translate('auto.components.sidebar.DeleteWorktreeDialogFooter.cf95e3b5bb', 'Close')
          : translate('auto.components.sidebar.DeleteWorktreeDialogFooter.c0e972d726', 'Cancel')}
      </Button>
      {!isMainWorktree && (
        <Button
          ref={confirmButtonRef}
          variant="destructive"
          onClick={canForceDelete ? onForceDelete : onDelete}
          disabled={isDeleting || disableConfirm}
        >
          {isDeleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 />}
          {label}
        </Button>
      )}
    </>
  )
}
