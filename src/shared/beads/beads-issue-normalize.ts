import type {
  BeadsDependencyEdge,
  BeadsIssue,
  BeadsIssueComment,
  BeadsIssueDetails,
  BeadsIssueRelation
} from './beads-issue-types'
import {
  isJsonRecord,
  readFiniteNumber,
  readOptionalString,
  readStringList
} from './beads-json-value'

// Ported from stablyai/orca#14013 (ajchemist) and adapted to bd 1.2.2 output:
// statuses stay free strings (custom statuses exist), `bd list` edge records and
// `bd show` relation objects are both understood, and a missing timestamp no
// longer drops the whole issue.

const DEFAULT_PRIORITY = 2

function readDependencyEdges(value: unknown): BeadsDependencyEdge[] {
  if (!Array.isArray(value)) {
    return []
  }
  const edges: BeadsDependencyEdge[] = []
  for (const entry of value) {
    if (!isJsonRecord(entry)) {
      continue
    }
    // `bd list` emits {depends_on_id, type}; `bd show` emits the related issue plus dependency_type.
    const dependsOnId = readOptionalString(entry.depends_on_id) ?? readOptionalString(entry.id)
    const dependencyType =
      readOptionalString(entry.type) ?? readOptionalString(entry.dependency_type)
    if (dependsOnId && dependencyType) {
      edges.push({ dependsOnId, dependencyType })
    }
  }
  return edges
}

export function normalizeBeadsIssue(raw: unknown): BeadsIssue | null {
  if (!isJsonRecord(raw)) {
    return null
  }
  const id = readOptionalString(raw.id)
  if (!id || typeof raw.title !== 'string') {
    return null
  }
  return {
    id,
    title: raw.title,
    description: readOptionalString(raw.description),
    design: readOptionalString(raw.design),
    acceptanceCriteria: readOptionalString(raw.acceptance_criteria),
    notes: readOptionalString(raw.notes),
    status: readOptionalString(raw.status) ?? 'open',
    priority: readFiniteNumber(raw.priority) ?? DEFAULT_PRIORITY,
    issueType: readOptionalString(raw.issue_type) ?? 'task',
    // Why: `owner` is the creator's account, never the assignee.
    assignee: readOptionalString(raw.assignee),
    owner: readOptionalString(raw.owner),
    createdBy: readOptionalString(raw.created_by),
    labels: readStringList(raw.labels),
    parent: readOptionalString(raw.parent),
    createdAt: readOptionalString(raw.created_at) ?? '',
    updatedAt: readOptionalString(raw.updated_at) ?? '',
    closedAt: readOptionalString(raw.closed_at),
    closeReason: readOptionalString(raw.close_reason),
    deferUntil: readOptionalString(raw.defer_until),
    dependencyCount: readFiniteNumber(raw.dependency_count) ?? 0,
    dependentCount: readFiniteNumber(raw.dependent_count) ?? 0,
    commentCount: readFiniteNumber(raw.comment_count) ?? 0,
    blockedBy: readStringList(raw.blocked_by),
    dependencyEdges: readDependencyEdges(raw.dependencies)
  }
}

export function normalizeBeadsRelation(raw: unknown): BeadsIssueRelation | null {
  if (!isJsonRecord(raw)) {
    return null
  }
  const id = readOptionalString(raw.id)
  if (!id || typeof raw.title !== 'string') {
    return null
  }
  return {
    id,
    title: raw.title,
    status: readOptionalString(raw.status) ?? 'open',
    priority: readFiniteNumber(raw.priority) ?? DEFAULT_PRIORITY,
    issueType: readOptionalString(raw.issue_type) ?? 'task',
    dependencyType: readOptionalString(raw.dependency_type) ?? 'blocks'
  }
}

function readRelations(value: unknown): BeadsIssueRelation[] {
  if (!Array.isArray(value)) {
    return []
  }
  const relations: BeadsIssueRelation[] = []
  for (const entry of value) {
    const relation = normalizeBeadsRelation(entry)
    if (relation) {
      relations.push(relation)
    }
  }
  return relations
}

export function normalizeBeadsComment(raw: unknown): BeadsIssueComment | null {
  if (!isJsonRecord(raw)) {
    return null
  }
  const numericId = readFiniteNumber(raw.id)
  const id = readOptionalString(raw.id) ?? (numericId === undefined ? undefined : String(numericId))
  const createdAt = readOptionalString(raw.created_at)
  if (!id || typeof raw.text !== 'string' || !createdAt) {
    return null
  }
  return { id, author: readOptionalString(raw.author) ?? '', text: raw.text, createdAt }
}

function readComments(value: unknown): BeadsIssueComment[] {
  if (!Array.isArray(value)) {
    return []
  }
  const comments: BeadsIssueComment[] = []
  for (const entry of value) {
    const comment = normalizeBeadsComment(entry)
    if (comment) {
      comments.push(comment)
    }
  }
  return comments
}

export function normalizeBeadsIssueDetails(raw: unknown): BeadsIssueDetails | null {
  const issue = normalizeBeadsIssue(raw)
  if (!issue || !isJsonRecord(raw)) {
    return null
  }
  return {
    issue,
    dependencies: readRelations(raw.dependencies),
    dependents: readRelations(raw.dependents),
    comments: readComments(raw.comments)
  }
}
