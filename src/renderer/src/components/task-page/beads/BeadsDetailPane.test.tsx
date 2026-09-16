// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FALLBACK_BEADS_SCHEMA } from '../../../../../shared/beads/beads-schema'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  loadBeadsDetails: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))

vi.mock('@/components/sidebar/CommentMarkdown', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>
}))

import { BeadsDetailPane } from './BeadsDetailPane'

const REPO = { id: 'r1', path: '/work/app', connectionId: null, executionHostId: null }

const DETAILS = {
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
    dependencyCount: 1,
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
    }
  ],
  dependents: [],
  comments: [{ id: 'c1', author: 'ada', text: 'Looks good', createdAt: '2026-09-15T10:00:00Z' }]
}

function installState(entry: unknown) {
  mocks.state = {
    beadsRepos: {
      r1: { status: {}, schema: {}, changeToken: 'h1', lists: {}, details: { 'cwf.3': entry } }
    },
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
