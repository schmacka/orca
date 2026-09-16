import { useEffect } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { BeadsIssue, BeadsSchema } from '../../../../../shared/beads/beads-issue-types'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'
import { useAppStore } from '@/store'
// From beads-load-state, not beads.ts: beads.ts pulls in the runtime client.
import { selectBeadsRepoState } from '@/store/slices/beads-load-state'
import { BeadsDetailSections } from './BeadsDetailSections'

type BeadsDetailPaneProps = {
  repo: BeadsRepoRef
  issueId: string
  schema: BeadsSchema
  onOpenIssue: (id: string) => void
  onStartWorktree: (issue: Pick<BeadsIssue, 'id' | 'title'>) => void
}

export function BeadsDetailPane({
  repo,
  issueId,
  schema,
  onOpenIssue,
  onStartWorktree
}: BeadsDetailPaneProps): React.JSX.Element {
  const entry = useAppStore((state) => selectBeadsRepoState(state, repo.id).details[issueId])
  const changeToken = useAppStore((state) => selectBeadsRepoState(state, repo.id).changeToken)
  const loadBeadsDetails = useAppStore((state) => state.loadBeadsDetails)
  // Why: the details cache can evict this issue's entry (24-entry cap) without
  // issueId/changeToken changing; its absence must retrigger the load or this pane
  // spins forever with no request pending.
  const entryMissing = entry === undefined

  useEffect(() => {
    // Why: changeToken is a dependency so a new bd commit reloads the open issue, and
    // null means the first poll has not answered — loading now would fetch twice.
    if (changeToken === null) {
      return
    }
    void loadBeadsDetails(repo, issueId)
  }, [loadBeadsDetails, repo, issueId, changeToken, entryMissing])

  if (entry?.data) {
    return (
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        <BeadsDetailSections
          details={entry.data}
          schema={schema}
          onOpenIssue={onOpenIssue}
          onStartWorktree={onStartWorktree}
        />
      </div>
    )
  }
  if (entry?.error) {
    return (
      <div className="flex items-start gap-2 p-4 text-[13px] text-destructive">
        <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>{entry.error.message}</span>
      </div>
    )
  }
  return (
    <div role="status" aria-busy className="flex flex-1 items-center justify-center p-8">
      <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
    </div>
  )
}
