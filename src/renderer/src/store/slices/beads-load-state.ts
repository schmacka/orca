import type { BeadsListRequest, BeadsResult } from '../../../../shared/beads/beads-contract'
import type { AppState } from '../types'
import type { BeadsLoad, BeadsRepoState } from './beads-slice-contract'

export function emptyBeadsLoad<T>(): BeadsLoad<T> {
  return { data: null, error: null, loading: false, token: null }
}

export const EMPTY_BEADS_REPO_STATE: BeadsRepoState = {
  status: emptyBeadsLoad(),
  schema: emptyBeadsLoad(),
  changeToken: null,
  pollError: null,
  lists: {},
  details: {}
}

export const BEADS_LIST_CACHE_MAX = 12
export const BEADS_DETAILS_CACHE_MAX = 24

// Why: every debounced search string and every Load-more limit adds a key, and each
// page can be hundreds of KB. Keys keep insertion order, so the oldest go first; the
// key being written, anything still loading, and any pinned key stay.
export function pruneBeadsEntries<T>(
  entries: Record<string, BeadsLoad<T>>,
  keep: string,
  max: number,
  pinned: ReadonlySet<string> = new Set()
): Record<string, BeadsLoad<T>> {
  const keys = Object.keys(entries)
  if (keys.length <= max) {
    return entries
  }
  const removable = keys.filter((key) => key !== keep && !pinned.has(key) && !entries[key]?.loading)
  const dropCount = Math.min(keys.length - max, removable.length)
  if (dropCount === 0) {
    return entries
  }
  const dropped = new Set(removable.slice(0, dropCount))
  return Object.fromEntries(
    keys.filter((key) => !dropped.has(key)).map((key) => [key, entries[key]])
  )
}

export function selectBeadsRepoState(state: AppState, repoId: string): BeadsRepoState {
  return state.beadsRepos[repoId] ?? EMPTY_BEADS_REPO_STATE
}

export function beadsListKey(request: BeadsListRequest): string {
  return JSON.stringify(request)
}

export function isFreshBeadsLoad<T>(
  entry: BeadsLoad<T> | undefined,
  changeToken: string | null,
  force: boolean | undefined
): boolean {
  return !force && entry !== undefined && entry.data !== null && entry.token === changeToken
}

export function startedBeadsLoad<T>(entry: BeadsLoad<T> | undefined): BeadsLoad<T> {
  // Why: keep showing the previous data while a reload runs instead of flashing empty.
  return { ...(entry ?? emptyBeadsLoad<T>()), loading: true, error: null }
}

export function settledBeadsLoad<T>(
  entry: BeadsLoad<T> | undefined,
  result: BeadsResult<T>,
  token: string | null
): BeadsLoad<T> {
  if (result.ok) {
    return { data: result.value, error: null, loading: false, token }
  }
  return { ...(entry ?? emptyBeadsLoad<T>()), error: result.error, loading: false }
}

export function updateBeadsRepo(
  state: AppState,
  repoId: string,
  update: (repo: BeadsRepoState) => BeadsRepoState
): Pick<AppState, 'beadsRepos'> {
  const current = state.beadsRepos[repoId] ?? EMPTY_BEADS_REPO_STATE
  return { beadsRepos: { ...state.beadsRepos, [repoId]: update(current) } }
}
