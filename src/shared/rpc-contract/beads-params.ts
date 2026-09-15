import { z } from 'zod'
import { OptionalFiniteNumber, OptionalString, requiredString } from './rpc-param-primitives'

const repoField = { repo: requiredString('Missing repo selector') }
const issueField = { id: requiredString('Missing beads issue id') }
const actorField = { actor: z.string().nullable() }

const ListFilter = z.object({
  statuses: z.array(z.string()).optional(),
  type: OptionalString,
  labels: z.array(z.string()).optional(),
  parent: OptionalString,
  priority: OptionalFiniteNumber,
  assignee: OptionalString,
  unassigned: z.boolean().optional(),
  includeClosed: z.boolean().optional()
})

export const BeadsRepoParams = z.object(repoField)

export const BeadsListIssuesParams = z.object({
  ...repoField,
  request: z.object({
    view: z.enum(['list', 'ready', 'blocked', 'search']),
    filter: ListFilter,
    text: OptionalString,
    limit: z.number()
  })
})

export const BeadsCountIssuesParams = z.object({ ...repoField, filter: ListFilter })

export const BeadsIssueParams = z.object({ ...repoField, ...issueField })

export const BeadsIssueActorParams = z.object({ ...repoField, ...issueField, ...actorField })

export const BeadsCreateIssueParams = z.object({
  ...repoField,
  ...actorField,
  input: z.object({
    title: z.string(),
    issueType: OptionalString,
    priority: OptionalFiniteNumber,
    description: z.string().optional(),
    design: z.string().optional(),
    acceptanceCriteria: z.string().optional(),
    notes: z.string().optional(),
    labels: z.array(z.string()).optional(),
    parent: OptionalString,
    assignee: OptionalString
  })
})

export const BeadsUpdateIssueParams = z.object({
  ...repoField,
  ...issueField,
  ...actorField,
  patch: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    design: z.string().optional(),
    acceptanceCriteria: z.string().optional(),
    notes: z.string().optional(),
    status: z.string().optional(),
    priority: OptionalFiniteNumber,
    issueType: z.string().optional(),
    assignee: z.string().optional(),
    parent: z.string().optional(),
    addLabels: z.array(z.string()).optional(),
    removeLabels: z.array(z.string()).optional()
  })
})

export const BeadsCloseIssueParams = z.object({
  ...repoField,
  ...issueField,
  ...actorField,
  reason: z.string()
})

export const BeadsReopenIssueParams = z.object({
  ...repoField,
  ...issueField,
  ...actorField,
  reason: z.string().nullable()
})

export const BeadsDeferIssueParams = z.object({
  ...repoField,
  ...issueField,
  ...actorField,
  until: z.string().nullable()
})

export const BeadsAddCommentParams = z.object({
  ...repoField,
  ...issueField,
  ...actorField,
  text: z.string()
})
