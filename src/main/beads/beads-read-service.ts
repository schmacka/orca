import type {
  BeadsIssuePage,
  BeadsListFilter,
  BeadsListRequest
} from '../../shared/beads/beads-contract'
import {
  normalizeBeadsIssue,
  normalizeBeadsIssueDetails
} from '../../shared/beads/beads-issue-normalize'
import type {
  BeadsIssue,
  BeadsIssueDetails,
  BeadsSchema,
  BeadsWorkspaceStatus
} from '../../shared/beads/beads-issue-types'
import { readFiniteNumber, readOptionalString } from '../../shared/beads/beads-json-value'
import {
  FALLBACK_BEADS_SCHEMA,
  normalizeBeadsStatuses,
  normalizeBeadsTypes
} from '../../shared/beads/beads-schema'
import { parseBdJson, parseBdJsonList, parseBdJsonRecord } from './bd-json'
import { requirePageLimit } from './beads-arg-validation'
import { resolveBeadsContext } from './beads-context'
import { BeadsError } from './beads-error'
import type { BeadsExecutionTarget } from './beads-executor'
import { invokeBd, resolveBeadsScope } from './beads-invocation'
import {
  STATUSES_ARGS,
  TYPES_ARGS,
  VC_STATUS_ARGS,
  buildBlockedArgs,
  buildCountArgs,
  buildListArgs,
  buildReadyArgs,
  buildSearchArgs,
  buildShowArgs
} from './beads-read-args'
import { getBdVersionInfo } from './beads-version'

type CachedSchema = { token: string; schema: BeadsSchema }

const schemaCache = new Map<string, CachedSchema>()

export async function getBeadsWorkspaceStatus(
  target: BeadsExecutionTarget
): Promise<BeadsWorkspaceStatus> {
  const info = await getBdVersionInfo(target)
  if (info.hostOffline) {
    throw new BeadsError('host-offline', 'The remote host is not connected.')
  }
  const status: BeadsWorkspaceStatus = {
    bdInstalled: info.installed,
    bdVersion: info.version,
    versionSupported: info.supported,
    initialized: false,
    beadsDir: null,
    isWorktree: false
  }
  if (!info.supported) {
    return status
  }
  try {
    const context = await resolveBeadsContext(target)
    return {
      ...status,
      initialized: true,
      beadsDir: context.beadsDir,
      isWorktree: context.isWorktree
    }
  } catch (error) {
    if (error instanceof BeadsError && error.kind === 'not-initialized') {
      return status
    }
    throw error
  }
}

export async function getBeadsChangeToken(target: BeadsExecutionTarget): Promise<string> {
  const record = parseBdJsonRecord(await invokeBd(target, VC_STATUS_ARGS, 'read'))
  const commit = readOptionalString(record.commit)
  if (!commit) {
    throw new BeadsError('failed', 'bd vc status did not report a commit.')
  }
  return commit
}

export async function getBeadsSchema(target: BeadsExecutionTarget): Promise<BeadsSchema> {
  const scope = await resolveBeadsScope(target)
  const token = await getBeadsChangeToken(target)
  const cached = schemaCache.get(scope)
  if (cached && cached.token === token) {
    return cached.schema
  }
  const [statusesOutput, typesOutput] = await Promise.all([
    invokeBd(target, STATUSES_ARGS, 'read'),
    invokeBd(target, TYPES_ARGS, 'read')
  ])
  const statuses = normalizeBeadsStatuses(parseBdJson(statusesOutput))
  const types = normalizeBeadsTypes(parseBdJson(typesOutput))
  const schema: BeadsSchema = {
    statuses: statuses.length > 0 ? statuses : FALLBACK_BEADS_SCHEMA.statuses,
    types: types.length > 0 ? types : FALLBACK_BEADS_SCHEMA.types
  }
  schemaCache.set(scope, { token, schema })
  return schema
}

function argsForListRequest(request: BeadsListRequest, fetchLimit: number): string[] {
  switch (request.view) {
    case 'list':
      return buildListArgs(request.filter, fetchLimit)
    case 'ready':
      return buildReadyArgs(request.filter, fetchLimit)
    case 'blocked':
      return buildBlockedArgs(request.filter)
    case 'search':
      return buildSearchArgs(request.text ?? '', request.filter, fetchLimit)
  }
}

function normalizeIssues(rows: unknown[]): BeadsIssue[] {
  const issues: BeadsIssue[] = []
  for (const row of rows) {
    const issue = normalizeBeadsIssue(row)
    if (issue) {
      issues.push(issue)
    }
  }
  return issues
}

export async function listBeadsIssues(
  target: BeadsExecutionTarget,
  request: BeadsListRequest
): Promise<BeadsIssuePage> {
  const limit = requirePageLimit(request.limit)
  // Why: one extra row tells the UI to offer "Load more" instead of silently truncating.
  const args = argsForListRequest(request, limit + 1)
  const issues = normalizeIssues(parseBdJsonList(await invokeBd(target, args, 'read')))
  return { issues: issues.slice(0, limit), hasMore: issues.length > limit }
}

export async function countBeadsIssues(
  target: BeadsExecutionTarget,
  filter: BeadsListFilter
): Promise<number> {
  const record = parseBdJsonRecord(await invokeBd(target, buildCountArgs(filter), 'read'))
  const count = readFiniteNumber(record.count)
  if (count === undefined) {
    throw new BeadsError('failed', 'bd count did not report a count.')
  }
  return count
}

export async function getBeadsIssueDetails(
  target: BeadsExecutionTarget,
  id: string
): Promise<BeadsIssueDetails> {
  const rows = parseBdJsonList(await invokeBd(target, buildShowArgs(id), 'read'))
  const details = normalizeBeadsIssueDetails(rows[0])
  if (!details) {
    throw new BeadsError('not-found', `Issue ${id} was not found.`)
  }
  return details
}

export function resetBeadsReadCachesForTests(): void {
  schemaCache.clear()
}
