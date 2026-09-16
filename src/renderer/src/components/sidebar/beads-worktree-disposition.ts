import { useAppStore } from '@/store'
import type { BeadsStatusCategory } from '../../../../shared/beads/beads-issue-types'
import type { BeadsResult } from '../../../../shared/beads/beads-contract'
import type { BeadsIssueDetails } from '../../../../shared/beads/beads-issue-types'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'

export type BeadsDisposition = 'close' | 'unclaim' | 'leave'

export function beadsDispositionNeeded(input: {
  linkedWorkItem: { provider: string } | null
  beadStatusCategory: BeadsStatusCategory | null
}): boolean {
  // Require linked beads item with known status, not already closed.
  if (
    input.linkedWorkItem?.provider !== 'beads' ||
    input.beadStatusCategory === null ||
    input.beadStatusCategory === 'done'
  ) {
    return false
  }
  return true
}

export async function runBeadsDisposition(args: {
  disposition: BeadsDisposition
  repo: BeadsRepoRef
  issueId: string
  reason: string
}): Promise<BeadsResult<BeadsIssueDetails> | null> {
  const { disposition, repo, issueId, reason } = args
  const store = useAppStore.getState()

  if (disposition === 'leave') {
    return null
  }

  if (disposition === 'unclaim') {
    return store.unclaimBeadsIssue(repo, issueId)
  }

  if (disposition === 'close') {
    // Refuse empty or whitespace-only reason; bd close requires one.
    if (!reason.trim()) {
      return null
    }
    return store.closeBeadsIssue(repo, issueId, reason)
  }

  return null
}
