// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BeadsSetupCard, beadsSetupState } from './BeadsSetupCard'

const READY = {
  bdInstalled: true,
  bdVersion: '1.2.2',
  versionSupported: true,
  initialized: true,
  beadsDir: '/r/.beads',
  isWorktree: false
}

function load(data: unknown, error: unknown = null, loading = false) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test fixtures build BeadsLoad values with partial status objects.
  return { data, error, loading, token: null } as Parameters<typeof beadsSetupState>[0]
}

const openUrl = vi.fn()
const writeClipboardText = vi.fn()

beforeEach(() => {
  Object.assign(window, { api: { shell: { openUrl }, ui: { writeClipboardText } } })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('beadsSetupState', () => {
  it('orders states by what the user must fix first', () => {
    expect(beadsSetupState(load(null, null, true))).toBe('loading')
    expect(beadsSetupState(load({ ...READY, bdInstalled: false }))).toBe('missing')
    expect(beadsSetupState(load({ ...READY, versionSupported: false }))).toBe('outdated')
    expect(beadsSetupState(load({ ...READY, initialized: false }))).toBe('uninitialized')
    expect(beadsSetupState(load(READY))).toBe('ready')
    expect(beadsSetupState(load(null, { kind: 'failed', message: 'boom' }))).toBe('error')
    expect(
      beadsSetupState(load({ ...READY, initialized: false }, { kind: 'failed', message: 'x' }))
    ).toBe('uninitialized')
  })
})

describe('BeadsSetupCard', () => {
  it('renders nothing when beads is ready', () => {
    const { container } = render(
      <BeadsSetupCard status={load(READY)} repoName="app" onRecheck={vi.fn()} onHide={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('guides installation and re-checks', () => {
    const onRecheck = vi.fn()
    render(
      <BeadsSetupCard
        status={load({ ...READY, bdInstalled: false })}
        repoName="app"
        onRecheck={onRecheck}
        onHide={vi.fn()}
      />
    )
    expect(screen.getByText('Install bd')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open install guide' }))
    expect(openUrl).toHaveBeenCalledWith('https://github.com/gastownhall/beads')
    fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
    expect(onRecheck).toHaveBeenCalled()
  })

  it('copies bd init for uninitialized repositories and can hide the source', () => {
    const onHide = vi.fn()
    render(
      <BeadsSetupCard
        status={load({ ...READY, initialized: false })}
        repoName="app"
        onRecheck={vi.fn()}
        onHide={onHide}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Copy bd init' }))
    expect(writeClipboardText).toHaveBeenCalledWith('bd init')
    fireEvent.click(screen.getByRole('button', { name: 'Hide Beads' }))
    expect(onHide).toHaveBeenCalled()
  })

  it('shows offline hosts and error messages', () => {
    render(
      <BeadsSetupCard
        status={load(null, { kind: 'host-offline', message: 'SSH connection unavailable' })}
        repoName="app"
        onRecheck={vi.fn()}
        onHide={vi.fn()}
      />
    )
    expect(screen.getByText('The host is offline')).toBeInTheDocument()
    expect(screen.getByText('SSH connection unavailable')).toBeInTheDocument()
  })
})
