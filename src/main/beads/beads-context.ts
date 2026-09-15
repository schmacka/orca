import { readOptionalString } from '../../shared/beads/beads-json-value'
import { parseBdJsonRecord } from './bd-json'
import { BeadsError, classifyBdFailure } from './beads-error'
import {
  BD_READ_TIMEOUT_MS,
  beadsHostKey,
  runBd,
  type BeadsExecutionTarget
} from './beads-executor'

const CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000

export type BeadsRepoContext = {
  beadsDir: string
  projectId: string | null
  database: string | null
  isWorktree: boolean
}

type CachedContext = { context: BeadsRepoContext; expiresAt: number }

const contextCache = new Map<string, CachedContext>()

export function normalizeBeadsContext(raw: Record<string, unknown>): BeadsRepoContext | null {
  const beadsDir = readOptionalString(raw.beads_dir)
  if (!beadsDir) {
    return null
  }
  return {
    beadsDir,
    projectId: readOptionalString(raw.project_id) ?? null,
    database: readOptionalString(raw.database) ?? null,
    isWorktree: raw.is_worktree === true
  }
}

// Why: cached per host+repo path; every Orca worktree resolves to the shared beads_dir that queues and caches key on.
export async function resolveBeadsContext(target: BeadsExecutionTarget): Promise<BeadsRepoContext> {
  const key = `${beadsHostKey(target)}\n${target.repoPath}`
  const cached = contextCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.context
  }
  const result = await runBd(target, ['context', '--json'], BD_READ_TIMEOUT_MS)
  if (result.exitCode !== 0) {
    throw classifyBdFailure(result)
  }
  const context = normalizeBeadsContext(parseBdJsonRecord(result.stdout))
  if (!context) {
    throw new BeadsError(
      'not-initialized',
      'Beads is not initialized in this repository. Run `bd init`.'
    )
  }
  contextCache.set(key, { context, expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS })
  return context
}

export function resetBeadsContextCacheForTests(): void {
  contextCache.clear()
}
