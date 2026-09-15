import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commandExecFileAsync } from '../git/runner'
import type { BeadsExecutionTarget } from './beads-executor'
import {
  getBeadsChangeToken,
  getBeadsIssueDetails,
  getBeadsSchema,
  getBeadsWorkspaceStatus,
  listBeadsIssues
} from './beads-read-service'
import {
  addBeadsComment,
  claimBeadsIssue,
  closeBeadsIssue,
  createBeadsIssue,
  updateBeadsIssue
} from './beads-write-service'

const ACTOR = 'orca-itest'

async function exec(cwd: string, command: string, args: string[]): Promise<void> {
  await commandExecFileAsync(command, args, { cwd, timeout: 30_000 })
}

describe.runIf(process.env.ORCA_BEADS_INTEGRATION === '1')('beads backend against real bd', () => {
  let repoDir = ''
  let emptyDir = ''
  let target: BeadsExecutionTarget

  beforeAll(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'orca-beads-itest-'))
    emptyDir = await mkdtemp(join(tmpdir(), 'orca-beads-empty-'))
    await exec(repoDir, 'git', ['init', '-q'])
    await exec(repoDir, 'git', ['config', 'user.name', 'Orca Test'])
    await exec(repoDir, 'git', ['config', 'user.email', 'test@example.com'])
    await exec(repoDir, 'bd', [
      'init',
      '--prefix=itest',
      '--non-interactive',
      '--skip-hooks',
      '--skip-agents',
      '-q'
    ])
    await exec(repoDir, 'bd', ['create', '--json', '--title=Ambiguous a', '--id=itest-a11'])
    await exec(repoDir, 'bd', ['create', '--json', '--title=Ambiguous b', '--id=itest-a12'])
    target = { repoPath: repoDir, connectionId: null }
  }, 60_000)

  afterAll(async () => {
    await rm(repoDir, { recursive: true, force: true })
    await rm(emptyDir, { recursive: true, force: true })
  })

  it('reports workspace status and schema', async () => {
    const status = await getBeadsWorkspaceStatus(target)
    expect(status).toMatchObject({ initialized: true, versionSupported: true })
    expect(status.beadsDir).toContain(repoDir.split('/').pop())
    const schema = await getBeadsSchema(target)
    expect(schema.statuses.find((entry) => entry.name === 'closed')?.category).toBe('done')
    const empty = await getBeadsWorkspaceStatus({ repoPath: emptyDir, connectionId: null })
    expect(empty.initialized).toBe(false)
  })

  it('runs the full issue lifecycle', async () => {
    const tokenBefore = await getBeadsChangeToken(target)
    const epic = await createBeadsIssue(target, { title: 'Epic', issueType: 'epic' }, ACTOR)
    const child = await createBeadsIssue(
      target,
      { title: '-leading dash', parent: epic.issue.id, labels: ['ui'], description: 'first' },
      ACTOR
    )
    expect(child.issue.title).toBe('-leading dash')
    expect(child.dependencies.map((relation) => relation.dependencyType)).toContain('parent-child')
    expect(await getBeadsChangeToken(target)).not.toBe(tokenBefore)

    const children = await listBeadsIssues(target, {
      view: 'list',
      filter: { parent: epic.issue.id },
      limit: 200
    })
    expect(children.issues.map((issue) => issue.id)).toEqual([child.issue.id])

    const updated = await updateBeadsIssue(
      target,
      child.issue.id,
      { priority: 0, addLabels: ['backend'], description: '' },
      ACTOR
    )
    expect(updated.issue.priority).toBe(0)
    expect(updated.issue.labels.sort()).toEqual(['backend', 'ui'])
    expect(updated.issue.description).toBeUndefined()

    const claimed = await claimBeadsIssue(target, child.issue.id, ACTOR)
    expect(claimed.issue).toMatchObject({ status: 'in_progress', assignee: ACTOR })

    // Confirm an empty --assignee= really unassigns.
    const unassigned = await updateBeadsIssue(target, child.issue.id, { assignee: '' }, ACTOR)
    expect(unassigned.issue.assignee).toBeUndefined()

    const commented = await addBeadsComment(target, child.issue.id, '-dash comment', ACTOR)
    expect(commented.comments.map((comment) => comment.text)).toEqual(['-dash comment'])

    const closed = await closeBeadsIssue(target, child.issue.id, 'done', ACTOR)
    expect(closed.issue).toMatchObject({ status: 'closed', closeReason: 'done' })

    const open = await listBeadsIssues(target, { view: 'list', filter: {}, limit: 200 })
    expect(open.issues.some((issue) => issue.id === child.issue.id)).toBe(false)
    const all = await listBeadsIssues(target, {
      view: 'list',
      filter: { includeClosed: true },
      limit: 200
    })
    expect(all.issues.some((issue) => issue.id === child.issue.id)).toBe(true)
    // Why: the Closed preset sends only --status=closed; confirm bd does not also need --all.
    const onlyClosed = await listBeadsIssues(target, {
      view: 'list',
      filter: { statuses: ['closed'] },
      limit: 200
    })
    expect(onlyClosed.issues.map((issue) => issue.id)).toContain(child.issue.id)
  }, 60_000)

  it('classifies ambiguous and unknown ids', async () => {
    await expect(getBeadsIssueDetails(target, 'itest-a1')).rejects.toMatchObject({
      kind: 'ambiguous-id'
    })
    await expect(getBeadsIssueDetails(target, 'itest-zzzz')).rejects.toMatchObject({
      kind: 'not-found'
    })
  })
})
