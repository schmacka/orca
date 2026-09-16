import type {
  BeadsIssuePage,
  BeadsListRequest,
  BeadsRepoArgs,
  BeadsResult
} from '../../../shared/beads/beads-contract'
import type {
  BeadsIssueDetails,
  BeadsSchema,
  BeadsWorkspaceStatus
} from '../../../shared/beads/beads-issue-types'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import { BEADS_TASK_SOURCE_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import type { Repo } from '../../../shared/repo-types'
import { translate } from '@/i18n/i18n'
import {
  getActiveRuntimeTarget,
  runtimeTargetForExecutionHostId,
  type RuntimeClientTarget
} from './runtime-client-target'
import {
  callRuntimeRpc,
  RuntimeRpcCallError,
  runtimeEnvironmentSupportsCapability
} from './runtime-rpc-client'

const BEADS_RPC_TIMEOUT_MS = 45_000
const CAPABILITY_TIMEOUT_MS = 30_000

export type BeadsRepoRef = Pick<Repo, 'id' | 'path' | 'connectionId' | 'executionHostId'>
export type BeadsRuntimeSettings =
  | Pick<GlobalSettings, 'activeRuntimeEnvironmentId'>
  | null
  | undefined

export function getBeadsRuntimeTarget(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef
): RuntimeClientTarget {
  const hostTarget = runtimeTargetForExecutionHostId(getRepoExecutionHostId(repo))
  // Why: runtime-owned repos run bd on that runtime; local and SSH repos go through
  // this app's main process (which routes SSH itself) unless this renderer is a
  // client of a runtime.
  if (hostTarget?.kind === 'environment') {
    return hostTarget
  }
  return getActiveRuntimeTarget(settings)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function callBeads<T>(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef,
  method: string,
  rpcParams: Record<string, unknown>,
  callLocal: (args: BeadsRepoArgs) => Promise<BeadsResult<T>>
): Promise<BeadsResult<T>> {
  const target = getBeadsRuntimeTarget(settings, repo)
  if (target.kind === 'local') {
    try {
      return await callLocal({ repoPath: repo.path, repoId: repo.id })
    } catch (error) {
      return { ok: false, error: { kind: 'failed', message: errorMessage(error) } }
    }
  }
  const supported = await runtimeEnvironmentSupportsCapability(
    target.environmentId,
    BEADS_TASK_SOURCE_RUNTIME_CAPABILITY,
    CAPABILITY_TIMEOUT_MS
  )
  if (!supported) {
    return {
      ok: false,
      error: {
        kind: 'failed',
        message: translate(
          'auto.components.task-page.beads.runtimeUpdateRequired',
          'Update the Orca runtime on this host to use Beads.'
        )
      }
    }
  }
  try {
    return await callRuntimeRpc<BeadsResult<T>>(
      target,
      `beads.${method}`,
      { repo: repo.id, ...rpcParams },
      { timeoutMs: BEADS_RPC_TIMEOUT_MS }
    )
  } catch (error) {
    // Why: only a dead connection is 'host-offline'. A rejected param schema or a
    // mobile-scope 'forbidden' is a real failure, and calling it offline sends the
    // user to check their network for a bug in our own call.
    return { ok: false, error: { kind: rpcErrorKind(error), message: errorMessage(error) } }
  }
}

// Why: a RuntimeRpcCallError means the host answered and refused (invalid_argument,
// forbidden, operation_unknown, runtime_error…). Anything else — timeout, closed
// socket, no pairing — never reached it.
function rpcErrorKind(error: unknown): 'host-offline' | 'failed' {
  return error instanceof RuntimeRpcCallError ? 'failed' : 'host-offline'
}

export function beadsGetStatus(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef
): Promise<BeadsResult<BeadsWorkspaceStatus>> {
  return callBeads(settings, repo, 'getStatus', {}, (args) => window.api.beads.getStatus(args))
}

export function beadsGetSchema(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef
): Promise<BeadsResult<BeadsSchema>> {
  return callBeads(settings, repo, 'getSchema', {}, (args) => window.api.beads.getSchema(args))
}

export function beadsGetChangeToken(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef
): Promise<BeadsResult<string>> {
  return callBeads(settings, repo, 'getChangeToken', {}, (args) =>
    window.api.beads.getChangeToken(args)
  )
}

export function beadsListIssues(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef,
  request: BeadsListRequest
): Promise<BeadsResult<BeadsIssuePage>> {
  return callBeads(settings, repo, 'listIssues', { request }, (args) =>
    window.api.beads.listIssues({ ...args, request })
  )
}

export function beadsGetIssueDetails(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef,
  id: string
): Promise<BeadsResult<BeadsIssueDetails>> {
  return callBeads(settings, repo, 'getIssueDetails', { id }, (args) =>
    window.api.beads.getIssueDetails({ ...args, id })
  )
}
