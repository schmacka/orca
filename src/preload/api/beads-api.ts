import type {
  BeadsCloseArgs,
  BeadsCommentArgs,
  BeadsCountArgs,
  BeadsCreateArgs,
  BeadsDeferArgs,
  BeadsDeleteOutcome,
  BeadsIssueActorArgs,
  BeadsIssuePage,
  BeadsListArgs,
  BeadsReadIssueArgs,
  BeadsReopenArgs,
  BeadsRepoArgs,
  BeadsResult,
  BeadsUpdateArgs
} from '../../shared/beads/beads-contract'
import type {
  BeadsIssueDetails,
  BeadsSchema,
  BeadsWorkspaceStatus
} from '../../shared/beads/beads-issue-types'

type Details = Promise<BeadsResult<BeadsIssueDetails>>

export type BeadsApi = {
  getStatus: (args: BeadsRepoArgs) => Promise<BeadsResult<BeadsWorkspaceStatus>>
  getSchema: (args: BeadsRepoArgs) => Promise<BeadsResult<BeadsSchema>>
  getChangeToken: (args: BeadsRepoArgs) => Promise<BeadsResult<string>>
  listIssues: (args: BeadsListArgs) => Promise<BeadsResult<BeadsIssuePage>>
  countIssues: (args: BeadsCountArgs) => Promise<BeadsResult<number>>
  getIssueDetails: (args: BeadsReadIssueArgs) => Details
  createIssue: (args: BeadsCreateArgs) => Details
  updateIssue: (args: BeadsUpdateArgs) => Details
  claimIssue: (args: BeadsIssueActorArgs) => Details
  closeIssue: (args: BeadsCloseArgs) => Details
  reopenIssue: (args: BeadsReopenArgs) => Details
  deferIssue: (args: BeadsDeferArgs) => Details
  undeferIssue: (args: BeadsIssueActorArgs) => Details
  deleteIssue: (args: BeadsIssueActorArgs) => Promise<BeadsResult<BeadsDeleteOutcome>>
  addComment: (args: BeadsCommentArgs) => Details
}
