import { describe, expect, it } from 'vitest'
import {
  FALLBACK_BEADS_SCHEMA,
  beadsStatusCategory,
  normalizeBeadsStatuses,
  normalizeBeadsTypes
} from './beads-schema'

describe('normalizeBeadsStatuses', () => {
  it('reads built-in and custom status arrays from bd statuses --json', () => {
    const raw = {
      schema_version: 1,
      built_in_statuses: [
        { name: 'open', category: 'active', description: 'Available to work (default)', icon: '○' },
        { name: 'hooked', category: 'wip', description: 'Hooked', icon: '⚓' }
      ],
      custom_statuses: [{ name: 'review', category: 'wip' }]
    }
    expect(normalizeBeadsStatuses(raw)).toEqual([
      { name: 'open', category: 'active', description: 'Available to work (default)', icon: '○' },
      { name: 'hooked', category: 'wip', description: 'Hooked', icon: '⚓' },
      { name: 'review', category: 'wip', description: '', icon: '' }
    ])
  })

  it('drops unnamed entries, unknown categories and duplicates', () => {
    const raw = {
      built_in_statuses: [
        { category: 'wip' },
        { name: 'x', category: 'weird' },
        { name: 'open', category: 'active' },
        { name: 'open', category: 'done' }
      ]
    }
    expect(normalizeBeadsStatuses(raw)).toEqual([
      { name: 'open', category: 'active', description: '', icon: '' }
    ])
  })

  it('returns an empty list for non-object payloads', () => {
    expect(normalizeBeadsStatuses(null)).toEqual([])
    expect(normalizeBeadsStatuses([])).toEqual([])
  })
})

describe('normalizeBeadsTypes', () => {
  it('reads object and string entries from core and custom type arrays', () => {
    const raw = {
      core_types: [{ name: 'task', description: 'General work item (default)' }, 'bug'],
      custom_types: [{ name: 'adr' }]
    }
    expect(normalizeBeadsTypes(raw)).toEqual([
      { name: 'task', description: 'General work item (default)' },
      { name: 'bug', description: '' },
      { name: 'adr', description: '' }
    ])
  })
})

describe('beadsStatusCategory', () => {
  it('maps known statuses and keeps unknown ones visible as active', () => {
    expect(beadsStatusCategory(FALLBACK_BEADS_SCHEMA, 'closed')).toBe('done')
    expect(beadsStatusCategory(FALLBACK_BEADS_SCHEMA, 'deferred')).toBe('frozen')
    expect(beadsStatusCategory(FALLBACK_BEADS_SCHEMA, 'something-new')).toBe('active')
  })
})
