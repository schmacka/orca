import type { BeadsListFilter } from '../../shared/beads/beads-contract'
import { BeadsError } from './beads-error'
import {
  requireFetchLimit,
  requireIssueId,
  requireLabel,
  requirePriority,
  requireSingleLine,
  requireStringList,
  requireToken
} from './beads-arg-validation'

export const VC_STATUS_ARGS: readonly string[] = ['vc', 'status', '--json']
export const STATUSES_ARGS: readonly string[] = ['statuses', '--json']
export const TYPES_ARGS: readonly string[] = ['types', '--json']

function typeAndLabelFlags(filter: BeadsListFilter): string[] {
  const flags: string[] = []
  if (filter.type) {
    flags.push(`--type=${requireToken(filter.type, 'type')}`)
  }
  for (const label of requireStringList(filter.labels, 'labels')) {
    flags.push(`--label=${requireLabel(label)}`)
  }
  return flags
}

function assigneeFlags(filter: BeadsListFilter): string[] {
  return filter.assignee ? [`--assignee=${requireSingleLine(filter.assignee, 'assignee')}`] : []
}

function statusTokens(filter: BeadsListFilter): string[] {
  return requireStringList(filter.statuses, 'statuses').map((status) =>
    requireToken(status, 'status')
  )
}

function singleStatus(filter: BeadsListFilter, command: string): string | null {
  const statuses = statusTokens(filter)
  if (statuses.length > 1) {
    throw new BeadsError('invalid-input', `bd ${command} accepts only one status filter.`)
  }
  return statuses[0] ?? null
}

function rejectParent(filter: BeadsListFilter, command: string): void {
  if (filter.parent) {
    throw new BeadsError('invalid-input', `bd ${command} cannot filter by parent.`)
  }
}

// Why: `ready`, `blocked` and `count` cannot apply every BeadsListFilter field (bd
// has no flag for it); silently dropping a filter would return unfiltered results
// the caller believes are filtered, so unsupported fields must reject instead.
function rejectUnsupportedFilters(
  command: string,
  fields: readonly (readonly [field: string, present: boolean])[]
): void {
  for (const [field, present] of fields) {
    if (present) {
      throw new BeadsError('invalid-input', `bd ${command} cannot filter by ${field}.`)
    }
  }
}

export function buildListArgs(filter: BeadsListFilter, limit: number): string[] {
  const args = ['list', '--json', `--limit=${requireFetchLimit(limit)}`]
  const statuses = statusTokens(filter)
  if (statuses.length > 0) {
    args.push(`--status=${statuses.join(',')}`)
  } else if (filter.includeClosed) {
    args.push('--all')
  }
  if (filter.parent) {
    args.push(`--parent=${requireIssueId(filter.parent)}`)
  }
  if (filter.unassigned) {
    args.push('--no-assignee')
  }
  args.push(...typeAndLabelFlags(filter))
  if (filter.priority !== undefined) {
    args.push(`--priority=${requirePriority(filter.priority)}`)
  }
  args.push(...assigneeFlags(filter))
  return args
}

export function buildReadyArgs(filter: BeadsListFilter, limit: number): string[] {
  rejectUnsupportedFilters('ready', [
    ['statuses', statusTokens(filter).length > 0],
    ['includeClosed', Boolean(filter.includeClosed)]
  ])
  const args = ['ready', '--json', `--limit=${requireFetchLimit(limit)}`]
  if (filter.parent) {
    args.push(`--parent=${requireIssueId(filter.parent)}`)
  }
  if (filter.unassigned) {
    args.push('--unassigned')
  }
  args.push(...typeAndLabelFlags(filter))
  if (filter.priority !== undefined) {
    args.push(`--priority=${requirePriority(filter.priority)}`)
  }
  args.push(...assigneeFlags(filter))
  return args
}

export function buildBlockedArgs(filter: BeadsListFilter): string[] {
  rejectUnsupportedFilters('blocked', [
    ['type', Boolean(filter.type)],
    ['labels', requireStringList(filter.labels, 'labels').length > 0],
    ['priority', filter.priority !== undefined],
    ['assignee', Boolean(filter.assignee)],
    ['unassigned', Boolean(filter.unassigned)],
    ['statuses', statusTokens(filter).length > 0],
    ['includeClosed', Boolean(filter.includeClosed)]
  ])
  const args = ['blocked', '--json']
  if (filter.parent) {
    args.push(`--parent=${requireIssueId(filter.parent)}`)
  }
  return args
}

export function buildSearchArgs(text: string, filter: BeadsListFilter, limit: number): string[] {
  rejectParent(filter, 'search')
  const query = requireSingleLine(text, 'search text')
  const args = ['search', '--json', `--query=${query}`, `--limit=${requireFetchLimit(limit)}`]
  const status = singleStatus(filter, 'search')
  if (status) {
    args.push(`--status=${status}`)
  } else if (filter.includeClosed) {
    args.push('--status=all')
  }
  if (filter.unassigned) {
    args.push('--no-assignee')
  }
  args.push(...typeAndLabelFlags(filter))
  if (filter.priority !== undefined) {
    const priority = requirePriority(filter.priority)
    args.push(`--priority-min=${priority}`, `--priority-max=${priority}`)
  }
  args.push(...assigneeFlags(filter))
  return args
}

export function buildCountArgs(filter: BeadsListFilter): string[] {
  rejectParent(filter, 'count')
  rejectUnsupportedFilters('count', [['includeClosed', Boolean(filter.includeClosed)]])
  const args = ['count', '--json']
  const status = singleStatus(filter, 'count')
  if (status) {
    args.push(`--status=${status}`)
  }
  if (filter.unassigned) {
    args.push('--no-assignee')
  }
  args.push(...typeAndLabelFlags(filter))
  if (filter.priority !== undefined) {
    args.push(`--priority=${requirePriority(filter.priority)}`)
  }
  args.push(...assigneeFlags(filter))
  return args
}

export function buildShowArgs(id: string): string[] {
  return ['show', requireIssueId(id), '--json', '--include-dependents', '--include-comments']
}
