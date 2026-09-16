import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  runtimeEnvironmentSupportsCapability: vi.fn()
}))

vi.mock('./runtime-rpc-client', () => ({
  callRuntimeRpc: mocks.callRuntimeRpc,
  runtimeEnvironmentSupportsCapability: mocks.runtimeEnvironmentSupportsCapability,
  // The real class lives in runtime-rpc-result and is re-exported; the mock needs its
  // own so `instanceof` still classifies (same shape as remote-agent-session-launch.test.ts).
  RuntimeRpcCallError: class RuntimeRpcCallError extends Error {
    code: string
    constructor(response: { error: { code: string; message: string } }) {
      super(response.error.message)
      this.code = response.error.code
    }
  }
}))

import { RuntimeRpcCallError } from './runtime-rpc-client'

import {
  beadsGetIssueDetails,
  beadsGetStatus,
  beadsListIssues,
  getBeadsRuntimeTarget,
  type BeadsRepoRef
} from './runtime-beads-client'

// Why: annotate, don't infer — `Repo.executionHostId` is `'local' | `ssh:${string}` |
// `runtime:${string}` | null`, and a bare object literal widens it to `string`, which
// `pnpm tc` rejects (config/tsconfig.tc.web.json type-checks tests too).
const LOCAL_REPO: BeadsRepoRef = {
  id: 'r1',
  path: '/work/app',
  connectionId: null,
  executionHostId: null
}
const RUNTIME_REPO: BeadsRepoRef = {
  id: 'r2',
  path: '/srv/app',
  connectionId: null,
  executionHostId: 'runtime:env-1'
}
const SSH_REPO: BeadsRepoRef = {
  id: 'r3',
  path: '/srv/ssh',
  connectionId: 'ssh-1',
  executionHostId: null
}

const beadsApi = {
  getStatus: vi.fn(),
  getSchema: vi.fn(),
  getChangeToken: vi.fn(),
  listIssues: vi.fn(),
  getIssueDetails: vi.fn()
}

beforeEach(() => {
  vi.stubGlobal('window', { api: { beads: beadsApi } })
  mocks.runtimeEnvironmentSupportsCapability.mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('getBeadsRuntimeTarget', () => {
  it('routes runtime-owned repos to that runtime and everything else to the active target', () => {
    expect(getBeadsRuntimeTarget(null, RUNTIME_REPO)).toEqual({
      kind: 'environment',
      environmentId: 'env-1'
    })
    expect(getBeadsRuntimeTarget(null, LOCAL_REPO)).toEqual({ kind: 'local' })
    expect(getBeadsRuntimeTarget(null, SSH_REPO)).toEqual({ kind: 'local' })
    expect(getBeadsRuntimeTarget({ activeRuntimeEnvironmentId: 'env-9' }, LOCAL_REPO)).toEqual({
      kind: 'environment',
      environmentId: 'env-9'
    })
  })
})

describe('beads runtime client', () => {
  it('uses IPC with repoPath and repoId for local and SSH repos', async () => {
    beadsApi.getStatus.mockResolvedValue({ ok: true, value: { initialized: true } })
    await expect(beadsGetStatus(null, SSH_REPO)).resolves.toEqual({
      ok: true,
      value: { initialized: true }
    })
    expect(beadsApi.getStatus).toHaveBeenCalledWith({ repoPath: '/srv/ssh', repoId: 'r3' })
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('uses RPC with the repo id for runtime-owned repos', async () => {
    const request = { view: 'ready' as const, filter: {}, limit: 200 }
    mocks.callRuntimeRpc.mockResolvedValue({ ok: true, value: { issues: [], hasMore: false } })
    await beadsListIssues(null, RUNTIME_REPO, request)
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-1' },
      'beads.listIssues',
      { repo: 'r2', request },
      { timeoutMs: 45_000 }
    )
  })

  it('reports an outdated runtime instead of calling it', async () => {
    mocks.runtimeEnvironmentSupportsCapability.mockResolvedValue(false)
    const result = await beadsGetIssueDetails(null, RUNTIME_REPO, 'p-1')
    expect(result.ok).toBe(false)
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('turns transport errors into failures instead of throwing', async () => {
    beadsApi.getIssueDetails.mockRejectedValue(new Error('No handler registered'))
    await expect(beadsGetIssueDetails(null, LOCAL_REPO, 'p-1')).resolves.toEqual({
      ok: false,
      error: { kind: 'failed', message: 'No handler registered' }
    })
    mocks.callRuntimeRpc.mockRejectedValue(new Error('socket closed'))
    await expect(beadsGetStatus(null, RUNTIME_REPO)).resolves.toMatchObject({
      ok: false,
      error: { kind: 'host-offline' }
    })
  })

  it('reports a refused RPC as failed, not as an offline host', async () => {
    mocks.callRuntimeRpc.mockRejectedValue(
      new RuntimeRpcCallError({
        error: { code: 'forbidden', message: 'scope does not allow beads.getStatus' }
      })
    )
    await expect(beadsGetStatus(null, RUNTIME_REPO)).resolves.toEqual({
      ok: false,
      error: { kind: 'failed', message: 'scope does not allow beads.getStatus' }
    })
  })
})
