import type { BeadsListRequest } from '../../../../shared/beads/beads-contract'
import type { StateCreator } from 'zustand'
import {
  beadsGetChangeToken,
  beadsGetIssueDetails,
  beadsGetSchema,
  beadsGetStatus,
  beadsListIssues,
  type BeadsRepoRef
} from '@/runtime/runtime-beads-client'
import type { AppState } from '../types'
import {
  beadsListKey,
  BEADS_DETAILS_CACHE_MAX,
  BEADS_LIST_CACHE_MAX,
  BEADS_TREE_INDEX_REQUEST,
  isFreshBeadsLoad,
  pruneBeadsEntries,
  selectBeadsRepoState,
  settledBeadsLoad,
  startedBeadsLoad,
  updateBeadsRepo
} from './beads-load-state'
import type { BeadsSlice } from './beads-slice-contract'

export type { BeadsSlice } from './beads-slice-contract'
export { beadsListKey, selectBeadsRepoState, EMPTY_BEADS_REPO_STATE } from './beads-load-state'

// Why: a newer request for the same key wins even if an older one resolves later.
const latestRequest = new Map<string, number>()
let requestCounter = 0

function beginRequest(key: string): number {
  requestCounter += 1
  latestRequest.set(key, requestCounter)
  return requestCounter
}

function isLatestRequest(key: string, requestId: number): boolean {
  return latestRequest.get(key) === requestId
}

export const createBeadsSlice: StateCreator<AppState, [], [], BeadsSlice> = (set, get) => ({
  beadsRepos: {},

  loadBeadsStatus: async (repo, options) => {
    const current = selectBeadsRepoState(get(), repo.id).status
    if (!options?.force && (current.data !== null || current.loading)) {
      return
    }
    const requestKey = `${repo.id}\nstatus`
    const requestId = beginRequest(requestKey)
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({ ...r, status: startedBeadsLoad(r.status) }))
    )
    const result = await beadsGetStatus(get().settings, repo)
    if (!isLatestRequest(requestKey, requestId)) {
      return
    }
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({
        ...r,
        status: settledBeadsLoad(r.status, result, null)
      }))
    )
  },

  loadBeadsSchema: async (repo) => {
    const repoState = selectBeadsRepoState(get(), repo.id)
    if (isFreshBeadsLoad(repoState.schema, repoState.changeToken, false)) {
      return
    }
    const token = repoState.changeToken
    const requestKey = `${repo.id}\nschema`
    const requestId = beginRequest(requestKey)
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({ ...r, schema: startedBeadsLoad(r.schema) }))
    )
    const result = await beadsGetSchema(get().settings, repo)
    if (!isLatestRequest(requestKey, requestId)) {
      return
    }
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({
        ...r,
        schema: settledBeadsLoad(r.schema, result, token)
      }))
    )
  },

  pollBeadsChangeToken: async (repo) => {
    const result = await beadsGetChangeToken(get().settings, repo)
    if (!result.ok) {
      // Why: keep the last token and the data it loaded; only record why we are stale.
      set((state) => updateBeadsRepo(state, repo.id, (r) => ({ ...r, pollError: result.error })))
      return
    }
    const repoState = selectBeadsRepoState(get(), repo.id)
    if (repoState.changeToken === result.value && repoState.pollError === null) {
      return
    }
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({ ...r, changeToken: result.value, pollError: null }))
    )
  },

  loadBeadsList: async (repo, request: BeadsListRequest, options) => {
    const key = beadsListKey(request)
    const repoState = selectBeadsRepoState(get(), repo.id)
    if (isFreshBeadsLoad(repoState.lists[key], repoState.changeToken, options?.force)) {
      return
    }
    const token = repoState.changeToken
    const requestKey = `${repo.id}\nlist\n${key}`
    const requestId = beginRequest(requestKey)
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({
        ...r,
        lists: { ...r.lists, [key]: startedBeadsLoad(r.lists[key]) }
      }))
    )
    const result = await beadsListIssues(get().settings, repo, request)
    if (!isLatestRequest(requestKey, requestId)) {
      return
    }
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({
        ...r,
        lists: pruneBeadsEntries(
          { ...r.lists, [key]: settledBeadsLoad(r.lists[key], result, token) },
          key,
          BEADS_LIST_CACHE_MAX,
          new Set([beadsListKey(BEADS_TREE_INDEX_REQUEST)])
        )
      }))
    )
  },

  loadBeadsDetails: async (repo, id, options) => {
    const repoState = selectBeadsRepoState(get(), repo.id)
    if (isFreshBeadsLoad(repoState.details[id], repoState.changeToken, options?.force)) {
      return
    }
    const token = repoState.changeToken
    const requestKey = `${repo.id}\ndetails\n${id}`
    const requestId = beginRequest(requestKey)
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({
        ...r,
        details: { ...r.details, [id]: startedBeadsLoad(r.details[id]) }
      }))
    )
    const result = await beadsGetIssueDetails(get().settings, repo, id)
    if (!isLatestRequest(requestKey, requestId)) {
      return
    }
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({
        ...r,
        details: pruneBeadsEntries(
          { ...r.details, [id]: settledBeadsLoad(r.details[id], result, token) },
          id,
          BEADS_DETAILS_CACHE_MAX
        )
      }))
    )
  }
})

export type { BeadsRepoRef }
