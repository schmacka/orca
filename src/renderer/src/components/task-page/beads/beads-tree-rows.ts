import type { BeadsIssue } from '../../../../../shared/beads/beads-issue-types'

export type BeadsListMode = 'tree' | 'flat'

export type BeadsProgress = { closed: number; total: number }

export type BeadsIssueListRow = {
  kind: 'issue'
  key: string
  issue: BeadsIssue
  depth: number
  hasChildren: boolean
  expanded: boolean
  parentKey: string | null
}

export type BeadsContextListRow = {
  kind: 'context'
  key: string
  parentId: string
  parent: BeadsIssue | null
  depth: 0
  hasChildren: true
  expanded: boolean
  parentKey: null
}

export type BeadsListRow = BeadsIssueListRow | BeadsContextListRow

export type BeadsListRowsInput = {
  issues: readonly BeadsIssue[]
  index: readonly BeadsIssue[] | null
  mode: BeadsListMode
  collapsed: ReadonlySet<string>
}

export function beadsIssueRowKey(id: string): string {
  return `issue:${id}`
}

export function beadsContextRowKey(id: string): string {
  return `context:${id}`
}

function flatRows(issues: readonly BeadsIssue[]): BeadsListRow[] {
  return issues.map((issue) => ({
    kind: 'issue',
    key: beadsIssueRowKey(issue.id),
    issue,
    depth: 0,
    hasChildren: false,
    expanded: false,
    parentKey: null
  }))
}

export function buildBeadsListRows(input: BeadsListRowsInput): BeadsListRow[] {
  const { issues, index, mode, collapsed } = input
  if (mode === 'flat') {
    return flatRows(issues)
  }
  const ids = new Set(issues.map((issue) => issue.id))
  // Why: push into the existing array instead of spreading a copy per child — spreading
  // here was O(n) per insert (O(n²) total) for a parent with n children.
  const children = new Map<string, BeadsIssue[]>()
  for (const issue of issues) {
    if (!issue.parent) {
      continue
    }
    const siblings = children.get(issue.parent)
    if (siblings) {
      siblings.push(issue)
    } else {
      children.set(issue.parent, [issue])
    }
  }
  const indexById = new Map((index ?? []).map((entry) => [entry.id, entry]))
  const rows: BeadsListRow[] = []
  const emitted = new Set<string>()
  const hidden = new Set<string>()

  const hide = (issue: BeadsIssue): void => {
    if (hidden.has(issue.id) || emitted.has(issue.id)) {
      return
    }
    hidden.add(issue.id)
    for (const child of children.get(issue.id) ?? []) {
      hide(child)
    }
  }

  const emitIssue = (issue: BeadsIssue, depth: number, parentKey: string | null): void => {
    if (emitted.has(issue.id)) {
      return
    }
    emitted.add(issue.id)
    const key = beadsIssueRowKey(issue.id)
    const kids = (children.get(issue.id) ?? []).filter((child) => !emitted.has(child.id))
    const hasChildren = kids.length > 0
    const expanded = hasChildren && !collapsed.has(key)
    rows.push({ kind: 'issue', key, issue, depth, hasChildren, expanded, parentKey })
    for (const kid of kids) {
      if (expanded) {
        emitIssue(kid, depth + 1, key)
      } else {
        hide(kid)
      }
    }
  }

  const contexts = new Set<string>()
  for (const issue of issues) {
    if (emitted.has(issue.id) || hidden.has(issue.id)) {
      continue
    }
    const parentId = issue.parent
    if (parentId && ids.has(parentId)) {
      continue
    }
    if (!parentId) {
      emitIssue(issue, 0, null)
      continue
    }
    if (contexts.has(parentId)) {
      continue
    }
    contexts.add(parentId)
    const key = beadsContextRowKey(parentId)
    const expanded = !collapsed.has(key)
    rows.push({
      kind: 'context',
      key,
      parentId,
      parent: indexById.get(parentId) ?? null,
      depth: 0,
      hasChildren: true,
      expanded,
      parentKey: null
    })
    for (const kid of children.get(parentId) ?? []) {
      if (expanded) {
        emitIssue(kid, 1, key)
      } else {
        hide(kid)
      }
    }
  }

  // Why: a parent cycle (a→b→a) skips both issues above; emit leftovers at the root.
  for (const issue of issues) {
    if (!emitted.has(issue.id) && !hidden.has(issue.id)) {
      emitIssue(issue, 0, null)
    }
  }
  return rows
}

export function buildBeadsProgressByParent(
  index: readonly BeadsIssue[] | null,
  isDone: (status: string) => boolean
): ReadonlyMap<string, BeadsProgress> {
  const progress = new Map<string, BeadsProgress>()
  for (const entry of index ?? []) {
    if (!entry.parent) {
      continue
    }
    const current = progress.get(entry.parent) ?? { closed: 0, total: 0 }
    progress.set(entry.parent, {
      closed: current.closed + (isDone(entry.status) ? 1 : 0),
      total: current.total + 1
    })
  }
  return progress
}
