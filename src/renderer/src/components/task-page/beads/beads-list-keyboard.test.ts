import { describe, expect, it } from 'vitest'
import type { BeadsIssue } from '../../../../../shared/beads/beads-issue-types'
import { resolveBeadsListKey } from './beads-list-keyboard'
import type { BeadsListRow } from './beads-tree-rows'

const ISSUE: BeadsIssue = {
  id: 'x',
  title: 'x',
  status: 'open',
  priority: 2,
  issueType: 'task',
  labels: [],
  createdAt: '',
  updatedAt: '',
  dependencyCount: 0,
  dependentCount: 0,
  commentCount: 0,
  blockedBy: [],
  dependencyEdges: []
}

const ROWS: BeadsListRow[] = [
  {
    kind: 'issue',
    key: 'issue:e1',
    issue: ISSUE,
    depth: 0,
    hasChildren: true,
    expanded: true,
    parentKey: null
  },
  {
    kind: 'issue',
    key: 'issue:c1',
    issue: ISSUE,
    depth: 1,
    hasChildren: false,
    expanded: false,
    parentKey: 'issue:e1'
  },
  {
    kind: 'context',
    key: 'context:e9',
    parentId: 'e9',
    parent: null,
    depth: 0,
    hasChildren: true,
    expanded: false,
    parentKey: null
  }
]

describe('resolveBeadsListKey', () => {
  it('moves the selection with arrows, Home and End', () => {
    expect(resolveBeadsListKey('ArrowDown', ROWS, -1)).toEqual({ type: 'select', index: 0 })
    expect(resolveBeadsListKey('ArrowDown', ROWS, 2)).toEqual({ type: 'select', index: 2 })
    expect(resolveBeadsListKey('ArrowUp', ROWS, 0)).toEqual({ type: 'select', index: 0 })
    expect(resolveBeadsListKey('End', ROWS, 0)).toEqual({ type: 'select', index: 2 })
    expect(resolveBeadsListKey('Home', ROWS, 2)).toEqual({ type: 'select', index: 0 })
  })

  it('expands, enters and collapses parents', () => {
    expect(resolveBeadsListKey('ArrowRight', ROWS, 2)).toEqual({
      type: 'expand',
      key: 'context:e9'
    })
    expect(resolveBeadsListKey('ArrowRight', ROWS, 0)).toEqual({ type: 'select', index: 1 })
    expect(resolveBeadsListKey('ArrowLeft', ROWS, 0)).toEqual({ type: 'collapse', key: 'issue:e1' })
    expect(resolveBeadsListKey('ArrowLeft', ROWS, 1)).toEqual({ type: 'select', index: 0 })
    expect(resolveBeadsListKey('ArrowRight', ROWS, 1)).toEqual({ type: 'none' })
  })

  it('opens issues and toggles context rows on Enter', () => {
    expect(resolveBeadsListKey('Enter', ROWS, 1)).toEqual({ type: 'open', index: 1 })
    expect(resolveBeadsListKey('Enter', ROWS, 2)).toEqual({ type: 'expand', key: 'context:e9' })
  })

  it('ignores other keys, empty lists and no selection for row actions', () => {
    expect(resolveBeadsListKey('s', ROWS, 1)).toEqual({ type: 'none' })
    expect(resolveBeadsListKey('ArrowDown', [], -1)).toEqual({ type: 'none' })
    expect(resolveBeadsListKey('Enter', ROWS, -1)).toEqual({ type: 'none' })
  })
})
