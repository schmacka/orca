import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runBdMock } = vi.hoisted(() => ({ runBdMock: vi.fn() }))

vi.mock('./beads-executor', () => ({
  BD_READ_TIMEOUT_MS: 15_000,
  beadsHostKey: () => 'local',
  runBd: runBdMock
}))

import { resetBeadsContextCacheForTests, resolveBeadsContext } from './beads-context'

const TARGET = { repoPath: '/repo-worktree', connectionId: null }

// Verbatim bd 1.2.2 `bd context --json` from a git worktree of baumoscan (trimmed).
const WORKTREE_CONTEXT = {
  backend: 'dolt',
  bd_version: '1.2.2',
  beads_dir: '/Users/me/Developer/baumoscan/.beads',
  database: 'baumoscan',
  dolt_mode: 'embedded',
  is_redirected: false,
  is_worktree: true,
  project_id: 'ed2543a6-80f4-4884-a227-8e8306d2b4d3',
  schema_version: 1
}

function reply(stdout: string, exitCode: number) {
  return { stdout, stderr: '', exitCode, spawnFailed: false, hostOffline: false, timedOut: false }
}

beforeEach(() => {
  runBdMock.mockReset()
  resetBeadsContextCacheForTests()
})

describe('resolveBeadsContext', () => {
  it('resolves a worktree to the main repo beads dir and caches it', async () => {
    runBdMock.mockResolvedValue(reply(JSON.stringify(WORKTREE_CONTEXT), 0))
    const context = await resolveBeadsContext(TARGET)
    await resolveBeadsContext(TARGET)
    expect(context).toEqual({
      beadsDir: '/Users/me/Developer/baumoscan/.beads',
      projectId: 'ed2543a6-80f4-4884-a227-8e8306d2b4d3',
      database: 'baumoscan',
      isWorktree: true
    })
    expect(runBdMock).toHaveBeenCalledTimes(1)
    expect(runBdMock).toHaveBeenCalledWith(TARGET, ['context', '--json'], 15_000)
  })

  it('reports an uninitialized repo', async () => {
    runBdMock.mockResolvedValue(
      reply(
        '{"error": "cannot resolve repo context: no .beads directory found", "schema_version": 1}',
        1
      )
    )
    await expect(resolveBeadsContext(TARGET)).rejects.toMatchObject({ kind: 'not-initialized' })
  })

  it('does not cache failures', async () => {
    runBdMock.mockResolvedValueOnce(reply('', 2))
    runBdMock.mockResolvedValueOnce(reply(JSON.stringify(WORKTREE_CONTEXT), 0))
    await expect(resolveBeadsContext(TARGET)).rejects.toMatchObject({ kind: 'failed' })
    await expect(resolveBeadsContext(TARGET)).resolves.toMatchObject({ isWorktree: true })
  })
})
