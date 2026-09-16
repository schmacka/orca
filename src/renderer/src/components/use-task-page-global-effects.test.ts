// @vitest-environment happy-dom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isEscapeOwnedByOpenOverlay, useEscapeClosesTaskPage } from './use-task-page-global-effects'

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function pressEscape(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

describe('isEscapeOwnedByOpenOverlay', () => {
  it('treats an open Sheet as owning Esc, same as menus/popovers/selects', () => {
    const sheet = document.createElement('div')
    sheet.setAttribute('data-slot', 'sheet-content')
    document.body.appendChild(sheet)
    expect(isEscapeOwnedByOpenOverlay()).toBe(true)
  })

  it('is false with nothing open', () => {
    expect(isEscapeOwnedByOpenOverlay()).toBe(false)
  })
})

describe('useEscapeClosesTaskPage', () => {
  it('does not close the task page when a beads detail Sheet is open', () => {
    const closeTaskPage = vi.fn()
    renderHook(() => useEscapeClosesTaskPage(closeTaskPage, false))

    const sheet = document.createElement('div')
    sheet.setAttribute('data-slot', 'sheet-content')
    document.body.appendChild(sheet)

    pressEscape()

    expect(closeTaskPage).not.toHaveBeenCalled()
  })

  it('closes the task page on Esc when nothing owns it', () => {
    const closeTaskPage = vi.fn()
    renderHook(() => useEscapeClosesTaskPage(closeTaskPage, false))

    pressEscape()

    expect(closeTaskPage).toHaveBeenCalledTimes(1)
  })

  it('does not install a handler while a store-level modal/detail is open', () => {
    const closeTaskPage = vi.fn()
    renderHook(() => useEscapeClosesTaskPage(closeTaskPage, true))

    pressEscape()

    expect(closeTaskPage).not.toHaveBeenCalled()
  })
})
