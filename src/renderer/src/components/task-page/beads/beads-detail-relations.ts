import { beadsStatusCategory } from '../../../../../shared/beads/beads-schema'
import type {
  BeadsIssueDetails,
  BeadsIssueRelation,
  BeadsSchema
} from '../../../../../shared/beads/beads-issue-types'

export type BeadsDetailRelations = {
  parent: BeadsIssueRelation | null
  blockers: BeadsIssueRelation[]
  openBlockers: BeadsIssueRelation[]
  children: BeadsIssueRelation[]
  blocks: BeadsIssueRelation[]
  related: BeadsIssueRelation[]
}

const STRUCTURAL_TYPES = new Set(['parent-child', 'blocks'])

export function groupBeadsRelations(
  details: BeadsIssueDetails,
  schema: BeadsSchema
): BeadsDetailRelations {
  const blockers = details.dependencies.filter((entry) => entry.dependencyType === 'blocks')
  return {
    parent: details.dependencies.find((entry) => entry.dependencyType === 'parent-child') ?? null,
    blockers,
    openBlockers: blockers.filter((entry) => beadsStatusCategory(schema, entry.status) !== 'done'),
    children: details.dependents.filter((entry) => entry.dependencyType === 'parent-child'),
    blocks: details.dependents.filter((entry) => entry.dependencyType === 'blocks'),
    related: [
      ...details.dependencies.filter((entry) => !STRUCTURAL_TYPES.has(entry.dependencyType)),
      ...details.dependents.filter((entry) => !STRUCTURAL_TYPES.has(entry.dependencyType))
    ]
  }
}
