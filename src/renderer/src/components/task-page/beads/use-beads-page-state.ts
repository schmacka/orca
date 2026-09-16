import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BEADS_LIST_PAGE_SIZE,
  type BeadsFailure,
  type BeadsListView
} from '../../../../../shared/beads/beads-contract'
import type {
  BeadsSchema,
  BeadsWorkspaceStatus
} from '../../../../../shared/beads/beads-issue-types'
import {
  FALLBACK_BEADS_SCHEMA,
  beadsStatusCategory
} from '../../../../../shared/beads/beads-schema'
import { installWindowVisibilityTimeoutPoller } from '@/lib/window-visibility-timeout-poller'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'
import { useAppStore } from '@/store'
import { beadsListKey, selectBeadsRepoState } from '@/store/slices/beads-load-state'
import type { BeadsLoad } from '@/store/slices/beads-slice-contract'
import { beadsSetupState } from './BeadsSetupCard'
import { readBeadsListMode, writeBeadsListMode } from './beads-list-mode-storage'
import {
  BEADS_TREE_INDEX_REQUEST,
  EMPTY_BEADS_FILTERS,
  beadsViewForQuery,
  buildBeadsListRequest,
  nextBeadsLimit,
  type BeadsFilterValues,
  type BeadsListQuery,
  type BeadsPreset
} from './beads-list-request'
import {
  buildBeadsListRows,
  buildBeadsProgressByParent,
  type BeadsListMode,
  type BeadsListRow,
  type BeadsProgress
} from './beads-tree-rows'

const VISIBLE_POLL_MS = 5_000
const HIDDEN_POLL_MS = 60_000
const SETUP_RECHECK_MS = 60_000
const SEARCH_DEBOUNCE_MS = 300

const INITIAL_QUERY: BeadsListQuery = {
  preset: 'ready',
  filters: EMPTY_BEADS_FILTERS,
  text: '',
  limit: BEADS_LIST_PAGE_SIZE
}

export type BeadsPageState = {
  status: BeadsLoad<BeadsWorkspaceStatus>
  ready: boolean
  tokenReady: boolean
  schema: BeadsSchema
  query: BeadsListQuery
  textInput: string
  view: BeadsListView
  mode: BeadsListMode
  rows: BeadsListRow[]
  progressByParent: ReadonlyMap<string, BeadsProgress>
  labelOptions: string[]
  epicOptions: { id: string; title: string }[]
  listError: BeadsFailure | null
  pollError: BeadsFailure | null
  indexTruncated: boolean
  listLoading: boolean
  listLoaded: boolean
  hasMore: boolean
  currentKey: string | null
  openIssueId: string | null
  setPreset: (preset: BeadsPreset) => void
  setText: (text: string) => void
  setFilters: (filters: BeadsFilterValues) => void
  setMode: (mode: BeadsListMode) => void
  toggleKey: (key: string, expand: boolean) => void
  selectKey: (key: string) => void
  openIssue: (id: string) => void
  closeIssue: () => void
  loadMore: () => void
  refresh: () => void
  recheck: () => void
}

export function useBeadsPageState(repo: BeadsRepoRef): BeadsPageState {
  const repoState = useAppStore((state) => selectBeadsRepoState(state, repo.id))
  const loadBeadsStatus = useAppStore((state) => state.loadBeadsStatus)
  const loadBeadsSchema = useAppStore((state) => state.loadBeadsSchema)
  const pollBeadsChangeToken = useAppStore((state) => state.pollBeadsChangeToken)
  const loadBeadsList = useAppStore((state) => state.loadBeadsList)

  const [query, setQuery] = useState<BeadsListQuery>(INITIAL_QUERY)
  const [textInput, setTextInput] = useState('')
  const [mode, setModeState] = useState<BeadsListMode>(() => readBeadsListMode(repo.id))
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  const [openIssueId, setOpenIssueId] = useState<string | null>(null)

  useEffect(() => {
    void loadBeadsStatus(repo)
  }, [repo, loadBeadsStatus])

  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery((current) =>
        current.text === textInput
          ? current
          : { ...current, text: textInput, limit: BEADS_LIST_PAGE_SIZE }
      )
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [textInput])

  const ready = beadsSetupState(repoState.status) === 'ready'
  const request = useMemo(() => buildBeadsListRequest(query), [query])
  const requestKey = beadsListKey(request)
  const indexKey = beadsListKey(BEADS_TREE_INDEX_REQUEST)
  const { changeToken } = repoState
  const list = repoState.lists[requestKey]
  const index = repoState.lists[indexKey]
  // Why: the cache can evict either entry between change tokens (12-entry cap); their
  // absence must retrigger the load even though tokenReady/changeToken did not change.
  const indexMissing = index === undefined
  const listMissing = list === undefined

  // Why: Load more bumps `query.limit`, which is a new cache key with `data: null` until
  // the bigger page answers. Falling back to the previous page's rows keeps the list (and
  // scroll position) on screen instead of collapsing to empty and back.
  const previousPageEntry =
    query.limit > BEADS_LIST_PAGE_SIZE
      ? repoState.lists[beadsListKey({ ...request, limit: query.limit - BEADS_LIST_PAGE_SIZE })]
      : undefined
  const listHasData = (entry: typeof list): boolean =>
    entry?.data !== null && entry?.data !== undefined
  const displayList = listHasData(list)
    ? list
    : listHasData(previousPageEntry)
      ? previousPageEntry
      : list

  useEffect(() => {
    if (!ready) {
      // Why: bd gets installed or initialized in a terminal while Orca is in the
      // background. The poller re-runs on focus and visibilitychange, so this is the
      // focus re-check spec §6 asks for, not just a slow timer.
      return installWindowVisibilityTimeoutPoller({
        run: () => loadBeadsStatus(repo, { force: true }),
        getDelayMs: () => SETUP_RECHECK_MS
      })
    }
    return installWindowVisibilityTimeoutPoller({
      run: () => pollBeadsChangeToken(repo),
      getDelayMs: () => VISIBLE_POLL_MS,
      hiddenDelayMs: HIDDEN_POLL_MS
    })
  }, [ready, repo, pollBeadsChangeToken, loadBeadsStatus])

  // Why: `changeToken === null` means the first poll has not answered yet. Loading now
  // and again at the first token doubles the entire first paint over IPC/SSH.
  const tokenReady = ready && changeToken !== null

  useEffect(() => {
    if (!tokenReady) {
      return
    }
    void loadBeadsSchema(repo)
    void loadBeadsList(repo, BEADS_TREE_INDEX_REQUEST)
  }, [tokenReady, repo, changeToken, indexMissing, loadBeadsSchema, loadBeadsList])

  useEffect(() => {
    if (!tokenReady) {
      return
    }
    // requestKey (not the request object) keys the effect so equal queries don't refetch.
    void loadBeadsList(repo, request)
  }, [tokenReady, repo, changeToken, requestKey, request, listMissing, loadBeadsList])

  const schema = repoState.schema.data ?? FALLBACK_BEADS_SCHEMA
  const indexIssues = index?.data?.issues ?? null

  const rows = useMemo(
    () =>
      buildBeadsListRows({
        issues: displayList?.data?.issues ?? [],
        index: indexIssues,
        mode,
        collapsed
      }),
    [displayList?.data, indexIssues, mode, collapsed]
  )
  const progressByParent = useMemo(
    () =>
      buildBeadsProgressByParent(
        indexIssues,
        (status) => beadsStatusCategory(schema, status) === 'done'
      ),
    [indexIssues, schema]
  )
  const labelOptions = useMemo(
    () => [...new Set((indexIssues ?? []).flatMap((entry) => entry.labels))].sort(),
    [indexIssues]
  )
  const epicOptions = useMemo(
    () =>
      (indexIssues ?? [])
        .filter((entry) => entry.issueType === 'epic')
        .map((entry) => ({ id: entry.id, title: entry.title })),
    [indexIssues]
  )

  const setMode = useCallback(
    (next: BeadsListMode) => {
      setModeState(next)
      writeBeadsListMode(repo.id, next)
    },
    [repo.id]
  )

  const idFromKey = (key: string): string => key.slice(key.indexOf(':') + 1)

  return {
    status: repoState.status,
    ready,
    tokenReady,
    schema,
    query,
    textInput,
    view: beadsViewForQuery(query),
    mode,
    rows,
    progressByParent,
    labelOptions,
    epicOptions,
    listError: list?.error ?? null,
    pollError: repoState.pollError,
    indexTruncated: index?.data?.hasMore ?? false,
    listLoading: list?.loading ?? false,
    listLoaded: listHasData(displayList),
    hasMore: displayList?.data?.hasMore ?? false,
    currentKey,
    openIssueId,
    setPreset: (preset) =>
      setQuery((current) => ({ ...current, preset, limit: BEADS_LIST_PAGE_SIZE })),
    setText: setTextInput,
    setFilters: (filters) =>
      setQuery((current) => ({ ...current, filters, limit: BEADS_LIST_PAGE_SIZE })),
    setMode,
    toggleKey: (key, expand) =>
      setCollapsed((current) => {
        const next = new Set(current)
        if (expand) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      }),
    selectKey: (key) => {
      setCurrentKey(key)
      setOpenIssueId(idFromKey(key))
    },
    openIssue: (id) => {
      setCurrentKey(`issue:${id}`)
      setOpenIssueId(id)
    },
    closeIssue: () => setOpenIssueId(null),
    loadMore: () => setQuery((current) => ({ ...current, limit: nextBeadsLimit(current.limit) })),
    refresh: () => {
      // Why: if the poll moves the token the [changeToken] effects reload on their own.
      // Forcing as well would run both lists twice and discard the first answers.
      void (async () => {
        const before = changeToken
        await pollBeadsChangeToken(repo)
        if (useAppStore.getState().beadsRepos[repo.id]?.changeToken !== before) {
          return
        }
        void loadBeadsList(repo, request, { force: true })
        void loadBeadsList(repo, BEADS_TREE_INDEX_REQUEST, { force: true })
      })()
    },
    recheck: () => void loadBeadsStatus(repo, { force: true })
  }
}
