// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Why mutable: a mock pinned to one width can never render the narrow branch, so a
// layout that split into per-breakpoint trees would still pass every test.
const measured = vi.hoisted(() => ({ width: 1200 }))

vi.mock('@/components/right-sidebar/right-sidebar-measured-width', () => ({
  useMeasuredWidth: (onWidth: (width: number | null) => void) => () => onWidth(measured.width)
}))

import { BeadsSplitLayout, isBeadsSplitWide } from './BeadsSplitLayout'

afterEach(() => {
  cleanup()
  measured.width = 1200
})

describe('isBeadsSplitWide', () => {
  it('uses the 880px breakpoint and treats unknown width as wide', () => {
    expect(isBeadsSplitWide(null)).toBe(true)
    expect(isBeadsSplitWide(880)).toBe(true)
    expect(isBeadsSplitWide(879)).toBe(false)
  })
})

describe('BeadsSplitLayout', () => {
  it('shows list, resize handle and detail side by side when wide', () => {
    render(
      <BeadsSplitLayout
        list={<div>LIST</div>}
        detail={<div>DETAIL</div>}
        detailTitle="cwf.3"
        onCloseDetail={vi.fn()}
      />
    )
    expect(screen.getByText('LIST')).toBeInTheDocument()
    expect(screen.getByText('DETAIL')).toBeInTheDocument()
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('shows an empty-state hint when nothing is selected', () => {
    render(
      <BeadsSplitLayout
        list={<div>LIST</div>}
        detail={null}
        detailTitle=""
        onCloseDetail={vi.fn()}
      />
    )
    expect(screen.getByText('Select an issue to see its details')).toBeInTheDocument()
  })

  it('moves the detail into a drawer when narrow and keeps the list in the same tree', () => {
    // The point of the one-tree design: below the breakpoint the list must still be
    // rendered from the same <aside>, not re-created inside a narrow-only branch.
    measured.width = 800
    render(
      <BeadsSplitLayout
        list={<div>LIST</div>}
        detail={<div>DETAIL</div>}
        detailTitle="cwf.3"
        onCloseDetail={vi.fn()}
      />
    )
    expect(screen.getByText('LIST')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('DETAIL')).toBeInTheDocument()
    // No resize handle in the drawer layout — that affordance is wide-only.
    expect(screen.queryByRole('separator')).toBeNull()
  })
})
