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
  addBeadsComment,
  claimBeadsIssue,
  closeBeadsIssue,
  createBeadsIssue,
  deleteBeadsIssue,
  updateBeadsIssue
} from './beads-write-service'

const TARGET = { repoPath: '/repo', connectionId: null }

function showReply(id: string, status: string) {
  return bdReply(JSON.stringify([{ id, title: 'T', status, priority: 2, issue_type: 'task' }]))
}

function bdCalls(): string[][] {
  return runBdMock.mock.calls.map((call) => call[1])
}

beforeEach(() => {
  runBdMock.mockReset()
  resetBdVersionCacheForTests()
  resetBeadsContextCacheForTests()
})

describe('beads write service', () => {
  it('creates an issue and reads the new id back with bd show', async () => {
    installFakeBd(runBdMock, {
      create: bdReply(JSON.stringify({ id: 'p-9', title: 'New', schema_version: 1 })),
      'show p-9': showReply('p-9', 'open')
    })
    const details = await createBeadsIssue(TARGET, { title: 'New', issueType: 'bug' }, 'me')
    expect(details.issue.id).toBe('p-9')
    expect(runBdMock).toHaveBeenCalledWith(
      TARGET,
      ['create', '--json', '--title=New', '--type=bug', '--actor=me'],
      30_000
    )
  })

  it('updates, claims and closes, returning fresh details each time', async () => {
    installFakeBd(runBdMock, {
      update: bdReply('[]'),
      close: bdReply('[]'),
      'show p-1': showReply('p-1', 'in_progress')
    })
    await updateBeadsIssue(TARGET, 'p-1', { priority: 0 }, null)
    await claimBeadsIssue(TARGET, 'p-1', 'me')
    const closed = await closeBeadsIssue(TARGET, 'p-1', 'done', null)
    expect(closed.issue.id).toBe('p-1')
    const writes = bdCalls().filter((args) => args[0] === 'update' || args[0] === 'close')
    expect(writes).toEqual([
      ['update', 'p-1', '--json', '--priority=0'],
      ['update', 'p-1', '--json', '--claim', '--actor=me'],
      ['close', 'p-1', '--json', '--reason=done']
    ])
  })

  it('posts comments with the text after --', async () => {
    installFakeBd(runBdMock, {
      comment: bdReply('✓ Comment added'),
      'show p-1': showReply('p-1', 'open')
    })
    await addBeadsComment(TARGET, 'p-1', '-hi', null)
    expect(bdCalls()).toContainEqual(['comment', 'p-1', '--json', '--', '-hi'])
  })

  it('deletes and reports the deleted id', async () => {
    installFakeBd(runBdMock, {
      delete: bdReply('{"deleted":"p-1","dependencies_removed":1,"schema_version":1}')
    })
    await expect(deleteBeadsIssue(TARGET, 'p-1', null)).resolves.toEqual({ deleted: 'p-1' })
  })

  it('throws loudly when a write fails and never reads back', async () => {
    installFakeBd(runBdMock, {
      update: bdReply('', {
        exitCode: 1,
        stderr: 'Error: no issue found matching "p-404"'
      })
    })
    await expect(updateBeadsIssue(TARGET, 'p-404', { title: 'x' }, null)).rejects.toMatchObject({
      kind: 'not-found'
    })
    expect(bdCalls().some((args) => args[0] === 'show')).toBe(false)
  })

  it('rejects hostile input without spawning bd', async () => {
    installFakeBd(runBdMock, {})
    await expect(claimBeadsIssue(TARGET, '--all', null)).rejects.toMatchObject({
      kind: 'invalid-input'
    })
    expect(runBdMock).not.toHaveBeenCalled()
  })
})
