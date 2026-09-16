import { toast } from 'sonner'
import { useAppStore } from '@/store'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'
import type { Worktree } from '../../../shared/worktree/types'

export type BeadsAutoClaimWorktree = Pick<Worktree, 'id' | 'repoId' | 'linkedWorkItem'>

// Why: the caller (worktree-creation-flow-execute.ts) treats this as fire-and-
// forget — its own .catch only logs — so every exit here must resolve, never
// reject, or a successful worktree creation would surface as a failed one.
export async function autoClaimBeadsWorktree(worktree: BeadsAutoClaimWorktree): Promise<void> {
  const linkedWorkItem = worktree.linkedWorkItem
  if (!linkedWorkItem || linkedWorkItem.provider !== 'beads' || !linkedWorkItem.beadsIdentifier) {
    return
  }
  const state = useAppStore.getState()
  if (state.settings?.beadsAutoClaim === false) {
    return
  }
  // Why: built from state.repos by id, not the creation request — the
  // ephemeral-VM path rewrites the host on the request after this worktree
  // was created, so the request's repo shape can no longer be trusted here.
  const repo = state.repos.find((candidate) => candidate.id === worktree.repoId)
  if (!repo) {
    // Why: reachable — a repo/project removal can race this in-flight create
    // (removeProject filters state.repos synchronously, unaware of it), so this
    // is a real skip, not dead code; no toast, just a diagnosable trace.
    console.warn('beads auto-claim: repo not found, skipping claim', {
      beadsId: linkedWorkItem.beadsIdentifier,
      repoId: worktree.repoId
    })
    return
  }
  const repoRef: BeadsRepoRef = {
    id: repo.id,
    path: repo.path,
    connectionId: repo.connectionId,
    executionHostId: repo.executionHostId
  }
  const beadsId = linkedWorkItem.beadsIdentifier
  try {
    const result = await state.claimBeadsIssue(repoRef, beadsId)
    if (result.ok) {
      // Why: this is the milestone's first automatic write to the tracker;
      // it must be visible at the moment it happens, not just in the log.
      toast.success(`Claimed ${beadsId}`)
    } else {
      toast.warning(`Could not claim ${beadsId}: ${result.error.message}`)
    }
  } catch (error) {
    // Why: the worktree already exists and stays regardless — a failed claim
    // never undoes a successful creation, it only gets a visible warning.
    const message = error instanceof Error ? error.message : String(error)
    toast.warning(`Could not claim ${beadsId}: ${message}`)
  }
}
