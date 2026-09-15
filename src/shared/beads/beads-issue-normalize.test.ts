import { describe, expect, it } from 'vitest'
import {
  normalizeBeadsComment,
  normalizeBeadsIssue,
  normalizeBeadsIssueDetails,
  normalizeBeadsRelation
} from './beads-issue-normalize'

// `bd list --json`: dependencies are raw edge records.
const LIST_ROW = {
  id: 'baumoscan-cwf.1',
  title: 'Decide: does a store line citing playtest results count as publication?',
  description: 'Playtest protocol rule E8…',
  acceptance_criteria: 'The answer is recorded…',
  notes: 'Source: notion',
  status: 'open',
  priority: 1,
  issue_type: 'task',
  owner: 'owner@example.com',
  created_at: '2026-09-11T09:29:07Z',
  created_by: 'schmacka',
  updated_at: '2026-09-11T09:29:07Z',
  dependencies: [
    {
      issue_id: 'baumoscan-cwf.1',
      depends_on_id: 'baumoscan-cwf',
      type: 'parent-child',
      created_at: '2026-09-11T11:29:07Z',
      created_by: 'schmacka',
      metadata: '{}'
    }
  ],
  dependency_count: 0,
  dependent_count: 1,
  comment_count: 0,
  parent: 'baumoscan-cwf'
}

// `bd show --json --include-dependents --include-comments`
const SHOW_ROW = {
  id: 'probe-3os.1',
  title: 'Renamed',
  description: 'desc',
  design: 'd',
  acceptance_criteria: 'acc',
  notes: 'n',
  status: 'in_progress',
  priority: 0,
  issue_type: 'task',
  assignee: 'schmacka',
  owner: 'owner@example.com',
  created_at: '2026-09-15T12:55:58Z',
  created_by: 'schmacka',
  updated_at: '2026-09-15T12:55:59Z',
  labels: ['backend', 'ui'],
  dependencies: [
    {
      id: 'probe-3os',
      title: 'Epic one',
      status: 'open',
      priority: 1,
      issue_type: 'epic',
      created_at: '2026-09-15T12:55:57Z',
      updated_at: '2026-09-15T12:55:57Z',
      dependency_type: 'parent-child'
    }
  ],
  dependents: [
    {
      id: 'probe-9zz',
      title: 'Follow-up',
      status: 'open',
      priority: 3,
      issue_type: 'task',
      created_at: '0001-01-01T00:00:00Z',
      updated_at: '0001-01-01T00:00:00Z',
      dependency_type: 'blocks'
    }
  ],
  comments: [
    {
      id: '01a0a523-74db-7e5f-8143-6c2b279f2fee',
      issue_id: 'probe-3os.1',
      author: 'schmacka',
      text: '-hello comment',
      created_at: '2026-09-15T12:55:59Z'
    }
  ],
  parent: 'probe-3os',
  dependent_count: 1,
  dependency_count: 1,
  comment_count: 1
}

describe('normalizeBeadsIssue', () => {
  it('maps a bd list row including edge records', () => {
    expect(normalizeBeadsIssue(LIST_ROW)).toEqual({
      id: 'baumoscan-cwf.1',
      title: 'Decide: does a store line citing playtest results count as publication?',
      description: 'Playtest protocol rule E8…',
      acceptanceCriteria: 'The answer is recorded…',
      notes: 'Source: notion',
      status: 'open',
      priority: 1,
      issueType: 'task',
      owner: 'owner@example.com',
      createdBy: 'schmacka',
      labels: [],
      parent: 'baumoscan-cwf',
      createdAt: '2026-09-11T09:29:07Z',
      updatedAt: '2026-09-11T09:29:07Z',
      dependencyCount: 0,
      dependentCount: 1,
      commentCount: 0,
      blockedBy: [],
      dependencyEdges: [{ dependsOnId: 'baumoscan-cwf', dependencyType: 'parent-child' }]
    })
  })

  it('reads bd blocked rows and close/defer metadata', () => {
    const issue = normalizeBeadsIssue({
      id: 'b-1',
      title: 'Blocked thing',
      status: 'closed',
      blocked_by: ['b-2', 'b-3'],
      blocked_by_count: 2,
      close_reason: 'done it',
      closed_at: '2026-09-15T12:56:00Z',
      defer_until: '2026-09-16T14:56:01Z'
    })
    expect(issue?.blockedBy).toEqual(['b-2', 'b-3'])
    expect(issue?.closeReason).toBe('done it')
    expect(issue?.deferUntil).toBe('2026-09-16T14:56:01Z')
  })

  it('keeps custom statuses verbatim and defaults missing fields', () => {
    const issue = normalizeBeadsIssue({ id: 'x-1', title: 'T', status: 'hooked' })
    expect(issue).toMatchObject({
      status: 'hooked',
      priority: 2,
      issueType: 'task',
      createdAt: '',
      updatedAt: ''
    })
  })

  it('rejects rows without id or title', () => {
    expect(normalizeBeadsIssue({ title: 'no id' })).toBeNull()
    expect(normalizeBeadsIssue({ id: 'x-1' })).toBeNull()
    expect(normalizeBeadsIssue('x-1')).toBeNull()
  })
})

describe('normalizeBeadsRelation', () => {
  it('maps show relations and drops raw edge records', () => {
    expect(normalizeBeadsRelation(SHOW_ROW.dependencies[0])).toEqual({
      id: 'probe-3os',
      title: 'Epic one',
      status: 'open',
      priority: 1,
      issueType: 'epic',
      dependencyType: 'parent-child'
    })
    expect(normalizeBeadsRelation(LIST_ROW.dependencies[0])).toBeNull()
  })
})

describe('normalizeBeadsComment', () => {
  it('keeps leading-dash text and string ids', () => {
    expect(normalizeBeadsComment(SHOW_ROW.comments[0])).toEqual({
      id: '01a0a523-74db-7e5f-8143-6c2b279f2fee',
      author: 'schmacka',
      text: '-hello comment',
      createdAt: '2026-09-15T12:55:59Z'
    })
  })

  it('accepts numeric ids and rejects comments without text', () => {
    expect(normalizeBeadsComment({ id: 7, text: 'a', created_at: 'x' })?.id).toBe('7')
    expect(normalizeBeadsComment({ id: 'c', created_at: 'x' })).toBeNull()
  })
})

describe('normalizeBeadsIssueDetails', () => {
  it('splits dependencies, dependents and comments', () => {
    const details = normalizeBeadsIssueDetails(SHOW_ROW)
    expect(details?.issue.id).toBe('probe-3os.1')
    expect(details?.issue.dependencyEdges).toEqual([
      { dependsOnId: 'probe-3os', dependencyType: 'parent-child' }
    ])
    expect(details?.dependencies.map((relation) => relation.id)).toEqual(['probe-3os'])
    expect(details?.dependents.map((relation) => relation.dependencyType)).toEqual(['blocks'])
    expect(details?.comments).toHaveLength(1)
  })

  it('treats a missing comments key as no comments', () => {
    expect(normalizeBeadsIssueDetails({ ...SHOW_ROW, comments: undefined })?.comments).toEqual([])
  })
})
