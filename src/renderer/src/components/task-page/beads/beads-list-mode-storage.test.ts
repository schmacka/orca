// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readBeadsListMode, writeBeadsListMode } from './beads-list-mode-storage'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('beads list mode storage', () => {
  it('defaults to tree and remembers the mode per repository', () => {
    expect(readBeadsListMode('r1')).toBe('tree')
    writeBeadsListMode('r1', 'flat')
    expect(readBeadsListMode('r1')).toBe('flat')
    expect(readBeadsListMode('r2')).toBe('tree')
  })

  it('ignores unreadable storage and invalid values', () => {
    window.localStorage.setItem('orca.beads.listMode.r1', 'board')
    expect(readBeadsListMode('r1')).toBe('tree')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readBeadsListMode('r1')).toBe('tree')
  })
})
