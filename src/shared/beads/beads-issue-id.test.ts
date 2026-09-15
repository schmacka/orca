import { describe, expect, it } from 'vitest'
import { isBeadsIssueId } from './beads-issue-id'

describe('isBeadsIssueId', () => {
  it('accepts hash ids and dotted child ids', () => {
    expect(isBeadsIssueId('baumoscan-cwf')).toBe(true)
    expect(isBeadsIssueId('baumoscan-cwf.3')).toBe(true)
    expect(isBeadsIssueId('probe_1')).toBe(true)
  })

  it('rejects values bd could parse as flags or that contain separators', () => {
    expect(isBeadsIssueId('-x')).toBe(false)
    expect(isBeadsIssueId('--json')).toBe(false)
    expect(isBeadsIssueId('a b')).toBe(false)
    expect(isBeadsIssueId('a,b')).toBe(false)
    expect(isBeadsIssueId('')).toBe(false)
    expect(isBeadsIssueId(`a${'b'.repeat(128)}`)).toBe(false)
  })
})
