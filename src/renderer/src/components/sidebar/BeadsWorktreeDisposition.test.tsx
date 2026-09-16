// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'
import type { BeadsResult } from '../../../../shared/beads/beads-contract'
import type { BeadsIssueDetails } from '../../../../shared/beads/beads-issue-types'
import type { BeadsRepoState } from '@/store/slices/beads-slice-contract'
import { useBeadsDisposition, type BeadsDispositionWorktree } from './use-beads-disposition'
import { BeadsWorktreeDisposition } from './BeadsWorktreeDisposition'

function issueDetails(status: string): BeadsIssueDetails {
  return {
    issue: {
      id: 'cwf.3',
      title: 'Test issue',
      status,
      priority: 1,
      issueType: 'task',
      labels: [],
      createdAt: '2026-09-16T00:00:00.000Z',
      updatedAt: '2026-09-16T00:00:00.000Z',
      dependencyCount: 0,
      dependentCount: 0,
      commentCount: 0,
      blockedBy: [],
      dependencyEdges: []
    },
    dependencies: [],
    dependents: [],
    comments: []
  }
}

const mocks = vi.hoisted(() => {
  const loadBeadsDetails = vi.fn<(repo: unknown, id: string) => Promise<void>>(async () => {})
  const closeBeadsIssue =
    vi.fn<(repo: unknown, id: string, reason: string) => Promise<BeadsResult<BeadsIssueDetails>>>()
  const unclaimBeadsIssue =
    vi.fn<(repo: unknown, id: string) => Promise<BeadsResult<BeadsIssueDetails>>>()

  const beadsRepos: Record<string, BeadsRepoState> = {}
  const state = {
    loadBeadsDetails,
    closeBeadsIssue,
    unclaimBeadsIssue,
    beadsRepos
  }

  return { state, loadBeadsDetails, closeBeadsIssue, unclaimBeadsIssue }
})

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))

const REPO: Repo = {
  id: 'repo-1',
  path: '/work/app',
  displayName: 'app',
  badgeColor: '#000000',
  addedAt: 0,
  connectionId: null,
  executionHostId: null
}

const REPO_MAP = new Map<string, Repo>([['repo-1', REPO]])

const BEADS_WORKTREE: BeadsDispositionWorktree = {
  repoId: 'repo-1',
  linkedWorkItem: {
    provider: 'beads',
    type: 'issue',
    number: 0,
    title: 'Test issue',
    url: '',
    beadsIdentifier: 'cwf.3'
  }
}

function withResolvedIssue(status: string): void {
  mocks.state.beadsRepos = {
    'repo-1': {
      status: { data: null, error: null, loading: false, token: null },
      schema: { data: null, error: null, loading: false, token: null },
      changeToken: null,
      pollError: null,
      lists: {},
      details: { 'cwf.3': { data: issueDetails(status), error: null, loading: false, token: null } }
    }
  }
}

afterEach(cleanup)

describe('useBeadsDisposition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.beadsRepos = {}
  })

  // The default selection must never close a bead by inertia — this is the
  // regression test for a future change of default.
  it('defaults to leave', () => {
    const { result } = renderHook(() =>
      useBeadsDisposition({ isOpen: true, worktree: BEADS_WORKTREE, repoMap: REPO_MAP })
    )
    expect(result.current.disposition).toBe('leave')
  })

  it('reports a changed disposition back to its caller', () => {
    const { result } = renderHook(() =>
      useBeadsDisposition({ isOpen: true, worktree: BEADS_WORKTREE, repoMap: REPO_MAP })
    )
    act(() => {
      result.current.setDisposition('unclaim')
    })
    expect(result.current.disposition).toBe('unclaim')
  })

  it('refuses a close with an empty reason and allows it once a reason is set', () => {
    const { result } = renderHook(() =>
      useBeadsDisposition({ isOpen: true, worktree: BEADS_WORKTREE, repoMap: REPO_MAP })
    )
    act(() => {
      result.current.setDisposition('close')
    })
    expect(result.current.canSubmit).toBe(false)
    act(() => {
      result.current.setReason('   ')
    })
    expect(result.current.canSubmit).toBe(false)
    act(() => {
      result.current.setReason('Completed')
    })
    expect(result.current.canSubmit).toBe(true)
  })

  it('stays quiet while the bead status has not resolved yet', () => {
    const { result } = renderHook(() =>
      useBeadsDisposition({ isOpen: true, worktree: BEADS_WORKTREE, repoMap: REPO_MAP })
    )
    expect(result.current.needed).toBe(false)
  })

  it('is needed once the linked bead resolves to an open status', () => {
    withResolvedIssue('open')
    const { result } = renderHook(() =>
      useBeadsDisposition({ isOpen: true, worktree: BEADS_WORKTREE, repoMap: REPO_MAP })
    )
    expect(result.current.needed).toBe(true)
  })

  it('fetches the bead details when the dialog opens', () => {
    renderHook(() =>
      useBeadsDisposition({ isOpen: true, worktree: BEADS_WORKTREE, repoMap: REPO_MAP })
    )
    expect(mocks.loadBeadsDetails).toHaveBeenCalledWith(
      { id: 'repo-1', path: '/work/app', connectionId: null, executionHostId: null },
      'cwf.3'
    )
  })

  it('does not fetch while the dialog is closed', () => {
    renderHook(() =>
      useBeadsDisposition({ isOpen: false, worktree: BEADS_WORKTREE, repoMap: REPO_MAP })
    )
    expect(mocks.loadBeadsDetails).not.toHaveBeenCalled()
  })

  it('runs the chosen disposition against the resolved repo and issue', async () => {
    withResolvedIssue('open')
    mocks.unclaimBeadsIssue.mockResolvedValue({ ok: true, value: issueDetails('open') })
    const { result } = renderHook(() =>
      useBeadsDisposition({ isOpen: true, worktree: BEADS_WORKTREE, repoMap: REPO_MAP })
    )
    act(() => {
      result.current.setDisposition('unclaim')
    })
    await act(async () => {
      await result.current.run()
    })
    expect(mocks.unclaimBeadsIssue).toHaveBeenCalledWith(
      { id: 'repo-1', path: '/work/app', connectionId: null, executionHostId: null },
      'cwf.3'
    )
  })

  it('run() is a no-op when a disposition is not needed', async () => {
    const { result } = renderHook(() =>
      useBeadsDisposition({ isOpen: true, worktree: BEADS_WORKTREE, repoMap: REPO_MAP })
    )
    const outcome = await result.current.run()
    expect(outcome).toBeNull()
    expect(mocks.unclaimBeadsIssue).not.toHaveBeenCalled()
    expect(mocks.closeBeadsIssue).not.toHaveBeenCalled()
  })
})

describe('BeadsWorktreeDisposition', () => {
  it('renders nothing when a disposition is not needed, leaving a non-beads delete untouched', () => {
    const { container } = render(
      <BeadsWorktreeDisposition
        needed={false}
        disposition="leave"
        onDispositionChange={vi.fn()}
        reason=""
        onReasonChange={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('selects Leave as is by default', () => {
    render(
      <BeadsWorktreeDisposition
        needed
        disposition="leave"
        onDispositionChange={vi.fn()}
        reason=""
        onReasonChange={vi.fn()}
      />
    )
    expect(screen.getByRole('radio', { name: 'Leave as is' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Close with reason' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Unclaim (back to open)' })).not.toBeChecked()
  })

  it('disables the reason field unless Close is selected', () => {
    const { rerender } = render(
      <BeadsWorktreeDisposition
        needed
        disposition="leave"
        onDispositionChange={vi.fn()}
        reason=""
        onReasonChange={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Reason')).toBeDisabled()

    rerender(
      <BeadsWorktreeDisposition
        needed
        disposition="close"
        onDispositionChange={vi.fn()}
        reason=""
        onReasonChange={vi.fn()}
      />
    )
    expect(screen.getByLabelText('Reason')).toBeEnabled()
  })

  it('reports the selected radio to its caller', async () => {
    const user = userEvent.setup()
    const onDispositionChange = vi.fn()
    render(
      <BeadsWorktreeDisposition
        needed
        disposition="leave"
        onDispositionChange={onDispositionChange}
        reason=""
        onReasonChange={vi.fn()}
      />
    )
    await user.click(screen.getByRole('radio', { name: 'Close with reason' }))
    expect(onDispositionChange).toHaveBeenCalledWith('close')
  })

  it('reports edited reason text to its caller', async () => {
    const user = userEvent.setup()
    const onReasonChange = vi.fn()
    render(
      <BeadsWorktreeDisposition
        needed
        disposition="close"
        onDispositionChange={vi.fn()}
        reason=""
        onReasonChange={onReasonChange}
      />
    )
    await user.type(screen.getByLabelText('Reason'), 'x')
    expect(onReasonChange).toHaveBeenCalledWith('x')
  })
})
