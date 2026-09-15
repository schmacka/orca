import type { BeadsIssue } from './beads-issue-types'

export const BEADS_LIST_PAGE_SIZE = 200
export const BEADS_LIST_MAX_LIMIT = 2000

export type BeadsErrorKind =
  | 'bd-missing'
  | 'bd-outdated'
  | 'not-initialized'
  | 'ambiguous-id'
  | 'not-found'
  | 'busy'
  | 'host-offline'
  | 'invalid-input'
  | 'failed'

export type BeadsFailure = {
  kind: BeadsErrorKind
  message: string
}

export type BeadsResult<T> = { ok: true; value: T } | { ok: false; error: BeadsFailure }

export type BeadsListView = 'list' | 'ready' | 'blocked' | 'search'

export type BeadsListFilter = {
  statuses?: string[]
  type?: string
  labels?: string[]
  parent?: string
  priority?: number
  assignee?: string
  unassigned?: boolean
  includeClosed?: boolean
}

export type BeadsListRequest = {
  view: BeadsListView
  filter: BeadsListFilter
  text?: string
  limit: number
}

export type BeadsIssuePage = {
  issues: BeadsIssue[]
  hasMore: boolean
}

export type BeadsCreateInput = {
  title: string
  issueType?: string
  priority?: number
  description?: string
  design?: string
  acceptanceCriteria?: string
  notes?: string
  labels?: string[]
  parent?: string
  assignee?: string
}

export type BeadsIssuePatch = {
  title?: string
  description?: string
  design?: string
  acceptanceCriteria?: string
  notes?: string
  status?: string
  priority?: number
  issueType?: string
  assignee?: string
  parent?: string
  addLabels?: string[]
  removeLabels?: string[]
}

export type BeadsDeleteOutcome = {
  deleted: string
}

export type BeadsRepoArgs = { repoPath: string; repoId?: string | null }
export type BeadsReadIssueArgs = BeadsRepoArgs & { id: string }
export type BeadsListArgs = BeadsRepoArgs & { request: BeadsListRequest }
export type BeadsCountArgs = BeadsRepoArgs & { filter: BeadsListFilter }
export type BeadsIssueActorArgs = BeadsRepoArgs & { id: string; actor: string | null }
export type BeadsCreateArgs = BeadsRepoArgs & { input: BeadsCreateInput; actor: string | null }
export type BeadsUpdateArgs = BeadsIssueActorArgs & { patch: BeadsIssuePatch }
export type BeadsCloseArgs = BeadsIssueActorArgs & { reason: string }
export type BeadsReopenArgs = BeadsIssueActorArgs & { reason: string | null }
export type BeadsDeferArgs = BeadsIssueActorArgs & { until: string | null }
export type BeadsCommentArgs = BeadsIssueActorArgs & { text: string }
