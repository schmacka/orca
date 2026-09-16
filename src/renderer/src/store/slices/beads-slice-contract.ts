import type { StateCreator } from 'zustand'
import type {
  BeadsFailure,
  BeadsIssuePage,
  BeadsListRequest,
  BeadsResult
} from '../../../../shared/beads/beads-contract'
import type {
  BeadsIssueDetails,
  BeadsSchema,
  BeadsWorkspaceStatus
} from '../../../../shared/beads/beads-issue-types'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'
import type { AppState } from '../types'

export type BeadsLoad<T> = {
  data: T | null
  error: BeadsFailure | null
  loading: boolean
  token: string | null
}

export type BeadsRepoState = {
  status: BeadsLoad<BeadsWorkspaceStatus>
  schema: BeadsLoad<BeadsSchema>
  changeToken: string | null
  /** Last change-token poll failure, or null. Stale lists keep rendering under it. */
  pollError: BeadsFailure | null
  lists: Record<string, BeadsLoad<BeadsIssuePage>>
  details: Record<string, BeadsLoad<BeadsIssueDetails>>
}

export type BeadsLoadOptions = { force?: boolean }

export type BeadsSlice = {
  beadsRepos: Record<string, BeadsRepoState>
  loadBeadsStatus: (repo: BeadsRepoRef, options?: BeadsLoadOptions) => Promise<void>
  loadBeadsSchema: (repo: BeadsRepoRef) => Promise<void>
  pollBeadsChangeToken: (repo: BeadsRepoRef) => Promise<void>
  loadBeadsList: (
    repo: BeadsRepoRef,
    request: BeadsListRequest,
    options?: BeadsLoadOptions
  ) => Promise<void>
  loadBeadsDetails: (repo: BeadsRepoRef, id: string, options?: BeadsLoadOptions) => Promise<void>
  claimBeadsIssue: (repo: BeadsRepoRef, id: string) => Promise<BeadsResult<BeadsIssueDetails>>
  closeBeadsIssue: (
    repo: BeadsRepoRef,
    id: string,
    reason: string
  ) => Promise<BeadsResult<BeadsIssueDetails>>
  unclaimBeadsIssue: (repo: BeadsRepoRef, id: string) => Promise<BeadsResult<BeadsIssueDetails>>
}

type BeadsStateCreator = StateCreator<AppState, [], [], BeadsSlice>
export type BeadsSliceSet = Parameters<BeadsStateCreator>[0]
export type BeadsSliceGet = Parameters<BeadsStateCreator>[1]
