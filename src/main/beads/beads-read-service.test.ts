import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runBdMock } = vi.hoisted(() => ({ runBdMock: vi.fn() }))

vi.mock('./beads-executor', () => ({
  BD_READ_TIMEOUT_MS: 15_000,
  BD_WRITE_TIMEOUT_MS: 30_000,
  beadsHostKey: () => 'local',
  runBd: runBdMock
}))

import { bdReply, installFakeBd } from './beads-fake-bd.test-support'
import { resetBeadsContextCacheForTests } from './beads-context'
import { resetBdVersionCacheForTests } from './beads-version'
import {
  countBeadsIssues,
  getBeadsChangeToken,
  getBeadsIssueDetails,
  getBeadsSchema,
  getBeadsWorkspaceStatus,
  listBeadsIssues,
  resetBeadsReadCachesForTests
} from './beads-read-service'

const TARGET = { repoPath: '/repo', connectionId: null }

function row(id: string) {
  return { id, title: `Title ${id}`, status: 'open', priority: 2, issue_type: 'task' }
}

beforeEach(() => {
  runBdMock.mockReset()
  resetBdVersionCacheForTests()
  resetBeadsContextCacheForTests()
  resetBeadsReadCachesForTests()
})

describe('getBeadsWorkspaceStatus', () => {
  it('reports an initialized workspace with its beads dir', async () => {
    installFakeBd(runBdMock, {})
    await expect(getBeadsWorkspaceStatus(TARGET)).resolves.toEqual({
      bdInstalled: true,
      bdVersion: '1.2.2',
      versionSupported: true,
      initialized: true,
      beadsDir: '/repo/.beads',
      isWorktree: false
    })
  })

  it('reports an uninitialized repo without throwing', async () => {
    installFakeBd(runBdMock, {
      context: bdReply('{"error":"cannot resolve repo context: no .beads directory found"}', {
        exitCode: 1
      })
    })
    await expect(getBeadsWorkspaceStatus(TARGET)).resolves.toMatchObject({
      initialized: false,
      beadsDir: null
    })
  })

  it('reports missing and outdated bd without throwing', async () => {
    installFakeBd(runBdMock, { version: bdReply('', { spawnFailed: true, exitCode: null }) })
    await expect(getBeadsWorkspaceStatus(TARGET)).resolves.toMatchObject({
      bdInstalled: false,
      initialized: false
    })
    resetBdVersionCacheForTests()
    installFakeBd(runBdMock, { version: bdReply('bd version 1.1.2') })
    await expect(getBeadsWorkspaceStatus(TARGET)).resolves.toMatchObject({
      bdInstalled: true,
      versionSupported: false
    })
  })

  it('throws for an offline host', async () => {
    installFakeBd(runBdMock, { version: bdReply('', { hostOffline: true, exitCode: null }) })
    await expect(getBeadsWorkspaceStatus(TARGET)).rejects.toMatchObject({ kind: 'host-offline' })
  })
})

describe('getBeadsSchema and getBeadsChangeToken', () => {
  it('loads the schema once per change token', async () => {
    installFakeBd(runBdMock, {
      statuses: bdReply(
        JSON.stringify({ built_in_statuses: [{ name: 'open', category: 'active' }] })
      ),
      types: bdReply(JSON.stringify({ core_types: [{ name: 'task', description: 'Work' }] }))
    })
    await expect(getBeadsChangeToken(TARGET)).resolves.toBe('hash-1')
    const schema = await getBeadsSchema(TARGET)
    await getBeadsSchema(TARGET)
    expect(schema.statuses.map((status) => status.name)).toEqual(['open'])
    const statusCalls = runBdMock.mock.calls.filter((call) => call[1][0] === 'statuses')
    expect(statusCalls).toHaveLength(1)
  })

  it('falls back to built-in statuses when bd returns none', async () => {
    installFakeBd(runBdMock, {
      statuses: bdReply('{"built_in_statuses":[]}'),
      types: bdReply('{"core_types":[]}')
    })
    const schema = await getBeadsSchema(TARGET)
    expect(schema.statuses.some((status) => status.name === 'closed')).toBe(true)
  })
})

describe('listBeadsIssues', () => {
  it('requests one extra row and reports hasMore', async () => {
    installFakeBd(runBdMock, {
      ready: bdReply(JSON.stringify([row('a-1'), row('a-2'), row('a-3')]))
    })
    const page = await listBeadsIssues(TARGET, { view: 'ready', filter: {}, limit: 2 })
    expect(page.hasMore).toBe(true)
    expect(page.issues.map((issue) => issue.id)).toEqual(['a-1', 'a-2'])
    expect(runBdMock).toHaveBeenCalledWith(TARGET, ['ready', '--json', '--limit=3'], 15_000)
  })

  it('slices blocked results locally because bd blocked has no limit', async () => {
    installFakeBd(runBdMock, { blocked: bdReply(JSON.stringify([row('b-1'), row('b-2')])) })
    const page = await listBeadsIssues(TARGET, { view: 'blocked', filter: {}, limit: 1 })
    expect(page).toMatchObject({ hasMore: true })
    expect(page.issues).toHaveLength(1)
  })

  it('rejects invalid requests before running bd', async () => {
    installFakeBd(runBdMock, {})
    await expect(
      listBeadsIssues(TARGET, { view: 'list', filter: {}, limit: 5000 })
    ).rejects.toMatchObject({ kind: 'invalid-input' })
    expect(runBdMock).not.toHaveBeenCalled()
  })
})

describe('countBeadsIssues and getBeadsIssueDetails', () => {
  it('reads bd count', async () => {
    installFakeBd(runBdMock, { count: bdReply('{"count":24,"schema_version":1}') })
    await expect(countBeadsIssues(TARGET, { statuses: ['open'] })).resolves.toBe(24)
  })

  it('returns details and classifies ambiguous ids', async () => {
    installFakeBd(runBdMock, {
      'show a-1': bdReply(JSON.stringify([{ ...row('a-1'), comments: [] }])),
      'show a': bdReply('{"error":"no issues found matching the provided IDs"}', {
        exitCode: 1,
        stderr: 'Error fetching a: ambiguous ID "a" matches 2 issues'
      })
    })
    await expect(getBeadsIssueDetails(TARGET, 'a-1')).resolves.toMatchObject({
      issue: { id: 'a-1' }
    })
    await expect(getBeadsIssueDetails(TARGET, 'a')).rejects.toMatchObject({ kind: 'ambiguous-id' })
  })
})
