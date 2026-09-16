import type { BeadsIssue } from '../../../../../shared/beads/beads-issue-types'
import { getRepoExecutionHostId } from '../../../../../shared/execution-host'
import type { TaskSourceContext } from '../../../../../shared/task-source-context'
import type { WorkspaceLinkedItem } from '../../../../../shared/worktree/types'
import {
  getLinkedWorkItemSuggestedName,
  getLinkedWorkItemWorkspaceName
} from '../../../../../shared/workspace-name'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'

export function buildBeadsLinkedItem(
  issue: Pick<BeadsIssue, 'id' | 'title'>,
  repoId: string
): WorkspaceLinkedItem {
  return {
    provider: 'beads',
    type: 'issue',
    number: 0,
    title: `${issue.id} ${issue.title}`,
    url: `bd://${issue.id}`,
    beadsIdentifier: issue.id,
    repoId
  }
}

// Why: mirrors getJiraIssueWorkspaceSeed (task-page-source-context.tsx) so a bead
// slugs the same way an identifier-carrying linked item already does.
export function buildBeadsWorkspaceSeed(issue: Pick<BeadsIssue, 'id' | 'title'>): string {
  return (
    getLinkedWorkItemWorkspaceName({
      type: 'issue',
      provider: 'beads',
      number: 0,
      title: `${issue.id} ${issue.title}`,
      beadsIdentifier: issue.id
    })?.seedName ?? getLinkedWorkItemSuggestedName(issue)
  )
}

// Why: modeled on getTaskPageRepoSourceContext, but beads repos carry no project-catalog
// or host-setup entry, so projectId/hostId fall straight back to the repo itself.
export function buildBeadsTaskSourceContext(repo: BeadsRepoRef): TaskSourceContext {
  return {
    kind: 'task-source',
    provider: 'beads',
    projectId: repo.id,
    hostId: getRepoExecutionHostId(repo),
    repoId: repo.id,
    providerIdentity: { provider: 'beads' }
  }
}
