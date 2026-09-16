import {
  BEADS_LIST_MAX_LIMIT,
  BEADS_LIST_PAGE_SIZE,
  type BeadsListFilter,
  type BeadsListRequest,
  type BeadsListView
} from '../../../../../shared/beads/beads-contract'

export type BeadsPreset = 'ready' | 'in_progress' | 'blocked' | 'open' | 'closed'

export const BEADS_PRESETS: readonly BeadsPreset[] = [
  'ready',
  'in_progress',
  'blocked',
  'open',
  'closed'
]

export type BeadsFilterKey = 'type' | 'labels' | 'parent' | 'priority' | 'assignee'

export type BeadsFilterValues = {
  type: string | null
  labels: string[]
  parent: string | null
  priority: number | null
  assignee: string
}

export const EMPTY_BEADS_FILTERS: BeadsFilterValues = {
  type: null,
  labels: [],
  parent: null,
  priority: null,
  assignee: ''
}

export type BeadsListQuery = {
  preset: BeadsPreset
  filters: BeadsFilterValues
  text: string
  limit: number
}

const ALL_FILTERS: readonly BeadsFilterKey[] = ['type', 'labels', 'parent', 'priority', 'assignee']

// Why: M1's argv builders reject these combinations with invalid-input; the UI
// disables them and the builder never sends them.
const SUPPORTED_FILTERS: Record<BeadsListView, ReadonlySet<BeadsFilterKey>> = {
  list: new Set(ALL_FILTERS),
  ready: new Set(['type', 'labels', 'parent', 'priority', 'assignee']),
  blocked: new Set(['parent']),
  search: new Set(['type', 'labels', 'priority', 'assignee'])
}

export function beadsViewForQuery(query: BeadsListQuery): BeadsListView {
  if (query.text.trim() !== '') {
    return 'search'
  }
  if (query.preset === 'ready') {
    return 'ready'
  }
  if (query.preset === 'blocked') {
    return 'blocked'
  }
  return 'list'
}

export function supportedBeadsFilterKeys(view: BeadsListView): ReadonlySet<BeadsFilterKey> {
  return SUPPORTED_FILTERS[view]
}

function presetStatuses(preset: BeadsPreset, view: BeadsListView): string[] | undefined {
  if (view !== 'list' && view !== 'search') {
    return undefined
  }
  if (preset === 'in_progress') {
    return ['in_progress']
  }
  if (preset === 'closed') {
    return ['closed']
  }
  return undefined
}

function hasFilterValue(filters: BeadsFilterValues, key: BeadsFilterKey): boolean {
  switch (key) {
    case 'type':
      return filters.type !== null
    case 'labels':
      return filters.labels.length > 0
    case 'parent':
      return filters.parent !== null
    case 'priority':
      return filters.priority !== null
    case 'assignee':
      return filters.assignee.trim() !== ''
  }
}

export function buildBeadsListRequest(query: BeadsListQuery): BeadsListRequest {
  const view = beadsViewForQuery(query)
  const supported = SUPPORTED_FILTERS[view]
  const { filters } = query
  const filter: BeadsListFilter = {}
  const statuses = presetStatuses(query.preset, view)
  if (statuses) {
    filter.statuses = statuses
  }
  if (supported.has('type') && filters.type !== null) {
    filter.type = filters.type
  }
  if (supported.has('labels') && filters.labels.length > 0) {
    filter.labels = filters.labels
  }
  if (supported.has('parent') && filters.parent !== null) {
    filter.parent = filters.parent
  }
  if (supported.has('priority') && filters.priority !== null) {
    filter.priority = filters.priority
  }
  if (supported.has('assignee') && filters.assignee.trim() !== '') {
    filter.assignee = filters.assignee.trim()
  }
  const request: BeadsListRequest = { view, filter, limit: query.limit }
  if (view === 'search') {
    request.text = query.text.trim()
  }
  return request
}

export function countActiveBeadsFilters(filters: BeadsFilterValues, view: BeadsListView): number {
  return ALL_FILTERS.filter(
    (key) => SUPPORTED_FILTERS[view].has(key) && hasFilterValue(filters, key)
  ).length
}

export function nextBeadsLimit(limit: number): number {
  return Math.min(limit + BEADS_LIST_PAGE_SIZE, BEADS_LIST_MAX_LIMIT)
}
