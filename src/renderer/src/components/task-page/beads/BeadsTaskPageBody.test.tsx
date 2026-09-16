// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Repo } from '../../../../../shared/repo-types'
import { TooltipProvider } from '@/components/ui/tooltip'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  loadBeadsStatus: vi.fn(),
  loadBeadsSchema: vi.fn(),
  pollBeadsChangeToken: vi.fn(),
  loadBeadsList: vi.fn(),
  loadBeadsDetails: vi.fn(),
  installPoller: vi.fn(() => () => {})
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
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

import { BEADS_TREE_INDEX_REQUEST } from './beads-list-request'
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

function installState(
  status: unknown,
  lists: Record<string, unknown> = {},
  changeToken: string | null = 'h1'
) {
  mocks.state = {
    beadsRepos: {
      r1: {
        status,
        schema: { data: null, error: null, loading: false, token: null },
        changeToken,
        pollError: null,
        lists,
        details: {}
      }
    },
    loadBeadsStatus: mocks.loadBeadsStatus,
    loadBeadsSchema: mocks.loadBeadsSchema,
    pollBeadsChangeToken: mocks.pollBeadsChangeToken,
    loadBeadsList: mocks.loadBeadsList,
    loadBeadsDetails: mocks.loadBeadsDetails
  }
}

function renderBody(repos: readonly Repo[] = [REPO]) {
  render(
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

  it('offers a repository picker when several repositories are selected', () => {
    installState({ data: READY, error: null, loading: false, token: null })
    renderBody([REPO, { ...REPO, id: 'r2', displayName: 'other' }])
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
