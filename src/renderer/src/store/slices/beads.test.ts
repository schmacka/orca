import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'

const client = vi.hoisted(() => ({
  beadsGetStatus: vi.fn(),
  beadsGetSchema: vi.fn(),
  beadsGetChangeToken: vi.fn(),
  beadsListIssues: vi.fn(),
  beadsGetIssueDetails: vi.fn()
}))

vi.mock('@/runtime/runtime-beads-client', () => client)

import type { AppState } from '../types'
import { createBeadsSlice } from './beads'
import { beadsListKey, BEADS_LIST_CACHE_MAX, selectBeadsRepoState } from './beads-load-state'

const REPO = { id: 'r1', path: '/work/app', connectionId: null, executionHostId: null }
const REQUEST = { view: 'ready' as const, filter: {}, limit: 200 }

function createTestStore() {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the slice only reads `settings` and its own fields; the rest of AppState is unused in these tests.
  return create<AppState>()((...a) => ({ settings: null, ...createBeadsSlice(...a) }) as AppState)
}

function page(ids: string[]) {
  return {
    ok: true,
    value: { issues: ids.map((id) => ({ id, title: id })), hasMore: false }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('beads slice', () => {
  it('loads status and keeps a failure as data', async () => {
    const store = createTestStore()
    client.beadsGetStatus.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'bd-missing', message: 'bd is not installed on this host.' }
    })
    await store.getState().loadBeadsStatus(REPO)
    const status = selectBeadsRepoState(store.getState(), 'r1').status
    expect(status).toMatchObject({ loading: false, data: null, error: { kind: 'bd-missing' } })
  })

  it('serves a list from cache until the change token moves', async () => {
    const store = createTestStore()
    client.beadsGetChangeToken.mockResolvedValue({ ok: true, value: 'h1' })
    client.beadsListIssues.mockResolvedValue(page(['a']))

    await store.getState().pollBeadsChangeToken(REPO)
    await store.getState().loadBeadsList(REPO, REQUEST)
    await store.getState().loadBeadsList(REPO, REQUEST)
    expect(client.beadsListIssues).toHaveBeenCalledTimes(1)

    client.beadsGetChangeToken.mockResolvedValue({ ok: true, value: 'h2' })
    await store.getState().pollBeadsChangeToken(REPO)
    const stale = selectBeadsRepoState(store.getState(), 'r1').lists[beadsListKey(REQUEST)]
    expect(stale?.data?.issues).toHaveLength(1)
    await store.getState().loadBeadsList(REPO, REQUEST)
    expect(client.beadsListIssues).toHaveBeenCalledTimes(2)
  })

  it('reloads when forced and ignores a stale response that finishes last', async () => {
    const store = createTestStore()
    let resolveFirst: (value: unknown) => void = () => {}
    client.beadsListIssues
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(page(['new']))

    const first = store.getState().loadBeadsList(REPO, REQUEST, { force: true })
    await store.getState().loadBeadsList(REPO, REQUEST, { force: true })
    resolveFirst(page(['old']))
    await first

    const entry = selectBeadsRepoState(store.getState(), 'r1').lists[beadsListKey(REQUEST)]
    expect(entry?.data?.issues.map((issue) => issue.id)).toEqual(['new'])
  })

  it('stores details per issue id and schema per token', async () => {
    const store = createTestStore()
    client.beadsGetIssueDetails.mockResolvedValue({
      ok: true,
      value: { issue: { id: 'p-1' }, dependencies: [], dependents: [], comments: [] }
    })
    client.beadsGetSchema.mockResolvedValue({ ok: true, value: { statuses: [], types: [] } })
    await store.getState().loadBeadsDetails(REPO, 'p-1')
    await store.getState().loadBeadsSchema(REPO)
    await store.getState().loadBeadsSchema(REPO)
    const repoState = selectBeadsRepoState(store.getState(), 'r1')
    expect(repoState.details['p-1']?.data?.issue.id).toBe('p-1')
    expect(client.beadsGetSchema).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous token when polling fails and records why', async () => {
    const store = createTestStore()
    client.beadsGetChangeToken
      .mockResolvedValueOnce({ ok: true, value: 'h1' })
      .mockResolvedValueOnce({ ok: false, error: { kind: 'busy', message: 'busy' } })
    await store.getState().pollBeadsChangeToken(REPO)
    await store.getState().pollBeadsChangeToken(REPO)
    expect(selectBeadsRepoState(store.getState(), 'r1')).toMatchObject({
      changeToken: 'h1',
      pollError: { kind: 'busy' }
    })

    client.beadsGetChangeToken.mockResolvedValueOnce({ ok: true, value: 'h1' })
    await store.getState().pollBeadsChangeToken(REPO)
    expect(selectBeadsRepoState(store.getState(), 'r1').pollError).toBeNull()
  })

  it('caps the list cache so search keystrokes cannot grow it forever', async () => {
    const store = createTestStore()
    client.beadsGetChangeToken.mockResolvedValue({ ok: true, value: 'h1' })
    client.beadsListIssues.mockResolvedValue(page(['a']))
    await store.getState().pollBeadsChangeToken(REPO)
    for (let index = 0; index < BEADS_LIST_CACHE_MAX + 3; index += 1) {
      await store.getState().loadBeadsList(REPO, { ...REQUEST, text: `q${index}` })
    }
    const lists = selectBeadsRepoState(store.getState(), 'r1').lists
    expect(Object.keys(lists)).toHaveLength(BEADS_LIST_CACHE_MAX)
    // The newest key survives, the first ones were dropped.
    expect(lists[beadsListKey({ ...REQUEST, text: 'q0' })]).toBeUndefined()
    expect(lists[beadsListKey({ ...REQUEST, text: `q${BEADS_LIST_CACHE_MAX + 2}` })]).toBeDefined()
  })
})
