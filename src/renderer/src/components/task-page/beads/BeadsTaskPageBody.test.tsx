// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Repo } from '../../../../../shared/repo-types'
import { TooltipProvider } from '@/components/ui/tooltip'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  loadBeadsStatus: vi.fn(),
  loadBeadsSchema: vi.fn(),
  pollBeadsChangeToken: vi.fn(),
  loadBeadsList: vi.fn(),
  loadBeadsDetails: vi.fn(),
  installPoller: vi.fn(() => () => {}),
  openModal: vi.fn()
}))

// getState is part of the surface: refresh() re-reads the token through it after
// polling. A bare function mock makes any refresh test throw instead of fail.
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))
vi.mock('@/lib/window-visibility-timeout-poller', () => ({
  installWindowVisibilityTimeoutPoller: mocks.installPoller
}))
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 36 })),
    measureElement: () => {},
    scrollToIndex: () => {}
  })
}))
vi.mock('@/components/right-sidebar/right-sidebar-measured-width', () => ({
  useMeasuredWidth: (onWidth: (width: number | null) => void) => () => onWidth(1200)
}))
vi.mock('@/components/sidebar/CommentMarkdown', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>
}))

import { BEADS_TREE_INDEX_REQUEST } from '@/store/slices/beads-load-state'
import { BeadsTaskPageBody } from './BeadsTaskPageBody'

// A real Repo: only id, path, displayName, badgeColor and addedAt are required, so the
// fixture needs no cast — and spreading it for a second repo stays type-safe.
const REPO: Repo = {
  id: 'r1',
  path: '/work/app',
  displayName: 'app',
  badgeColor: '#4f46e5',
  addedAt: 0,
  connectionId: null,
  executionHostId: null
}

// What the hook and the store actions actually receive: the four routing fields, memoized.
const REPO_REF = { id: 'r1', path: '/work/app', connectionId: null, executionHostId: null }

const READY = {
  bdInstalled: true,
  bdVersion: '1.2.2',
  versionSupported: true,
  initialized: true,
  beadsDir: '/work/app/.beads',
  isWorktree: false
}

function issue(id: string, parent?: string) {
  return {
    id,
    title: `Title ${id}`,
    status: 'open',
    priority: 2,
    issueType: id.startsWith('e') ? 'epic' : 'task',
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

// Typed (not `unknown`, like `mocks.state`) so a test can move `changeToken` directly —
// `refresh()` re-reads it through `useAppStore.getState()` after polling.
let repoState: {
  status: unknown
  schema: { data: null; error: null; loading: false; token: null }
  changeToken: string | null
  pollError: unknown
  lists: Record<string, unknown>
  details: Record<string, unknown>
}

function installState(
  status: unknown,
  lists: Record<string, unknown> = {},
  changeToken: string | null = 'h1'
) {
  repoState = {
    status,
    schema: { data: null, error: null, loading: false, token: null },
    changeToken,
    pollError: null,
    lists,
    details: {}
  }
  mocks.state = {
    beadsRepos: { r1: repoState },
    loadBeadsStatus: mocks.loadBeadsStatus,
    loadBeadsSchema: mocks.loadBeadsSchema,
    pollBeadsChangeToken: mocks.pollBeadsChangeToken,
    loadBeadsList: mocks.loadBeadsList,
    loadBeadsDetails: mocks.loadBeadsDetails,
    openModal: mocks.openModal
  }
}

function renderBody(repos: readonly Repo[] = [REPO]) {
  return render(
    <TooltipProvider>
      <BeadsTaskPageBody repos={repos} primaryRepoId="r1" onHide={vi.fn()} />
    </TooltipProvider>
  )
}

beforeEach(() => {
  Object.assign(window, {
    api: { shell: { openUrl: vi.fn() }, ui: { writeClipboardText: vi.fn() } }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('BeadsTaskPageBody', () => {
  it('loads status and shows the setup card until beads is ready', () => {
    installState({
      data: { ...READY, initialized: false },
      error: null,
      loading: false,
      token: null
    })
    renderBody()
    expect(mocks.loadBeadsStatus).toHaveBeenCalledWith(REPO_REF)
    expect(screen.getByText('Initialize beads')).toBeInTheDocument()
    // Not the change-token poller: a slow, visible-only re-check that also runs on focus.
    expect(mocks.installPoller).toHaveBeenCalledWith(
      expect.not.objectContaining({ hiddenDelayMs: expect.anything() })
    )
    expect(mocks.loadBeadsList).not.toHaveBeenCalled()
  })

  it('waits for the first change token before loading anything', () => {
    // Pass the null token in, rather than reaching into `mocks.state` — that field is
    // typed `unknown`, so mutating through it does not typecheck.
    installState({ data: READY, error: null, loading: false, token: null }, {}, null)
    renderBody()
    expect(mocks.installPoller).toHaveBeenCalled()
    expect(mocks.loadBeadsList).not.toHaveBeenCalled()
    expect(mocks.loadBeadsSchema).not.toHaveBeenCalled()
  })

  it('shows a spinner, not an empty list, before the first change token answers', () => {
    installState({ data: READY, error: null, loading: false, token: null }, {}, null)
    renderBody()
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('No issues match')).not.toBeInTheDocument()
    expect(screen.queryByText(/showing the last data loaded/)).not.toBeInTheDocument()
  })

  it('offers a retry, not the stale-data banner, when the first poll fails', () => {
    installState({ data: READY, error: null, loading: false, token: null }, {}, null)
    repoState.pollError = { kind: 'host-offline', message: 'The host is offline.' }
    renderBody()
    expect(screen.getByText('The host is offline.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.queryByText(/showing the last data loaded/)).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('warns when the tree index is truncated', () => {
    const indexKey = JSON.stringify(BEADS_TREE_INDEX_REQUEST)
    installState(
      { data: READY, error: null, loading: false, token: null },
      {
        [indexKey]: {
          data: { issues: [issue('e1')], hasMore: true },
          error: null,
          loading: false,
          token: 'h1'
        }
      }
    )
    renderBody()
    expect(screen.getByText(/More than 2000 issues/)).toBeInTheDocument()
  })

  it('polls, loads the ready list and the tree index, and opens a selected issue', () => {
    const readyKey = JSON.stringify({ view: 'ready', filter: {}, limit: 200 })
    const indexKey = JSON.stringify(BEADS_TREE_INDEX_REQUEST)
    installState(
      { data: READY, error: null, loading: false, token: null },
      {
        [readyKey]: {
          data: { issues: [issue('e1'), issue('c1', 'e1')], hasMore: false },
          error: null,
          loading: false,
          token: 'h1'
        },
        [indexKey]: {
          data: { issues: [issue('e1'), issue('c1', 'e1')], hasMore: false },
          error: null,
          loading: false,
          token: 'h1'
        }
      }
    )
    renderBody()
    expect(mocks.installPoller).toHaveBeenCalledWith(
      expect.objectContaining({ hiddenDelayMs: 60_000 })
    )
    expect(mocks.loadBeadsList).toHaveBeenCalledWith(REPO_REF, {
      view: 'ready',
      filter: {},
      limit: 200
    })
    expect(mocks.loadBeadsList).toHaveBeenCalledWith(REPO_REF, BEADS_TREE_INDEX_REQUEST)
    fireEvent.click(screen.getByText('Title c1'))
    expect(mocks.loadBeadsDetails).toHaveBeenCalledWith(REPO_REF, 'c1')
  })

  it('re-requests the tree index once it is evicted from the cache', () => {
    const readyKey = JSON.stringify({ view: 'ready', filter: {}, limit: 200 })
    const indexKey = JSON.stringify(BEADS_TREE_INDEX_REQUEST)
    installState(
      { data: READY, error: null, loading: false, token: null },
      {
        [readyKey]: {
          data: { issues: [issue('e1')], hasMore: false },
          error: null,
          loading: false,
          token: 'h1'
        },
        [indexKey]: {
          data: { issues: [issue('e1')], hasMore: false },
          error: null,
          loading: false,
          token: 'h1'
        }
      }
    )
    const { rerender } = renderBody()
    mocks.loadBeadsList.mockClear()

    // Why: simulates the 12-entry cache dropping the tree index without the change
    // token moving — nothing else in this test causes a refetch.
    delete repoState.lists[indexKey]
    rerender(
      <TooltipProvider>
        <BeadsTaskPageBody repos={[REPO]} primaryRepoId="r1" onHide={vi.fn()} />
      </TooltipProvider>
    )

    expect(mocks.loadBeadsList).toHaveBeenCalledWith(REPO_REF, BEADS_TREE_INDEX_REQUEST)
  })

  it('keeps existing rows on screen while Load more fetches the next page', () => {
    const readyKey = JSON.stringify({ view: 'ready', filter: {}, limit: 200 })
    const indexKey = JSON.stringify(BEADS_TREE_INDEX_REQUEST)
    installState(
      { data: READY, error: null, loading: false, token: null },
      {
        [readyKey]: {
          data: { issues: [issue('e1')], hasMore: true },
          error: null,
          loading: false,
          token: 'h1'
        },
        [indexKey]: {
          data: { issues: [issue('e1')], hasMore: false },
          error: null,
          loading: false,
          token: 'h1'
        }
      }
    )
    renderBody()
    expect(screen.getByText('Title e1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    // The bigger-page cache key has no data yet (`data: null`); the previous page's
    // row must stay on screen instead of the list collapsing to empty.
    expect(screen.getByText('Title e1')).toBeInTheDocument()
  })

  it('keeps the stale-data banner when a later poll fails after data is already on screen', () => {
    const readyKey = JSON.stringify({ view: 'ready', filter: {}, limit: 200 })
    const indexKey = JSON.stringify(BEADS_TREE_INDEX_REQUEST)
    installState(
      { data: READY, error: null, loading: false, token: null },
      {
        [readyKey]: {
          data: { issues: [issue('e1')], hasMore: false },
          error: null,
          loading: false,
          token: 'h1'
        },
        [indexKey]: {
          data: { issues: [issue('e1')], hasMore: false },
          error: null,
          loading: false,
          token: 'h1'
        }
      }
    )
    repoState.pollError = { kind: 'host-offline', message: 'The host is offline.' }
    renderBody()
    expect(screen.getByText(/showing the last data loaded/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('offers a repository picker when several repositories are selected', () => {
    installState({ data: READY, error: null, loading: false, token: null })
    renderBody([REPO, { ...REPO, id: 'r2', displayName: 'other' }])
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('forces both list reloads when the poll leaves the token unchanged', async () => {
    installState({ data: READY, error: null, loading: false, token: null })
    renderBody()
    mocks.loadBeadsList.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => expect(mocks.pollBeadsChangeToken).toHaveBeenCalledWith(REPO_REF))
    await waitFor(() =>
      expect(mocks.loadBeadsList).toHaveBeenCalledWith(REPO_REF, BEADS_TREE_INDEX_REQUEST, {
        force: true
      })
    )
  })

  it('leaves the reload to the effects when the poll moved the token', async () => {
    installState({ data: READY, error: null, loading: false, token: null })
    // The poll finding new data is exactly when forcing would duplicate the work the
    // [changeToken] effects are about to do.
    mocks.pollBeadsChangeToken.mockImplementation(async () => {
      repoState.changeToken = 'h2'
    })
    renderBody()
    mocks.loadBeadsList.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => expect(mocks.pollBeadsChangeToken).toHaveBeenCalledWith(REPO_REF))
    expect(mocks.loadBeadsList).not.toHaveBeenCalledWith(REPO_REF, expect.anything(), {
      force: true
    })
  })

  it('opens the composer pre-filled with the selected bead', () => {
    const readyKey = JSON.stringify({ view: 'ready', filter: {}, limit: 200 })
    const PAGE = {
      data: { issues: [issue('e1')], hasMore: false },
      error: null,
      loading: false,
      token: 'h1'
    }
    installState({ data: READY, error: null, loading: false, token: null }, { [readyKey]: PAGE })
    // Loaded synchronously so the detail pane's header (not the aria-hidden row
    // button) renders on the first paint after selecting the row below.
    repoState.details.e1 = {
      data: { issue: issue('e1'), dependencies: [], dependents: [], comments: [] },
      error: null,
      loading: false,
      token: 'h1'
    }
    renderBody()
    fireEvent.click(screen.getByText('Title e1'))
    fireEvent.click(screen.getByRole('button', { name: 'Start worktree' }))
    expect(mocks.openModal).toHaveBeenCalledWith(
      'new-workspace-composer',
      expect.objectContaining({
        linkedWorkItem: expect.objectContaining({ provider: 'beads', beadsIdentifier: 'e1' }),
        prefilledName: expect.stringContaining('e1')
      })
    )
  })
})
