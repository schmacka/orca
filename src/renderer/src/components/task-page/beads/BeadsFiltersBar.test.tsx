// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FALLBACK_BEADS_SCHEMA } from '../../../../../shared/beads/beads-schema'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BeadsFiltersBar } from './BeadsFiltersBar'
import { EMPTY_BEADS_FILTERS } from './beads-list-request'

afterEach(cleanup)

function renderBar(overrides: Partial<Parameters<typeof BeadsFiltersBar>[0]> = {}) {
  const props = {
    preset: 'ready' as const,
    onPresetChange: vi.fn(),
    text: '',
    onTextChange: vi.fn(),
    filters: EMPTY_BEADS_FILTERS,
    onFiltersChange: vi.fn(),
    view: 'ready' as const,
    schema: FALLBACK_BEADS_SCHEMA,
    labelOptions: ['ui'],
    epicOptions: [{ id: 'e1', title: 'Epic one' }],
    mode: 'tree' as const,
    onModeChange: vi.fn(),
    refreshing: false,
    onRefresh: vi.fn(),
    ...overrides
  }
  render(
    <TooltipProvider>
      <BeadsFiltersBar {...props} />
    </TooltipProvider>
  )
  return props
}

describe('BeadsFiltersBar', () => {
  it('marks the active preset and switches presets', () => {
    const props = renderBar()
    expect(screen.getByRole('button', { name: 'Ready' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Blocked' }))
    expect(props.onPresetChange).toHaveBeenCalledWith('blocked')
  })

  it('reports search text and mode changes', () => {
    const props = renderBar()
    fireEvent.change(screen.getByPlaceholderText('Search beads'), { target: { value: 'playtest' } })
    expect(props.onTextChange).toHaveBeenCalledWith('playtest')
    fireEvent.click(screen.getByRole('radio', { name: 'Flat view' }))
    expect(props.onModeChange).toHaveBeenCalledWith('flat')
  })

  it('says that search ignores the preset and the epic filter', () => {
    renderBar({ view: 'search', text: 'playtest' })
    expect(
      screen.getByText('Search looks at every issue and ignores the preset and epic filter.')
    ).toBeInTheDocument()
  })

  it('shows a parent that is not in the epic options', () => {
    renderBar({
      filters: { ...EMPTY_BEADS_FILTERS, parent: 'orca-q9' },
      view: 'list',
      preset: 'open'
    })
    expect(screen.getByRole('button', { name: /Epic: orca-q9/ })).toBeInTheDocument()
  })

  it('disables filters the blocked view cannot apply', () => {
    renderBar({ preset: 'blocked', view: 'blocked' })
    expect(screen.getByRole('button', { name: /Type/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Epic/ })).toBeEnabled()
    expect(screen.getByPlaceholderText('Assignee')).toBeDisabled()
  })

  it('clears active filters', () => {
    const props = renderBar({
      filters: { ...EMPTY_BEADS_FILTERS, type: 'bug' },
      view: 'list',
      preset: 'open'
    })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(props.onFiltersChange).toHaveBeenCalledWith(EMPTY_BEADS_FILTERS)
  })

  it('refreshes', () => {
    const props = renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(props.onRefresh).toHaveBeenCalled()
  })
})
