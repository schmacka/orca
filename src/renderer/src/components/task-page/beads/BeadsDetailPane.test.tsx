// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FALLBACK_BEADS_SCHEMA } from '../../../../../shared/beads/beads-schema'
import type { BeadsIssueDetails } from '../../../../../shared/beads/beads-issue-types'

const mocks = vi.hoisted(() => {
  // Typed local, not `as`: the repo forbids type assertions. Unlike a `null`
  // initializer (which narrows to `null`), `{}` keeps the declared record type.
  const state: Record<string, unknown> = {}
  return { state, loadBeadsDetails: vi.fn() }
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))

vi.mock('@/components/sidebar/CommentMarkdown', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>
}))

import { BeadsDetailPane } from './BeadsDetailPane'

const REPO = { id: 'r1', path: '/work/app', connectionId: null, executionHostId: null }

const DETAILS: BeadsIssueDetails = {
  issue: {
    id: 'cwf.3',
    title: 'Run the playtest',
    description: 'Recruit families',
    acceptanceCriteria: 'Notes recorded',
    status: 'open',
    priority: 2,
    issueType: 'task',
    labels: ['evaluation'],
    createdAt: '',
    updatedAt: '',
    dependencyCount: 2,
    dependentCount: 0,
    commentCount: 1,
    blockedBy: [],
    dependencyEdges: []
  },
  dependencies: [
    {
      id: 'cwf.1',
      title: 'Decide store line',
      status: 'open',
      priority: 1,
      issueType: 'task',
      dependencyType: 'blocks'
    },
    {
      id: 'x.9',
      title: 'Explore mechanic',
      status: 'open',
      priority: 3,
      issueType: 'task',
      dependencyType: 'related'
    }
  ],
  dependents: [],
  comments: [{ id: 'c1', author: 'ada', text: 'Looks good', createdAt: '2026-09-15T10:00:00Z' }]
}

const NO_RELATIONS_DETAILS: BeadsIssueDetails = {
  issue: {
    id: 'cwf.3',
    title: 'Run the playtest',
    status: 'open',
    priority: 2,
    issueType: 'task',
    labels: [],
    createdAt: '',
    updatedAt: '',
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

// Typed (not `unknown`, like `mocks.state`) so a test can evict an entry directly —
// that field is typed `unknown`, so mutating through it does not typecheck.
let repoState: {
  status: unknown
  schema: unknown
  changeToken: string | null
  details: Record<string, unknown>
  lists: Record<string, unknown>
}

function installState(entry: unknown, changeToken: string | null = 'h1') {
  repoState = { status: {}, schema: {}, changeToken, lists: {}, details: { 'cwf.3': entry } }
  mocks.state = {
    beadsRepos: { r1: repoState },
    loadBeadsDetails: mocks.loadBeadsDetails
  }
}

beforeEach(() => {
  vi.stubGlobal('window', Object.assign(window, { api: { ui: { writeClipboardText: vi.fn() } } }))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BeadsDetailPane', () => {
  it('loads details for the issue and shows a spinner meanwhile', () => {
    installState(undefined)
    render(
      <BeadsDetailPane
        repo={REPO}
        issueId="cwf.3"
        schema={FALLBACK_BEADS_SCHEMA}
        onOpenIssue={vi.fn()}
      />
    )
    expect(mocks.loadBeadsDetails).toHaveBeenCalledWith(REPO, 'cwf.3')
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('does not load details while the change token has not answered yet', () => {
    installState(undefined, null)
    render(
      <BeadsDetailPane
        repo={REPO}
        issueId="cwf.3"
        schema={FALLBACK_BEADS_SCHEMA}
        onOpenIssue={vi.fn()}
      />
    )
    expect(mocks.loadBeadsDetails).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders header, blocked callout, relations, text and comments', () => {
    installState({ data: DETAILS, error: null, loading: false, token: 'h1' })
    const onOpenIssue = vi.fn()
    render(
      <BeadsDetailPane
        repo={REPO}
        issueId="cwf.3"
        schema={FALLBACK_BEADS_SCHEMA}
        onOpenIssue={onOpenIssue}
      />
    )
    expect(screen.getByText('Run the playtest')).toBeInTheDocument()
    expect(screen.getByText('evaluation')).toBeInTheDocument()
    // Callout heading and the "Blocked by" relation group both render the label.
    expect(screen.getAllByText('Blocked by')).toHaveLength(2)
    expect(screen.getByText('Recruit families')).toBeInTheDocument()
    expect(screen.getByText('Looks good')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /cwf\.1/ })[0])
    expect(onOpenIssue).toHaveBeenCalledWith('cwf.1')
  })

  it('opens the related issue when a relation row (not the blocked callout) is clicked', () => {
    installState({ data: DETAILS, error: null, loading: false, token: 'h1' })
    const onOpenIssue = vi.fn()
    render(
      <BeadsDetailPane
        repo={REPO}
        issueId="cwf.3"
        schema={FALLBACK_BEADS_SCHEMA}
        onOpenIssue={onOpenIssue}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /x\.9/ }))
    expect(onOpenIssue).toHaveBeenCalledWith('x.9')
  })

  it('shows "No relations" and hides the blocked callout when nothing relates', () => {
    installState({ data: NO_RELATIONS_DETAILS, error: null, loading: false, token: 'h1' })
    render(
      <BeadsDetailPane
        repo={REPO}
        issueId="cwf.3"
        schema={FALLBACK_BEADS_SCHEMA}
        onOpenIssue={vi.fn()}
      />
    )
    expect(screen.getByText('No relations')).toBeInTheDocument()
    expect(screen.queryByText('Blocked by')).not.toBeInTheDocument()
  })

  it('re-requests details once the cached entry is evicted', () => {
    installState({ data: DETAILS, error: null, loading: false, token: 'h1' })
    const { rerender } = render(
      <BeadsDetailPane
        repo={REPO}
        issueId="cwf.3"
        schema={FALLBACK_BEADS_SCHEMA}
        onOpenIssue={vi.fn()}
      />
    )
    mocks.loadBeadsDetails.mockClear()

    // Why: simulates the 24-entry details cache dropping this issue's entry without
    // issueId/changeToken changing — nothing else here would cause a refetch.
    delete repoState.details['cwf.3']
    rerender(
      <BeadsDetailPane
        repo={REPO}
        issueId="cwf.3"
        schema={FALLBACK_BEADS_SCHEMA}
        onOpenIssue={vi.fn()}
      />
    )

    expect(mocks.loadBeadsDetails).toHaveBeenCalledWith(REPO, 'cwf.3')
  })

  it('shows the error message', () => {
    installState({
      data: null,
      error: { kind: 'not-found', message: 'Issue cwf.3 was not found.' },
      loading: false,
      token: null
    })
    render(
      <BeadsDetailPane
        repo={REPO}
        issueId="cwf.3"
        schema={FALLBACK_BEADS_SCHEMA}
        onOpenIssue={vi.fn()}
      />
    )
    expect(screen.getByText('Issue cwf.3 was not found.')).toBeInTheDocument()
  })
})
