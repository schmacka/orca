import type { Worktree } from '../../../../shared/worktree/types'
import {
  composeWorktreeHostIdentity,
  getWorktreeHostIdentity
} from '../../../../shared/worktree/host-qualified-identity'
import type { WorktreeDeleteIdentity } from './worktree-delete-request'

/** The single worktree the dialog is confirming, disambiguated by host on an id collision. */
export function resolveDeleteWorktreeDialogTarget(
  allWorktrees: readonly Worktree[],
  worktreeDeleteIdentities: readonly WorktreeDeleteIdentity[],
  worktreeId: string
): Worktree | null {
  if (!worktreeId) {
    return null
  }
  const identity = worktreeDeleteIdentities.find((item) => item.id === worktreeId)
  return (
    allWorktrees.find(
      (item) => item.id === worktreeId && (!identity?.hostId || item.hostId === identity.hostId)
    ) ?? null
  )
}

/** The full set of worktrees a batch delete confirms, host-qualified when identities are known. */
export function resolveDeleteWorktreeDialogTargets(
  allWorktrees: readonly Worktree[],
  worktreeDeleteIdentities: readonly WorktreeDeleteIdentity[],
  worktreeIds: readonly string[]
): Worktree[] {
  if (worktreeIds.length === 0) {
    return []
  }
  if (worktreeDeleteIdentities.length > 0) {
    const selected = new Set(
      worktreeDeleteIdentities.map((identity) =>
        composeWorktreeHostIdentity(identity.hostId, identity.id)
      )
    )
    return allWorktrees.filter((item) => selected.has(getWorktreeHostIdentity(item)))
  }
  const selected = new Set(worktreeIds)
  return allWorktrees.filter((item) => selected.has(item.id))
}
