// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

const beadsApi = { listIssues: vi.fn() }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

// Why: not `Pick<...>` from BeadsIssue's full type — the fetch path only ever reads
// id/title off the returned issues, so a minimal fixture keeps the test honest about
// what buildBeadsEpicPromptBlock actually consumes.
function readyChild(id: string, title: string) {
  return { id, title }
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
    const gate = deferred<{ ok: true; value: { issues: unknown[]; hasMore: boolean } }>()
    beadsApi.listIssues.mockReturnValue(gate.promise)
    const setLinkedWorkItem = vi.fn<BeadsEpicContextAugmentationInput['setLinkedWorkItem']>()

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
    const updater = setLinkedWorkItem.mock.calls[0]?.[0]
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
    const next =
      typeof updater === 'function'
        ? (updater as (value: LinkedWorkItemSummary | null) => LinkedWorkItemSummary | null)(
            current
          )
        : updater
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
    const setLinkedWorkItem = vi.fn<BeadsEpicContextAugmentationInput['setLinkedWorkItem']>()

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
    const setLinkedWorkItem = vi.fn<BeadsEpicContextAugmentationInput['setLinkedWorkItem']>()

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
    const gate = deferred<{ ok: true; value: { issues: unknown[]; hasMore: boolean } }>()
    beadsApi.listIssues.mockReturnValue(gate.promise)
    const setLinkedWorkItem = vi.fn<BeadsEpicContextAugmentationInput['setLinkedWorkItem']>()

    renderHook(() =>
      useBeadsEpicContextAugmentation({
        initialBeadsEpicSource: { repo: REPO, epic: { id: 'cwf', title: 'Story evaluation kit' } },
        settings: null,
        setLinkedWorkItem
      })
    )
    gate.resolve({ ok: true, value: { issues: [], hasMore: false } })
    await act(async () => gate.promise)

    const updater = setLinkedWorkItem.mock.calls[0]?.[0]
    const swapped: LinkedWorkItemSummary = {
      provider: 'beads',
      type: 'issue',
      number: 0,
      title: 'other other',
      url: 'bd://other',
      beadsIdentifier: 'other'
    }
    const next =
      typeof updater === 'function'
        ? (updater as (value: LinkedWorkItemSummary | null) => LinkedWorkItemSummary | null)(
            swapped
          )
        : updater
    // Why: the user swapped the linked item while the fetch was in flight — the
    // stale epic's children must not attach to whatever is linked now.
    expect(next).toBe(swapped)
  })
})
