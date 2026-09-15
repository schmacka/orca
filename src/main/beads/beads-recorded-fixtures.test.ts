import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  normalizeBeadsIssue,
  normalizeBeadsIssueDetails
} from '../../shared/beads/beads-issue-normalize'
import { normalizeBeadsStatuses, normalizeBeadsTypes } from '../../shared/beads/beads-schema'
import { parseBdJson, parseBdJsonList, parseBdJsonRecord } from './bd-json'
import { normalizeBeadsContext } from './beads-context'
import { classifyBdFailure } from './beads-error'

const FIXTURE_DIR = join(__dirname, '__fixtures__', 'bd-1.2.2')

function fixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8')
}

type RecordedFailure = { stdout: string; stderr: string; exitCode: number }

function failure(name: string): RecordedFailure {
  const parsed: RecordedFailure = JSON.parse(fixture(name))
  return parsed
}

function classify(name: string): string {
  const recorded = failure(name)
  return classifyBdFailure({
    stdout: recorded.stdout,
    stderr: recorded.stderr,
    exitCode: recorded.exitCode,
    spawnFailed: false,
    hostOffline: false,
    timedOut: false
  }).kind
}

describe('recorded bd 1.2.2 output', () => {
  it('normalizes every list-shaped command without dropping rows', () => {
    for (const name of ['list', 'ready', 'blocked', 'search']) {
      const rows = parseBdJsonList(fixture(name))
      expect(rows.length, name).toBeGreaterThan(0)
      expect(rows.map((row) => normalizeBeadsIssue(row)).every(Boolean), name).toBe(true)
    }
  })

  it('normalizes show details with relations and a leading-dash comment', () => {
    const details = normalizeBeadsIssueDetails(parseBdJsonList(fixture('show'))[0])
    expect(details?.issue.title).toBe('-dash child')
    expect(details?.issue.parent).toBeDefined()
    expect(details?.dependencies.map((relation) => relation.dependencyType).sort()).toEqual([
      'blocks',
      'parent-child'
    ])
    expect(details?.comments.map((comment) => comment.text)).toEqual(['-first comment'])
  })

  it('reads write outputs', () => {
    expect(normalizeBeadsIssue(parseBdJsonRecord(fixture('create')))?.labels).toEqual(['ui'])
    expect(normalizeBeadsIssue(parseBdJsonList(fixture('claim'))[0])?.status).toBe('in_progress')
    expect(normalizeBeadsIssue(parseBdJsonList(fixture('close'))[0])?.closeReason).toBe('done')
    expect(parseBdJsonRecord(fixture('delete')).deleted).toBe('fx-12')
  })

  it('reads schema, context, count and change token', () => {
    const statuses = normalizeBeadsStatuses(parseBdJson(fixture('statuses')))
    expect(statuses.find((status) => status.name === 'closed')?.category).toBe('done')
    expect(normalizeBeadsTypes(parseBdJson(fixture('types'))).map((type) => type.name)).toContain(
      'epic'
    )
    expect(normalizeBeadsContext(parseBdJsonRecord(fixture('context')))?.isWorktree).toBe(false)
    expect(typeof parseBdJsonRecord(fixture('count')).count).toBe('number')
    expect(typeof parseBdJsonRecord(fixture('vc-status')).commit).toBe('string')
  })

  it('classifies recorded failures', () => {
    expect(classify('show-ambiguous')).toBe('ambiguous-id')
    expect(classify('show-not-found')).toBe('not-found')
    expect(classify('list-not-initialized')).toBe('not-initialized')
    expect(classify('context-not-initialized')).toBe('not-initialized')
  })
})
