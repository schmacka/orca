// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@/components/right-sidebar/right-sidebar-measured-width', () => ({
  useMeasuredWidth: (onWidth: (width: number | null) => void) => () => onWidth(1200)
}))

import { BeadsSplitLayout, isBeadsSplitWide } from './BeadsSplitLayout'

afterEach(cleanup)

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
})
