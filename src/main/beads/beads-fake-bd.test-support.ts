import type { Mock } from 'vitest'
import type { BdExecResult } from './beads-executor'

export type FakeBdReply = Partial<BdExecResult>

export function bdReply(stdout: string, overrides: FakeBdReply = {}): BdExecResult {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    spawnFailed: false,
    hostOffline: false,
    timedOut: false,
    ...overrides
  }
}

export const BASE_FAKE_BD_REPLIES: Record<string, BdExecResult> = {
  version: bdReply('bd version 1.2.2 (Homebrew)\n'),
  context: bdReply(
    JSON.stringify({
      beads_dir: '/repo/.beads',
      project_id: 'p-1',
      database: 'repo',
      is_worktree: false
    })
  ),
  'vc status': bdReply(JSON.stringify({ branch: 'main', commit: 'hash-1', schema_version: 1 }))
}

/**
 * Answers runBd calls by the longest matching argv prefix among the reply keys
 * ("vc status" beats "vc"). Unknown commands fail the test loudly.
 */
export function installFakeBd(runBdMock: Mock, replies: Record<string, BdExecResult>): void {
  const table = { ...BASE_FAKE_BD_REPLIES, ...replies }
  runBdMock.mockImplementation(async (_target: unknown, args: readonly string[]) => {
    for (let length = args.length; length > 0; length -= 1) {
      const reply = table[args.slice(0, length).join(' ')]
      if (reply) {
        return reply
      }
    }
    throw new Error(`unexpected bd call: ${args.join(' ')}`)
  })
}
