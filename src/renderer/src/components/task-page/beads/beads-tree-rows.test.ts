import { describe, expect, it } from 'vitest'
import type { BeadsIssue } from '../../../../../shared/beads/beads-issue-types'
import {
  beadsContextRowKey,
  beadsIssueRowKey,
  buildBeadsListRows,
  buildBeadsProgressByParent
} from './beads-tree-rows'

function issue(id: string, parent?: string, status = 'open'): BeadsIssue {
  return {
    id,
    title: `Title ${id}`,
    status,
    priority: 2,
    issueType: 'task',
    labels: [],
    parent,
    createdAt: '',
    updatedAt: '',
    dependencyCount: 0,
    dependentCount: 0,
    commentCount: 0,
    blockedBy: [],
    dependencyEdges: []
  }
}

function summary(rows: ReturnType<typeof buildBeadsListRows>): string[] {
  return rows.map((row) => `${'  '.repeat(row.depth)}${row.key}${row.expanded ? ' +' : ''}`)
}

describe('buildBeadsListRows', () => {
  it('nests children under parents in the result, even when a child comes first', () => {
    const rows = buildBeadsListRows({
      issues: [issue('c1', 'e1'), issue('e1'), issue('x')],
      index: null,
      mode: 'tree',
      collapsed: new Set()
    })
    expect(summary(rows)).toEqual(['issue:e1 +', '  issue:c1', 'issue:x'])
    expect(rows[1]).toMatchObject({ parentKey: 'issue:e1', hasChildren: false })
  })

  it('groups children of a missing parent under a context row titled from the index', () => {
    const rows = buildBeadsListRows({
      issues: [issue('c1', 'e9'), issue('c2', 'e9')],
      index: [issue('e9')],
      mode: 'tree',
      collapsed: new Set()
    })
    expect(summary(rows)).toEqual(['context:e9 +', '  issue:c1', '  issue:c2'])
    expect(rows[0]).toMatchObject({ kind: 'context', parent: { title: 'Title e9' } })
  })

  it('hides collapsed subtrees, including nested ones', () => {
    const rows = buildBeadsListRows({
      issues: [issue('e1'), issue('c1', 'e1'), issue('g1', 'c1')],
      index: null,
      mode: 'tree',
      collapsed: new Set([beadsIssueRowKey('e1')])
    })
    expect(summary(rows)).toEqual(['issue:e1'])
    expect(rows[0]).toMatchObject({ hasChildren: true, expanded: false })
  })

  it('collapses a context row', () => {
    const rows = buildBeadsListRows({
      issues: [issue('c1', 'e9')],
      index: null,
      mode: 'tree',
      collapsed: new Set([beadsContextRowKey('e9')])
    })
    expect(summary(rows)).toEqual(['context:e9'])
    expect(rows[0]).toMatchObject({ parent: null })
  })

  it('never hides issues caught in a parent cycle', () => {
    const rows = buildBeadsListRows({
      issues: [issue('a', 'b'), issue('b', 'a')],
      index: null,
      mode: 'tree',
      collapsed: new Set()
    })
    expect(rows.map((row) => row.key).sort()).toEqual(['issue:a', 'issue:b'])
  })

  it('renders a flat list at depth zero', () => {
    const rows = buildBeadsListRows({
      issues: [issue('c1', 'e1'), issue('e1')],
      index: null,
      mode: 'flat',
      collapsed: new Set()
    })
    expect(summary(rows)).toEqual(['issue:c1', 'issue:e1'])
  })
})

describe('buildBeadsProgressByParent', () => {
  it('counts closed and total children from the index', () => {
    const progress = buildBeadsProgressByParent(
      [issue('e1'), issue('c1', 'e1', 'closed'), issue('c2', 'e1'), issue('c3', 'e2')],
      (status) => status === 'closed'
    )
    expect(progress.get('e1')).toEqual({ closed: 1, total: 2 })
    expect(progress.get('e2')).toEqual({ closed: 0, total: 1 })
    expect(buildBeadsProgressByParent(null, () => false).size).toBe(0)
  })
})
