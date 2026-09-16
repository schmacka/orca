import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { selectBeadsRepoState } from '@/store/slices/beads-load-state'
import { FALLBACK_BEADS_SCHEMA, beadsStatusCategory } from '../../../../shared/beads/beads-schema'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'
import type { BeadsResult } from '../../../../shared/beads/beads-contract'
import type { BeadsIssueDetails } from '../../../../shared/beads/beads-issue-types'
import {
  beadsDispositionNeeded,
  runBeadsDisposition,
  type BeadsDisposition
} from './beads-worktree-disposition'

export type BeadsDispositionWorktree = Pick<Worktree, 'repoId' | 'linkedWorkItem'>

export type BeadsDispositionState = {
  needed: boolean
  disposition: BeadsDisposition
  setDisposition: (disposition: BeadsDisposition) => void
  reason: string
  setReason: (reason: string) => void
  canSubmit: boolean
  run: () => Promise<BeadsResult<BeadsIssueDetails> | null>
}

function toBeadsRepoRef(repo: Repo): BeadsRepoRef {
  return {
    id: repo.id,
    path: repo.path,
    connectionId: repo.connectionId,
    executionHostId: repo.executionHostId
  }
}

export function useBeadsDisposition({
  isOpen,
  worktree,
  repoMap
}: {
  isOpen: boolean
  worktree: BeadsDispositionWorktree | null
  repoMap: ReadonlyMap<string, Repo>
}): BeadsDispositionState {
  const loadBeadsDetails = useAppStore((state) => state.loadBeadsDetails)
  const [disposition, setDisposition] = useState<BeadsDisposition>('leave')
  const [reason, setReason] = useState('')

  // Why: this hook stays mounted across dialog open/close cycles (it lives
  // inside the always-rendered DeleteWorktreeDialog), so a closed dialog must
  // drop its selection now, not carry it into the next worktree's delete.
  if (!isOpen && disposition !== 'leave') {
    setDisposition('leave')
  }
  if (!isOpen && reason !== '') {
    setReason('')
  }

  const linkedWorkItem = worktree?.linkedWorkItem ?? null
  const issueId =
    linkedWorkItem?.provider === 'beads' && linkedWorkItem.beadsIdentifier
      ? linkedWorkItem.beadsIdentifier
      : null
  const repo = worktree ? (repoMap.get(worktree.repoId) ?? null) : null
  const repoRef = useMemo(() => (repo ? toBeadsRepoRef(repo) : null), [repo])

  useEffect(() => {
    if (!isOpen || !repoRef || !issueId) {
      return
    }
    void loadBeadsDetails(repoRef, issueId)
  }, [isOpen, repoRef, issueId, loadBeadsDetails])

  const repoState = useAppStore((state) =>
    repo ? selectBeadsRepoState(state, repo.id) : undefined
  )
  const entry = issueId ? repoState?.details[issueId] : undefined
  // Why: null (not the schema's 'active' default) means "not resolved yet" —
  // beadsDispositionNeeded treats that as "stay quiet" so a still-loading bead
  // never renders a half-populated prompt.
  const beadStatusCategory = entry?.data
    ? beadsStatusCategory(repoState?.schema.data ?? FALLBACK_BEADS_SCHEMA, entry.data.issue.status)
    : null

  const needed = beadsDispositionNeeded({ linkedWorkItem, beadStatusCategory })
  const canSubmit = disposition !== 'close' || reason.trim() !== ''

  const run = async (): Promise<BeadsResult<BeadsIssueDetails> | null> => {
    if (!needed || !repoRef || !issueId) {
      return null
    }
    return runBeadsDisposition({ disposition, repo: repoRef, issueId, reason })
  }

  return { needed, disposition, setDisposition, reason, setReason, canSubmit, run }
}
