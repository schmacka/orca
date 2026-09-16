import type { BeadsIssue } from '../../../../../shared/beads/beads-issue-types'
import {
  buildTaskSourceContextFromRepo,
  type TaskSourceContext
} from '../../../../../shared/task-source-context'
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

// Why: modeled on getTaskPageRepoSourceContext, but BeadsRepoRef carries none of the
// upstream/gitRemoteIdentity fields a project-catalog lookup needs, so projectId just
// falls back to repo.id. Routes through the shared builder (not a hand-rolled literal)
// so every field normalizes the same way, `null` defaults included.
export function buildBeadsTaskSourceContext(repo: BeadsRepoRef): TaskSourceContext | null {
  return buildTaskSourceContextFromRepo({
    provider: 'beads',
    projectId: repo.id,
    repo,
    providerIdentity: { provider: 'beads' }
  })
}
