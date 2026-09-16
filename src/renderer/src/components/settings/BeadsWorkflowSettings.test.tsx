// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => {
  const settings: { beadsActor: string | null; beadsAutoClaim: boolean } = {
    beadsActor: null,
    beadsAutoClaim: true
  }
  // Async: call sites do `void updateSettings(...).catch(...)`, so a plain value throws.
  return { settings, updateSettings: vi.fn(async (_patch: Partial<typeof settings>) => {}) }
})

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ settings: mocks.settings, updateSettings: mocks.updateSettings }),
    { getState: () => ({ settings: mocks.settings, updateSettings: mocks.updateSettings }) }
  )
}))

import { BeadsWorkflowSettings } from './BeadsWorkflowSettings'

afterEach(() => {
  cleanup()
  mocks.settings.beadsActor = null
  mocks.settings.beadsAutoClaim = true
  vi.clearAllMocks()
})

describe('BeadsWorkflowSettings', () => {
  it('writes the actor on blur and not on every keystroke', () => {
    render(<BeadsWorkflowSettings />)
    const field = screen.getByLabelText('Beads actor')
    fireEvent.change(field, { target: { value: '  sebastian  ' } })
    // The constraint made testable: typing must not write.
    expect(mocks.updateSettings).not.toHaveBeenCalled()
    fireEvent.blur(field)
    expect(mocks.updateSettings).toHaveBeenCalledWith({ beadsActor: 'sebastian' })
  })

  it('stores null for a whitespace-only actor so bd uses its own default', () => {
    render(<BeadsWorkflowSettings />)
    const field = screen.getByLabelText('Beads actor')
    fireEvent.change(field, { target: { value: '   ' } })
    fireEvent.blur(field)
    expect(mocks.updateSettings).toHaveBeenCalledWith({ beadsActor: null })
  })

  it('toggles auto-claim', () => {
    render(<BeadsWorkflowSettings />)
    fireEvent.click(screen.getByLabelText('Claim a bead when its worktree is created'))
    expect(mocks.updateSettings).toHaveBeenCalledWith({ beadsAutoClaim: false })
  })
})
