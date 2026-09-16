import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BeadsIssue } from '../../../shared/beads/beads-issue-types'
import type { BeadsListArgs } from '../../../shared/beads/beads-contract'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'
import { buildBeadsEpicPromptBlock, fetchBeadsEpicLinkedContext } from './beads-epic-launch-context'

describe('buildBeadsEpicPromptBlock', () => {
  it('lists ready children under the epic', () => {
    expect(
      buildBeadsEpicPromptBlock({ id: 'cwf', title: 'Story evaluation kit' }, [
        { id: 'cwf.1', title: 'Decide the store line' },
        { id: 'cwf.2', title: 'Run the rating run' }
      ])
    ).toBe(
      'Linked Beads epic: cwf — Story evaluation kit\n' +
        'Ready children:\n' +
        '- cwf.1 — Decide the store line\n' +
        '- cwf.2 — Run the rating run\n' +
        'Read any of them with `bd show <id>` (run `bd prime` for workflow context).'
    )
  })

  it('says so plainly when nothing is ready', () => {
    expect(buildBeadsEpicPromptBlock({ id: 'cwf', title: 'Story evaluation kit' }, [])).toBe(
      'Linked Beads epic: cwf — Story evaluation kit\n' +
        'No children are ready right now; check with `bd ready --parent cwf`.'
    )
  })

  it('escapes control characters in child titles the same way the single-issue block does', () => {
    expect(
      buildBeadsEpicPromptBlock({ id: 'cwf', title: 'Epic' }, [
        { id: 'cwf.1', title: 'line one\nline two' }
      ])
    ).toBe(
      'Linked Beads epic: cwf — Epic\n' +
        'Ready children:\n' +
        '- cwf.1 — line one\\x0Aline two\n' +
        'Read any of them with `bd show <id>` (run `bd prime` for workflow context).'
    )
  })
})

// Why: annotate — a bare object literal would widen executionHostId to `string`,
// which pnpm tc rejects (see runtime-beads-client.test.ts for the same trap).
const REPO: BeadsRepoRef = {
  id: 'r1',
  path: '/work/app',
  connectionId: null,
  executionHostId: null
}

// Why: annotate issueType — the same widening trap as above applies to BeadsIssue fixtures.
function readyChild(id: string, title: string): BeadsIssue {
  return {
    id,
    title,
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
  }
}

const beadsApi = {
  listIssues: vi.fn()
}

beforeEach(() => {
  vi.stubGlobal('window', { api: { beads: beadsApi } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('fetchBeadsEpicLinkedContext', () => {
  it('builds a beads linkedContext from the ready-children lookup, requesting only the ready view scoped to the parent', async () => {
    beadsApi.listIssues.mockResolvedValue({
      ok: true,
      value: { issues: [readyChild('cwf.1', 'Decide the store line')], hasMore: false }
    })

    const result = await fetchBeadsEpicLinkedContext(null, {
      repo: REPO,
      epic: { id: 'cwf', title: 'Story evaluation kit' }
    })

    expect(result).toEqual({
      provider: 'beads',
      version: 1,
      renderedText:
        'Linked Beads epic: cwf — Story evaluation kit\n' +
        'Ready children:\n' +
        '- cwf.1 — Decide the store line\n' +
        'Read any of them with `bd show <id>` (run `bd prime` for workflow context).'
    })
    const args = beadsApi.listIssues.mock.calls[0]?.[0] as BeadsListArgs
    // Why: the 'ready' view rejects `statuses` and `includeClosed` — pinning the exact
    // request shape catches a regression that adds either back.
    expect(args.request).toEqual({
      view: 'ready',
      filter: { parent: 'cwf' },
      limit: 200
    })
  })

  it('returns null (never throws) when the lookup fails, so the caller can keep the plain prompt', async () => {
    beadsApi.listIssues.mockResolvedValue({
      ok: false,
      error: { kind: 'failed', message: 'bd is busy' }
    })

    const result = await fetchBeadsEpicLinkedContext(null, {
      repo: REPO,
      epic: { id: 'cwf', title: 'Story evaluation kit' }
    })

    expect(result).toBeNull()
  })
})
