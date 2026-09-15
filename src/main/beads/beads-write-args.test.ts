import { describe, expect, it } from 'vitest'
import {
  buildClaimArgs,
  buildCloseArgs,
  buildCommentArgs,
  buildCreateArgs,
  buildDeferArgs,
  buildDeleteArgs,
  buildReopenArgs,
  buildUndeferArgs,
  buildUpdateArgs
} from './beads-write-args'

describe('write argv builders', () => {
  it('builds create with every field as --flag=value, so a leading dash stays text', () => {
    expect(
      buildCreateArgs(
        {
          title: '-dash title',
          issueType: 'task',
          priority: 1,
          parent: 'probe-3os',
          assignee: 'ada',
          labels: ['ui', 'backend'],
          description: 'line one\nline two',
          design: 'd',
          acceptanceCriteria: 'acc',
          notes: 'n'
        },
        'orca-user'
      )
    ).toEqual([
      'create',
      '--json',
      '--title=-dash title',
      '--type=task',
      '--priority=1',
      '--parent=probe-3os',
      '--assignee=ada',
      '--labels=ui',
      '--labels=backend',
      '--description=line one\nline two',
      '--design=d',
      '--acceptance=acc',
      '--notes=n',
      '--actor=orca-user'
    ])
  })

  it('builds update only with provided fields and clears a description explicitly', () => {
    expect(
      buildUpdateArgs(
        'probe-3os.1',
        {
          title: 'Renamed',
          priority: 0,
          addLabels: ['backend'],
          removeLabels: ['ui'],
          description: ''
        },
        null
      )
    ).toEqual([
      'update',
      'probe-3os.1',
      '--json',
      '--title=Renamed',
      '--priority=0',
      '--add-label=backend',
      '--remove-label=ui',
      '--description=',
      '--allow-empty-description'
    ])
    expect(buildUpdateArgs('p-1', { assignee: '' }, null)).toEqual([
      'update',
      'p-1',
      '--json',
      '--assignee='
    ])
    expect(() => buildUpdateArgs('p-1', {}, null)).toThrow(/Nothing to update/)
  })

  it('builds claim, close, reopen, defer, undefer and delete', () => {
    expect(buildClaimArgs('p-1', 'me')).toEqual([
      'update',
      'p-1',
      '--json',
      '--claim',
      '--actor=me'
    ])
    expect(buildCloseArgs('p-1', 'done it', null)).toEqual([
      'close',
      'p-1',
      '--json',
      '--reason=done it'
    ])
    expect(() => buildCloseArgs('p-1', '  ', null)).toThrow(/reason/)
    expect(buildReopenArgs('p-1', null, null)).toEqual(['reopen', 'p-1', '--json'])
    expect(buildReopenArgs('p-1', 'again', null)).toEqual([
      'reopen',
      'p-1',
      '--json',
      '--reason=again'
    ])
    expect(buildDeferArgs('p-1', 'tomorrow', null)).toEqual([
      'defer',
      'p-1',
      '--json',
      '--until=tomorrow'
    ])
    expect(buildUndeferArgs('p-1', null)).toEqual(['undefer', 'p-1', '--json'])
    expect(buildDeleteArgs('p-1', null)).toEqual(['delete', 'p-1', '--json', '--force'])
  })

  it('puts comment text after -- with all flags before it', () => {
    expect(buildCommentArgs('p-1', '  -hello --json \n', 'me')).toEqual([
      'comment',
      'p-1',
      '--json',
      '--actor=me',
      '--',
      '-hello --json'
    ])
    expect(() => buildCommentArgs('p-1', '   ', null)).toThrow(/comment/)
  })

  it('rejects hostile ids, multi-line titles and actors', () => {
    expect(() => buildClaimArgs('-rf', null)).toThrow(/Invalid beads issue id/)
    expect(() => buildCreateArgs({ title: 'a\nb' }, null)).toThrow(/title/)
    expect(() => buildCreateArgs({ title: 'a' }, 'x\ny')).toThrow(/actor/)
    expect(() => buildUpdateArgs('p-1', { status: 'open,closed' }, null)).toThrow(/status/)
  })
})
