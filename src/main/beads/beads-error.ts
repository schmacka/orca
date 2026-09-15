import type { BeadsErrorKind, BeadsFailure, BeadsResult } from '../../shared/beads/beads-contract'
import type { BdExecResult } from './beads-executor'

const MAX_MESSAGE_LENGTH = 500

export class BeadsError extends Error {
  readonly kind: BeadsErrorKind

  constructor(kind: BeadsErrorKind, message: string) {
    super(message)
    this.name = 'BeadsError'
    this.kind = kind
  }
}

function truncateMessage(text: string): string {
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH)}…` : text
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? ''
}

export function isBdNotInitializedOutput(output: string): boolean {
  return /no beads (?:database|workspace) found|not a beads (?:database|workspace)|no \.beads directory found/i.test(
    output
  )
}

export function classifyBdFailure(result: BdExecResult): BeadsError {
  if (result.hostOffline) {
    return new BeadsError('host-offline', 'The remote host is not connected.')
  }
  if (result.spawnFailed) {
    return new BeadsError('bd-missing', 'bd is not installed on this host.')
  }
  if (result.timedOut) {
    return new BeadsError('busy', 'Beads is busy (another process may be writing). Try again.')
  }
  // Why: bd 1.2.2 prints the same "no issues found" JSON for ambiguous and unknown
  // ids; only stderr says "ambiguous", so it must be checked first.
  if (/ambiguous ID/i.test(result.stderr)) {
    return new BeadsError('ambiguous-id', truncateMessage(firstLine(result.stderr)))
  }
  const output = `${result.stderr}\n${result.stdout}`
  if (/no issues? found matching/i.test(output)) {
    return new BeadsError(
      'not-found',
      truncateMessage(firstLine(result.stderr) || 'Issue not found.')
    )
  }
  if (isBdNotInitializedOutput(output)) {
    return new BeadsError(
      'not-initialized',
      'Beads is not initialized in this repository. Run `bd init`.'
    )
  }
  const detail = result.stderr.trim() || result.stdout.trim()
  return new BeadsError(
    'failed',
    truncateMessage(detail || `bd exited with code ${result.exitCode ?? 'unknown'}`)
  )
}

export function toBeadsFailure(error: unknown): BeadsFailure {
  if (error instanceof BeadsError) {
    return { kind: error.kind, message: error.message }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { kind: 'failed', message: truncateMessage(message) }
}

export async function captureBeadsResult<T>(run: () => Promise<T>): Promise<BeadsResult<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    return { ok: false, error: toBeadsFailure(error) }
  }
}
