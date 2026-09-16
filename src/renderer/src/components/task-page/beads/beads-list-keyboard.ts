import type { BeadsListRow } from './beads-tree-rows'

export type BeadsListKeyAction =
  | { type: 'select'; index: number }
  | { type: 'expand'; key: string }
  | { type: 'collapse'; key: string }
  | { type: 'open'; index: number }
  | { type: 'none' }

const NONE: BeadsListKeyAction = { type: 'none' }

function clampIndex(index: number, rows: readonly BeadsListRow[]): number {
  return Math.min(Math.max(index, 0), rows.length - 1)
}

export function resolveBeadsListKey(
  key: string,
  rows: readonly BeadsListRow[],
  currentIndex: number
): BeadsListKeyAction {
  if (rows.length === 0) {
    return NONE
  }
  switch (key) {
    case 'ArrowDown':
      return { type: 'select', index: clampIndex(currentIndex + 1, rows) }
    case 'ArrowUp':
      return { type: 'select', index: clampIndex(currentIndex - 1, rows) }
    case 'Home':
      return { type: 'select', index: 0 }
    case 'End':
      return { type: 'select', index: rows.length - 1 }
    default:
      break
  }
  const row = rows[currentIndex]
  if (!row) {
    return NONE
  }
  if (key === 'ArrowRight') {
    if (!row.hasChildren) {
      return NONE
    }
    return row.expanded
      ? { type: 'select', index: clampIndex(currentIndex + 1, rows) }
      : { type: 'expand', key: row.key }
  }
  if (key === 'ArrowLeft') {
    if (row.hasChildren && row.expanded) {
      return { type: 'collapse', key: row.key }
    }
    const parentIndex = row.parentKey ? rows.findIndex((entry) => entry.key === row.parentKey) : -1
    return parentIndex >= 0 ? { type: 'select', index: parentIndex } : NONE
  }
  if (key === 'Enter') {
    if (row.kind === 'issue') {
      return { type: 'open', index: currentIndex }
    }
    return row.expanded ? { type: 'collapse', key: row.key } : { type: 'expand', key: row.key }
  }
  return NONE
}
