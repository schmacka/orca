import { describe, expect, it } from 'vitest'
import {
  BEADS_PRESETS,
  EMPTY_BEADS_FILTERS,
  buildBeadsListRequest,
  countActiveBeadsFilters,
  nextBeadsLimit,
  supportedBeadsFilterKeys,
  type BeadsListQuery
} from './beads-list-request'

const FILTERS = {
  type: 'bug',
  labels: ['ui'],
  parent: 'e-1',
  priority: 1,
  assignee: 'ada'
}

function query(overrides: Partial<BeadsListQuery>): BeadsListQuery {
  return { preset: 'open', filters: EMPTY_BEADS_FILTERS, text: '', limit: 200, ...overrides }
}

describe('buildBeadsListRequest', () => {
  it('lists presets in the spec order', () => {
    expect(BEADS_PRESETS).toEqual(['ready', 'in_progress', 'blocked', 'open', 'closed'])
  })

  it('maps list presets to status filters and keeps every filter', () => {
    expect(buildBeadsListRequest(query({ preset: 'in_progress', filters: FILTERS }))).toEqual({
      view: 'list',
      filter: {
        statuses: ['in_progress'],
        type: 'bug',
        labels: ['ui'],
        parent: 'e-1',
        priority: 1,
        assignee: 'ada'
      },
      limit: 200
    })
    expect(buildBeadsListRequest(query({ preset: 'closed' })).filter).toEqual({
      statuses: ['closed']
    })
    expect(buildBeadsListRequest(query({ preset: 'open' })).filter).toEqual({})
  })

  it('drops filters bd cannot apply for ready and blocked', () => {
    expect(buildBeadsListRequest(query({ preset: 'ready', filters: FILTERS }))).toEqual({
      view: 'ready',
      filter: { type: 'bug', labels: ['ui'], parent: 'e-1', priority: 1, assignee: 'ada' },
      limit: 200
    })
    expect(buildBeadsListRequest(query({ preset: 'blocked', filters: FILTERS }))).toEqual({
      view: 'blocked',
      filter: { parent: 'e-1' },
      limit: 200
    })
  })

  it('switches to search for text and never sends parent', () => {
    expect(
      buildBeadsListRequest(query({ preset: 'closed', text: '  playtest ', filters: FILTERS }))
    ).toEqual({
      view: 'search',
      filter: { statuses: ['closed'], type: 'bug', labels: ['ui'], priority: 1, assignee: 'ada' },
      text: 'playtest',
      limit: 200
    })
    expect(buildBeadsListRequest(query({ preset: 'ready', text: 'x' })).filter).toEqual({})
  })

  it('omits empty filter values', () => {
    expect(
      buildBeadsListRequest(query({ filters: { ...EMPTY_BEADS_FILTERS, assignee: '  ' } })).filter
    ).toEqual({})
  })
})

describe('filter helpers', () => {
  it('reports supported filters per view', () => {
    expect([...supportedBeadsFilterKeys('blocked')]).toEqual(['parent'])
    expect(supportedBeadsFilterKeys('search').has('parent')).toBe(false)
    expect(supportedBeadsFilterKeys('list').size).toBe(5)
  })

  it('counts only filters the current view applies', () => {
    expect(countActiveBeadsFilters(FILTERS, 'list')).toBe(5)
    expect(countActiveBeadsFilters(FILTERS, 'blocked')).toBe(1)
  })

  it('grows the limit by a page up to the maximum', () => {
    expect(nextBeadsLimit(200)).toBe(400)
    expect(nextBeadsLimit(1900)).toBe(2000)
    expect(nextBeadsLimit(2000)).toBe(2000)
  })
})
