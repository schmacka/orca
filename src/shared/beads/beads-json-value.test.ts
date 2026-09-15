import { describe, expect, it } from 'vitest'
import {
  isJsonRecord,
  readFiniteNumber,
  readOptionalString,
  readStringList
} from './beads-json-value'

describe('beads JSON value readers', () => {
  it('recognizes plain objects only', () => {
    expect(isJsonRecord({ a: 1 })).toBe(true)
    expect(isJsonRecord([])).toBe(false)
    expect(isJsonRecord(null)).toBe(false)
  })

  it('reads non-empty strings, finite numbers and string lists', () => {
    expect(readOptionalString('x')).toBe('x')
    expect(readOptionalString('')).toBeUndefined()
    expect(readOptionalString(3)).toBeUndefined()
    expect(readFiniteNumber(2)).toBe(2)
    expect(readFiniteNumber(Number.NaN)).toBeUndefined()
    expect(readStringList(['a', 1, 'b'])).toEqual(['a', 'b'])
    expect(readStringList('a')).toEqual([])
  })
})
