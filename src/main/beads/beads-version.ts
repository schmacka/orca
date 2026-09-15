import { BeadsError, classifyBdFailure } from './beads-error'
import {
  BD_READ_TIMEOUT_MS,
  beadsHostKey,
  runBd,
  type BeadsExecutionTarget
} from './beads-executor'

// Why 1.2.0: Orca relies on `ready --limit`, `vc status --json` and `context --json`.
export const BD_MIN_VERSION: readonly [number, number, number] = [1, 2, 0]

const VERSION_CACHE_TTL_MS = 5 * 60 * 1000
// Why: short TTL so installing or upgrading bd mid-session is picked up without a relaunch.
const VERSION_FAILURE_CACHE_TTL_MS = 30_000

export type BdVersionInfo = {
  installed: boolean
  version: string | null
  supported: boolean
  hostOffline: boolean
}

type CachedVersion = { info: BdVersionInfo; expiresAt: number }

const versionCache = new Map<string, CachedVersion>()
const versionProbes = new Map<string, Promise<BdVersionInfo>>()

export function parseBdVersion(output: string): string | null {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)/)
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null
}

export function isSupportedBdVersion(version: string): boolean {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10))
  for (let index = 0; index < BD_MIN_VERSION.length; index += 1) {
    const part = parts[index]
    const minimum = BD_MIN_VERSION[index]
    if (part === undefined || !Number.isFinite(part)) {
      return false
    }
    if (part !== minimum) {
      return part > minimum
    }
  }
  return true
}

async function probeBdVersion(target: BeadsExecutionTarget): Promise<BdVersionInfo> {
  const result = await runBd(target, ['version'], BD_READ_TIMEOUT_MS)
  // Why: a non-zero exit that is neither a missing binary nor an offline host is a
  // repo-specific failure (e.g. a deleted repo path) — it says nothing about bd on
  // this host, so it must not be read as "bd is not installed" or cached as such.
  if (!result.spawnFailed && !result.hostOffline && result.exitCode !== 0) {
    throw classifyBdFailure(result)
  }
  const version = result.exitCode === 0 ? parseBdVersion(result.stdout) : null
  return {
    installed: result.exitCode === 0 && !result.spawnFailed,
    version,
    supported: version !== null && isSupportedBdVersion(version),
    hostOffline: result.hostOffline
  }
}

export async function getBdVersionInfo(target: BeadsExecutionTarget): Promise<BdVersionInfo> {
  const key = beadsHostKey(target)
  const cached = versionCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.info
  }
  const inflight = versionProbes.get(key)
  if (inflight) {
    return inflight
  }
  const probe = probeBdVersion(target)
    .then((info) => {
      // Why: an offline host says nothing about bd; caching it would hide bd after reconnect.
      if (!info.hostOffline) {
        const ttl = info.supported ? VERSION_CACHE_TTL_MS : VERSION_FAILURE_CACHE_TTL_MS
        versionCache.set(key, { info, expiresAt: Date.now() + ttl })
      }
      return info
    })
    .finally(() => {
      versionProbes.delete(key)
    })
  versionProbes.set(key, probe)
  return probe
}

export async function requireSupportedBd(target: BeadsExecutionTarget): Promise<string> {
  const info = await getBdVersionInfo(target)
  if (info.hostOffline) {
    throw new BeadsError('host-offline', 'The remote host is not connected.')
  }
  if (!info.installed || info.version === null) {
    throw new BeadsError('bd-missing', 'bd is not installed on this host.')
  }
  if (!info.supported) {
    throw new BeadsError(
      'bd-outdated',
      `bd ${info.version} is too old; Orca needs bd ${BD_MIN_VERSION.join('.')} or newer.`
    )
  }
  return info.version
}

export function resetBdVersionCacheForTests(): void {
  versionCache.clear()
  versionProbes.clear()
}
