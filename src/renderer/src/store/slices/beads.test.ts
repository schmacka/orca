import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'

const client = vi.hoisted(() => ({
  beadsGetStatus: vi.fn(),
  beadsGetSchema: vi.fn(),
  beadsGetChangeToken: vi.fn(),
  beadsListIssues: vi.fn(),
  beadsGetIssueDetails: vi.fn(),
  beadsClaimIssue: vi.fn(),
  beadsCloseIssue: vi.fn(),
  beadsUpdateIssue: vi.fn()
}))

vi.mock('@/runtime/runtime-beads-client', () => client)

import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { AppState } from '../types'
import { createBeadsSlice } from './beads'
import {
  beadsListKey,
  BEADS_LIST_CACHE_MAX,
  BEADS_TREE_INDEX_REQUEST,
  selectBeadsRepoState
} from './beads-load-state'

const REPO = { id: 'r1', path: '/work/app', connectionId: null, executionHostId: null }
const REQUEST = { view: 'ready' as const, filter: {}, limit: 200 }

function details(overrides: { status?: string; assignee?: string } = {}) {
  return {
    ok: true,
    value: {
      issue: { id: 'p-1', title: 'Fix it', status: 'open', ...overrides },
      dependencies: [],
      dependents: [],
      comments: []
    }
  }
}

// Why: the slice only reads `settings.beadsActor` and its own fields, so tests pass
// just those two rather than a full GlobalSettings fixture.
type TestSettings = Pick<GlobalSettings, 'beadsActor' | 'beadsAutoClaim'> | null

function createTestStore(settings: TestSettings = null) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the slice only reads `settings` (here a partial GlobalSettings, or null) and its own fields; the rest of AppState is unused in these tests.
  return create<AppState>()((...a) => ({ settings, ...createBeadsSlice(...a) }) as AppState)
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

  it('never evicts the tree index while later list keys fill the cache', async () => {
    const store = createTestStore()
    client.beadsGetChangeToken.mockResolvedValue({ ok: true, value: 'h1' })
    client.beadsListIssues.mockResolvedValue(page(['a']))
    await store.getState().pollBeadsChangeToken(REPO)
    await store.getState().loadBeadsList(REPO, BEADS_TREE_INDEX_REQUEST)
    for (let index = 0; index < BEADS_LIST_CACHE_MAX + 3; index += 1) {
      await store.getState().loadBeadsList(REPO, { ...REQUEST, text: `q${index}` })
    }
    const lists = selectBeadsRepoState(store.getState(), 'r1').lists
    expect(lists[beadsListKey(BEADS_TREE_INDEX_REQUEST)]).toBeDefined()
  })

  it('claims an issue with the configured actor and refreshes the change token', async () => {
    const store = createTestStore({ beadsActor: 'sebastian', beadsAutoClaim: true })
    client.beadsClaimIssue.mockResolvedValueOnce(details({ status: 'in_progress' }))
    client.beadsGetChangeToken.mockResolvedValueOnce({ ok: true, value: 'h1' })

    const result = await store.getState().claimBeadsIssue(REPO, 'p-1')

    expect(client.beadsClaimIssue).toHaveBeenCalledWith(
      { beadsActor: 'sebastian', beadsAutoClaim: true },
      REPO,
      'p-1',
      'sebastian'
    )
    expect(result).toEqual(details({ status: 'in_progress' }))
    expect(client.beadsGetChangeToken).toHaveBeenCalledTimes(1)
    expect(selectBeadsRepoState(store.getState(), 'r1').changeToken).toBe('h1')
  })

  it('passes a null actor when no settings are configured', async () => {
    const store = createTestStore()
    client.beadsClaimIssue.mockResolvedValueOnce(details({ status: 'in_progress' }))
    client.beadsGetChangeToken.mockResolvedValueOnce({ ok: true, value: 'h1' })

    await store.getState().claimBeadsIssue(REPO, 'p-1')

    expect(client.beadsClaimIssue).toHaveBeenCalledWith(null, REPO, 'p-1', null)
  })

  it('claims an issue and does not refresh the token on failure', async () => {
    const store = createTestStore({ beadsActor: 'sebastian', beadsAutoClaim: true })
    client.beadsClaimIssue.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'failed', message: 'nope' }
    })

    const result = await store.getState().claimBeadsIssue(REPO, 'p-1')

    expect(result).toEqual({ ok: false, error: { kind: 'failed', message: 'nope' } })
    expect(client.beadsGetChangeToken).not.toHaveBeenCalled()
  })

  it('closes an issue with a reason and does not refresh the token on failure', async () => {
    const store = createTestStore({ beadsActor: 'sebastian', beadsAutoClaim: true })
    client.beadsCloseIssue.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'failed', message: 'nope' }
    })

    const result = await store.getState().closeBeadsIssue(REPO, 'p-1', 'done')

    expect(client.beadsCloseIssue).toHaveBeenCalledWith(
      { beadsActor: 'sebastian', beadsAutoClaim: true },
      REPO,
      'p-1',
      'done',
      'sebastian'
    )
    expect(result).toEqual({ ok: false, error: { kind: 'failed', message: 'nope' } })
    expect(client.beadsGetChangeToken).not.toHaveBeenCalled()
  })

  it('unclaims an issue by resetting both assignee and status back to open', async () => {
    const store = createTestStore({ beadsActor: 'sebastian', beadsAutoClaim: true })
    client.beadsUpdateIssue.mockResolvedValueOnce(details({ status: 'open', assignee: undefined }))
    client.beadsGetChangeToken.mockResolvedValueOnce({ ok: true, value: 'h1' })

    await store.getState().unclaimBeadsIssue(REPO, 'p-1')

    expect(client.beadsUpdateIssue).toHaveBeenCalledWith(
      { beadsActor: 'sebastian', beadsAutoClaim: true },
      REPO,
      'p-1',
      { assignee: '', status: 'open' },
      'sebastian'
    )
    expect(client.beadsGetChangeToken).toHaveBeenCalledTimes(1)
  })
})
