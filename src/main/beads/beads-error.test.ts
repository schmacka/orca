import { describe, expect, it } from 'vitest'
import {
  BeadsError,
  captureBeadsResult,
  classifyBdFailure,
  isBdNotInitializedOutput,
  toBeadsFailure
} from './beads-error'
import type { BdExecResult } from './beads-executor'

function failed(overrides: Partial<BdExecResult>): BdExecResult {
  return {
    stdout: '',
    stderr: '',
    exitCode: 1,
    spawnFailed: false,
    hostOffline: false,
    timedOut: false,
    ...overrides
  }
}

describe('classifyBdFailure', () => {
  it('orders transport problems before output matching', () => {
    expect(classifyBdFailure(failed({ hostOffline: true })).kind).toBe('host-offline')
    expect(classifyBdFailure(failed({ spawnFailed: true })).kind).toBe('bd-missing')
    expect(classifyBdFailure(failed({ timedOut: true })).kind).toBe('busy')
  })

  it('detects ambiguous ids from stderr even though stdout says not found (bd 1.2.2)', () => {
    const error = classifyBdFailure(
      failed({
        stderr:
          'Error fetching baumoscan-1: ambiguous ID "baumoscan-1" matches 2 issues: [a b]\nUse more characters to disambiguate',
        stdout: '{"error": "no issues found matching the provided IDs", "schema_version": 1}'
      })
    )
    expect(error.kind).toBe('ambiguous-id')
    expect(error.message).toContain('ambiguous ID')
  })

  it('detects unknown ids', () => {
    const error = classifyBdFailure(
      failed({
        stderr: 'Error fetching nope-zzz: no issue found matching "nope-zzz"',
        stdout: '{"error": "no issues found matching the provided IDs"}'
      })
    )
    expect(error.kind).toBe('not-found')
  })

  it('detects uninitialized workspaces from bd list and bd context wording', () => {
    expect(
      classifyBdFailure(failed({ stderr: 'Error: no beads database found\nHint: run bd init' }))
        .kind
    ).toBe('not-initialized')
    expect(
      classifyBdFailure(
        failed({ stdout: '{"error": "cannot resolve repo context: no .beads directory found"}' })
      ).kind
    ).toBe('not-initialized')
  })

  it('never reports other failures as not initialized', () => {
    const error = classifyBdFailure(failed({ stderr: 'database is corrupt', exitCode: 2 }))
    expect(error.kind).toBe('failed')
    expect(error.message).toBe('database is corrupt')
    expect(classifyBdFailure(failed({ exitCode: 3 })).message).toBe('bd exited with code 3')
  })
})

describe('isBdNotInitializedOutput', () => {
  it('does not match unrelated text', () => {
    expect(isBdNotInitializedOutput('permission denied')).toBe(false)
  })
})

describe('toBeadsFailure and captureBeadsResult', () => {
  it('keeps the kind of BeadsError and maps other errors to failed', async () => {
    expect(toBeadsFailure(new BeadsError('busy', 'b'))).toEqual({ kind: 'busy', message: 'b' })
    expect(toBeadsFailure(new Error('boom'))).toEqual({ kind: 'failed', message: 'boom' })
    expect(await captureBeadsResult(async () => 3)).toEqual({ ok: true, value: 3 })
    expect(
      await captureBeadsResult(async () => {
        throw new BeadsError('not-found', 'nope')
      })
    ).toEqual({ ok: false, error: { kind: 'not-found', message: 'nope' } })
  })
})
