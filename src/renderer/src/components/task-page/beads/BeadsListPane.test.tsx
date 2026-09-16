// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FALLBACK_BEADS_SCHEMA } from '../../../../../shared/beads/beads-schema'
import type { BeadsIssue } from '../../../../../shared/beads/beads-issue-types'
import { BeadsListPane } from './BeadsListPane'
import { buildBeadsListRows } from './beads-tree-rows'

// Why: a mock that always renders every row cannot tell "current row rendered" from
// "current row virtualized out", and would pass even if the component ignored the
// virtualizer entirely. `virtual.window` narrows the rendered slice on demand, and
// scrollToIndex is a stable spy so the scroll-into-view effect can be asserted.
// Why a full-range window instead of `null`: a nullable property would need either a
// type assertion (which the repo forbids) or an annotation, because TypeScript narrows
// an initializer of `null` to `null`. A default window that spans everything keeps the
// type plain `{ start: number; end: number }` and needs neither.
const virtual = vi.hoisted(() => ({
  window: { start: 0, end: Number.MAX_SAFE_INTEGER },
  scrollToIndex: vi.fn((_index: number) => {})
}))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () => {
      const items = Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 36
      }))
      return items.slice(virtual.window.start, virtual.window.end)
    },
    measureElement: () => {},
    scrollToIndex: virtual.scrollToIndex
  })
}))

afterEach(() => {
  cleanup()
  virtual.window = { start: 0, end: Number.MAX_SAFE_INTEGER }
  virtual.scrollToIndex.mockClear()
})

function issue(id: string, parent?: string): BeadsIssue {
  return {
    id,
    title: `Title ${id}`,
    status: id === 'c1' ? 'closed' : 'open',
    priority: 1,
    issueType: 'task',
    labels: ['ui'],
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

function renderPane(overrides: Partial<Parameters<typeof BeadsListPane>[0]> = {}) {
  const rows = buildBeadsListRows({
    issues: [issue('e1'), issue('c1', 'e1'), issue('x')],
    index: null,
    mode: 'tree',
    collapsed: new Set()
  })
  const props = {
    rows,
    schema: FALLBACK_BEADS_SCHEMA,
    progressByParent: new Map([['e1', { closed: 1, total: 2 }]]),
    mode: 'tree' as const,
    currentKey: 'issue:e1',
    hasMore: false,
    loading: false,
    onSelectKey: vi.fn(),
    onToggleKey: vi.fn(),
    onOpenKey: vi.fn(),
    onLoadMore: vi.fn(),
    ...overrides
  }
  render(<BeadsListPane {...props} />)
  return props
}

describe('BeadsListPane', () => {
  it('renders rows with ids, titles, priority and epic progress', () => {
    renderPane()
    // 'issue:e1' → ':' escaped as _3a, so `cwf.3` and `cwf-3` cannot collide.
    expect(screen.getByRole('listbox')).toHaveAttribute(
      'aria-activedescendant',
      'beads-row-issue_3ae1'
    )
    expect(screen.getByText('Title c1')).toBeInTheDocument()
    expect(screen.getAllByText('P1')).toHaveLength(3)
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Title e1/ })).toHaveAttribute('data-current', 'true')
  })

  it('drops aria-activedescendant when the current key matches no row', () => {
    renderPane({ currentKey: 'issue:not-rendered' })
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-activedescendant')
  })

  it('renders only the virtual window and drops aria-activedescendant for a row outside it', () => {
    // The row exists in the data; the virtualizer just has not rendered it. Pointing
    // aria-activedescendant at an id with no DOM node announces nothing.
    virtual.window = { start: 0, end: 1 }
    renderPane({ currentKey: 'issue:c1' })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-activedescendant')
  })

  it('scrolls the current row into view when the selection changes', () => {
    renderPane({ currentKey: 'issue:x' })
    expect(virtual.scrollToIndex).toHaveBeenCalledWith(2)
  })

  it('hides the expand chevron from assistive tech (the option owns the row)', () => {
    renderPane()
    expect(screen.queryByRole('button', { name: /Collapse e1/ })).toBeNull()
    expect(screen.getByRole('option', { name: /Title e1/ }).textContent).not.toContain('Collapse')
  })

  it('navigates with the keyboard', () => {
    const props = renderPane()
    const list = screen.getByRole('listbox')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(props.onSelectKey).toHaveBeenCalledWith('issue:c1')
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(props.onToggleKey).toHaveBeenCalledWith('issue:e1', false)
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(props.onOpenKey).toHaveBeenCalledWith('issue:e1')
  })

  it('selects on click and toggles with the chevron without selecting', () => {
    const props = renderPane()
    fireEvent.click(screen.getByText('Title x'))
    expect(props.onSelectKey).toHaveBeenCalledWith('issue:x')
    // The chevron is aria-hidden (it lives inside a role="option"), so it is invisible
    // to role queries by design — reach it by its title instead.
    fireEvent.click(screen.getByTitle('Collapse e1'))
    expect(props.onToggleKey).toHaveBeenCalledWith('issue:e1', false)
    expect(props.onSelectKey).toHaveBeenCalledTimes(1)
  })

  it('offers Load more when there are more rows', () => {
    const props = renderPane({ hasMore: true })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(props.onLoadMore).toHaveBeenCalled()
  })
})
