import { useMemo } from 'react'
import type { Repo } from '../../../../shared/repo-types'
import type { GitStatusEntry } from '../../../../shared/git-status-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { WorktreeDeleteState } from '../../store/slices/worktree-helpers'
import {
  getDeleteWorktreeDirtyChangeCounts,
  getDeleteWorktreeDirtyChangePreviews,
  type DeleteWorktreeDirtyChangePreview
} from './delete-worktree-dirty-change-counts'

export function useDeleteWorktreeDirtyChanges({
  deleteTargets,
  deleteStateByWorktreeId,
  gitStatusByWorktree,
  gitStatusByWorktreeIdentity,
  repoMap
}: {
  deleteTargets: readonly Worktree[]
  deleteStateByWorktreeId: Record<string, WorktreeDeleteState | undefined>
  gitStatusByWorktree: Record<string, readonly GitStatusEntry[] | undefined>
  gitStatusByWorktreeIdentity: ReadonlyMap<string, readonly GitStatusEntry[]>
  repoMap: ReadonlyMap<string, Repo>
}): { counts: Map<string, number>; previews: Map<string, DeleteWorktreeDirtyChangePreview> } {
  return useMemo(() => {
    const statusInput = { deleteTargets, gitStatusByWorktree, gitStatusByWorktreeIdentity, repoMap }
    return {
      counts: getDeleteWorktreeDirtyChangeCounts({ ...statusInput, deleteStateByWorktreeId }),
      previews: getDeleteWorktreeDirtyChangePreviews(statusInput)
    }
  }, [
    deleteStateByWorktreeId,
    deleteTargets,
    gitStatusByWorktree,
    gitStatusByWorktreeIdentity,
    repoMap
  ])
}
