// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { BeadsResult, BeadsIssuePage } from '../../../../shared/beads/beads-contract'
import type { BeadsIssue } from '../../../../shared/beads/beads-issue-types'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'
import {
  useBeadsEpicContextAugmentation,
  type BeadsEpicContextAugmentationInput
} from './beads-epic-context-augmentation'

// Why: annotate — a bare literal widens executionHostId to `string`, which pnpm tc rejects.
const REPO: BeadsRepoRef = {
  id: 'r1',
  path: '/work/app',
  connectionId: null,
  executionHostId: null
}

type SetLinkedWorkItemMock = Mock<BeadsEpicContextAugmentationInput['setLinkedWorkItem']>

// Why: pin deferred() gates below to this — the real success shape of the mocked
// listIssues call — rather than a hand-shaped object literal. An unpinned `deferred<T>()`
// call left `issues` to infer as `unknown[]` (the widening trap hiding inside a generic
// instead of at a call site), which no longer assigns to the now-typed mock's
// `BeadsIssue[]`.
type BeadsListIssuesSuccess = Extract<BeadsResult<BeadsIssuePage>, { ok: true }>

// Why: reads the functional updater a setLinkedWorkItem call was given and invokes it —
// a properly-typed helper instead of an `as` cast at each call site. Throws (rather than
// silently passing) if the call captured a plain value instead of an updater function,
// since every production call site in beads-epic-context-augmentation.ts uses one.
function applyLinkedWorkItemUpdate(
  setLinkedWorkItem: SetLinkedWorkItemMock,
  callIndex: number,
  current: LinkedWorkItemSummary | null
): LinkedWorkItemSummary | null {
  const updateArg = setLinkedWorkItem.mock.calls[callIndex]?.[0]
  if (typeof updateArg !== 'function') {
    throw new Error('expected setLinkedWorkItem to be called with a functional updater')
  }
  return updateArg(current)
}

const beadsApi = { listIssues: vi.fn<Window['api']['beads']['listIssues']>() }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

// Why: annotate the return type — the mocked listIssues result is now typed as the
// real BeadsResult<BeadsIssuePage>, whose issues are BeadsIssue[], so a fixture with
// only id/title would widen and fail to assign (the same trap noted on BeadsListIssuesSuccess above).
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

beforeEach(() => {
  vi.stubGlobal('window', { api: { beads: beadsApi } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('useBeadsEpicContextAugmentation', () => {
  it('carries the fetched epic block into the linked item as linkedContext — the block reaching the composer, not just the string builder', async () => {
    const gate = deferred<BeadsListIssuesSuccess>()
    beadsApi.listIssues.mockReturnValue(gate.promise)
    const setLinkedWorkItem: SetLinkedWorkItemMock = vi.fn()

    renderHook(() =>
      useBeadsEpicContextAugmentation({
        initialBeadsEpicSource: { repo: REPO, epic: { id: 'cwf', title: 'Story evaluation kit' } },
        settings: null,
        setLinkedWorkItem
      })
    )

    // Why: the fetch is in flight — the composer must not have touched the linked
    // item yet (this is what proves the click never waited on bd).
    expect(setLinkedWorkItem).not.toHaveBeenCalled()

    gate.resolve({
      ok: true,
      value: { issues: [readyChild('cwf.1', 'Decide the store line')], hasMore: false }
    })
    await act(async () => gate.promise)

    expect(setLinkedWorkItem).toHaveBeenCalledTimes(1)
    // Why: setLinkedWorkItem is called with a functional updater (guards staleness
    // against the current value, not a snapshot) — exercise it directly, the same
    // way the composer's own state setter would.
    const current: LinkedWorkItemSummary = {
      provider: 'beads',
      type: 'issue',
      number: 0,
      title: 'cwf Story evaluation kit',
      url: 'bd://cwf',
      beadsIdentifier: 'cwf'
    }
    const next = applyLinkedWorkItemUpdate(setLinkedWorkItem, 0, current)
    expect(next?.linkedContext).toEqual({
      provider: 'beads',
      version: 1,
      renderedText:
        'Linked Beads epic: cwf — Story evaluation kit\n' +
        'Ready children:\n' +
        '- cwf.1 — Decide the store line\n' +
        'Read any of them with `bd show <id>` (run `bd prime` for workflow context).'
    })
  })

  it('never fetches or updates the linked item for a non-epic bead', async () => {
    const setLinkedWorkItem: SetLinkedWorkItemMock = vi.fn()

    renderHook(() =>
      useBeadsEpicContextAugmentation({
        initialBeadsEpicSource: null,
        settings: null,
        setLinkedWorkItem
      })
    )
    await act(async () => {})

    expect(beadsApi.listIssues).not.toHaveBeenCalled()
    expect(setLinkedWorkItem).not.toHaveBeenCalled()
  })

  it('leaves the linked item untouched when the fetch fails, so the worktree still starts with the plain prompt', async () => {
    beadsApi.listIssues.mockResolvedValue({
      ok: false,
      error: { kind: 'failed', message: 'bd is busy' }
    })
    const setLinkedWorkItem: SetLinkedWorkItemMock = vi.fn()

    renderHook(() =>
      useBeadsEpicContextAugmentation({
        initialBeadsEpicSource: { repo: REPO, epic: { id: 'cwf', title: 'Story evaluation kit' } },
        settings: null,
        setLinkedWorkItem
      })
    )
    await act(async () => {})

    expect(setLinkedWorkItem).not.toHaveBeenCalled()
  })

  it('drops a response for an epic the composer no longer points at', async () => {
    const gate = deferred<BeadsListIssuesSuccess>()
    beadsApi.listIssues.mockReturnValue(gate.promise)
    const setLinkedWorkItem: SetLinkedWorkItemMock = vi.fn()

    renderHook(() =>
      useBeadsEpicContextAugmentation({
        initialBeadsEpicSource: { repo: REPO, epic: { id: 'cwf', title: 'Story evaluation kit' } },
        settings: null,
        setLinkedWorkItem
      })
    )
    gate.resolve({ ok: true, value: { issues: [], hasMore: false } })
    await act(async () => gate.promise)

    const swapped: LinkedWorkItemSummary = {
      provider: 'beads',
      type: 'issue',
      number: 0,
      title: 'other other',
      url: 'bd://other',
      beadsIdentifier: 'other'
    }
    const next = applyLinkedWorkItemUpdate(setLinkedWorkItem, 0, swapped)
    // Why: the user swapped the linked item while the fetch was in flight — the
    // stale epic's children must not attach to whatever is linked now.
    expect(next).toBe(swapped)
  })

  it('retries after a settings change interrupts an in-flight fetch, instead of silently dropping it', async () => {
    const first = deferred<BeadsListIssuesSuccess>()
    const second = deferred<BeadsListIssuesSuccess>()
    beadsApi.listIssues.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const setLinkedWorkItem: SetLinkedWorkItemMock = vi.fn()
    const source = { repo: REPO, epic: { id: 'cwf', title: 'Story evaluation kit' } }

    const hook = renderHook(
      ({ settings }: { settings: { activeRuntimeEnvironmentId: string | null } }) =>
        useBeadsEpicContextAugmentation({
          initialBeadsEpicSource: source,
          settings,
          setLinkedWorkItem
        }),
      { initialProps: { settings: { activeRuntimeEnvironmentId: null } } }
    )

    // Why: a new settings object with the same (still-local) value — a reference
    // change with no routing change, e.g. an unrelated settings field updating
    // upstream — while the first fetch is still in flight must not leave the epic id
    // "already started" forever; the effect's cleanup has to clear that so this
    // re-run retries.
    hook.rerender({ settings: { activeRuntimeEnvironmentId: null } })
    first.resolve({ ok: true, value: { issues: [], hasMore: false } })
    await act(async () => first.promise)

    expect(beadsApi.listIssues).toHaveBeenCalledTimes(2)
    expect(setLinkedWorkItem).not.toHaveBeenCalled()

    second.resolve({
      ok: true,
      value: { issues: [readyChild('cwf.1', 'Decide the store line')], hasMore: false }
    })
    await act(async () => second.promise)

    expect(setLinkedWorkItem).toHaveBeenCalledTimes(1)
  })
})
