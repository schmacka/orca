import { describe, expect, it } from 'vitest'
import { FALLBACK_BEADS_SCHEMA } from '../../../../../shared/beads/beads-schema'
import type { BeadsIssueDetails } from '../../../../../shared/beads/beads-issue-types'
import { groupBeadsRelations } from './beads-detail-relations'

function relation(id: string, dependencyType: string, status = 'open') {
  return { id, title: `Title ${id}`, status, priority: 2, issueType: 'task', dependencyType }
}

const DETAILS: BeadsIssueDetails = {
  issue: {
    id: 'cwf.3',
    title: 'Run the playtest',
    status: 'open',
    priority: 2,
    issueType: 'task',
    labels: [],
    createdAt: '',
    updatedAt: '',
    dependencyCount: 3,
    dependentCount: 2,
    commentCount: 0,
    blockedBy: [],
    dependencyEdges: []
  },
  dependencies: [
    relation('cwf', 'parent-child'),
    relation('cwf.1', 'blocks'),
    relation('cwf.9', 'blocks', 'closed'),
    relation('x.1', 'related')
  ],
  dependents: [
    relation('cwf.4', 'blocks'),
    relation('cwf.3.1', 'parent-child'),
    relation('d.2', 'discovered-from')
  ],
  comments: []
}

describe('groupBeadsRelations', () => {
  it('splits parent, blockers, open blockers, blocks, children and related', () => {
    const groups = groupBeadsRelations(DETAILS, FALLBACK_BEADS_SCHEMA)
    expect(groups.parent?.id).toBe('cwf')
    expect(groups.blockers.map((entry) => entry.id)).toEqual(['cwf.1', 'cwf.9'])
    expect(groups.openBlockers.map((entry) => entry.id)).toEqual(['cwf.1'])
    expect(groups.blocks.map((entry) => entry.id)).toEqual(['cwf.4'])
    expect(groups.children.map((entry) => entry.id)).toEqual(['cwf.3.1'])
    expect(groups.related.map((entry) => entry.id)).toEqual(['x.1', 'd.2'])
  })
})
