import { access } from 'node:fs/promises'
import { isMissingCommandBinaryError } from '../git/exec-error'
import { commandExecFileAsync, extractExecError } from '../git/runner'
import { getSshGitProvider, getSshGitProviderGeneration } from '../providers/ssh-git-dispatch'
import { isWslPath, wslUncDirectoryExistsAsync } from '../wsl'

export const BD_READ_TIMEOUT_MS = 15_000
export const BD_WRITE_TIMEOUT_MS = 30_000

export type BeadsExecutionTarget = {
  repoPath: string
  /** null = the repo lives on this machine (or its WSL distro). */
  connectionId: string | null
  wslDistro?: string
}

export type BdExecResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  spawnFailed: boolean
  hostOffline: boolean
  timedOut: boolean
}

export function beadsHostKey(target: BeadsExecutionTarget): string {
  if (target.connectionId) {
    // Why: the generation changes on reconnect, so host-scoped caches reset with it.
    return `ssh:${target.connectionId}:${getSshGitProviderGeneration(target.connectionId)}`
  }
  return target.wslDistro ? `wsl:${target.wslDistro.toLowerCase()}` : 'local'
}

function readErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function offlineResult(message: string): BdExecResult {
  return {
    stdout: '',
    stderr: message,
    exitCode: null,
    spawnFailed: false,
    hostOffline: true,
    timedOut: false
  }
}

async function runBdOverSsh(
  connectionId: string,
  repoPath: string,
  args: readonly string[],
  timeoutMs: number
): Promise<BdExecResult> {
  const provider = getSshGitProvider(connectionId)
  if (!provider) {
    return offlineResult('SSH connection unavailable')
  }
  try {
    // Why: bd must run where .beads/ lives, so SSH repos run it on the remote host.
    const result = await provider.execNonInteractive('bd', [...args], repoPath, timeoutMs)
    return {
      stdout: result.stdout,
      stderr: result.spawnError ? `${result.spawnError}\n${result.stderr}` : result.stderr,
      exitCode: result.exitCode,
      spawnFailed: Boolean(result.spawnError),
      hostOffline: false,
      timedOut: result.timedOut
    }
  } catch (error) {
    return offlineResult(errorMessage(error))
  }
}

/**
 * Node reports the same spawn ENOENT for a missing binary and a missing cwd,
 * so this must positively confirm the repo path is gone, not merely fail to
 * confirm it exists.
 *
 * Why WSL paths need their own probe: Win32 fs calls against the WSL 9P
 * filesystem (\\wsl.localhost\...) can report ENOENT for directories that do
 * exist, so `access()` is unreliable there — an in-distro probe is the
 * authoritative answer, and its `null` (undeterminable) must not be read as
 * "missing".
 */
async function isRepoPathMissing(repoPath: string): Promise<boolean> {
  if (isWslPath(repoPath)) {
    return (await wslUncDirectoryExistsAsync(repoPath)) === false
  }
  try {
    await access(repoPath)
    return false
  } catch {
    return true
  }
}

async function runBdLocally(
  target: BeadsExecutionTarget,
  args: readonly string[],
  timeoutMs: number
): Promise<BdExecResult> {
  try {
    const { stdout, stderr } = await commandExecFileAsync('bd', [...args], {
      cwd: target.repoPath,
      timeout: timeoutMs,
      wslDistro: target.wslDistro
    })
    return { stdout, stderr, exitCode: 0, spawnFailed: false, hostOffline: false, timedOut: false }
  } catch (error) {
    const { stdout, stderr } = extractExecError(error)
    const code = readErrorCode(error)
    const missingBinary = isMissingCommandBinaryError(error)
    if (missingBinary && (await isRepoPathMissing(target.repoPath))) {
      return {
        stdout,
        stderr: `Repository path not found: ${target.repoPath}`,
        exitCode: null,
        spawnFailed: false,
        hostOffline: false,
        timedOut: false
      }
    }
    return {
      stdout,
      stderr,
      exitCode: typeof code === 'number' ? code : null,
      spawnFailed: missingBinary,
      hostOffline: false,
      timedOut: /timed out/i.test(errorMessage(error))
    }
  }
}

export async function runBd(
  target: BeadsExecutionTarget,
  args: readonly string[],
  timeoutMs: number
): Promise<BdExecResult> {
  return target.connectionId
    ? runBdOverSsh(target.connectionId, target.repoPath, args, timeoutMs)
    : runBdLocally(target, args, timeoutMs)
}
