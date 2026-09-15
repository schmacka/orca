import { describe, expect, it } from 'vitest'
import {
  buildBlockedArgs,
  buildCountArgs,
  buildListArgs,
  buildReadyArgs,
  buildSearchArgs,
  buildShowArgs
} from './beads-read-args'

describe('read argv builders', () => {
  it('builds bd list with comma-joined statuses and filter flags', () => {
    expect(
      buildListArgs(
        {
          statuses: ['open', 'in_progress'],
          type: 'task',
          labels: ['ui', 'backend'],
          parent: 'baumoscan-cwf',
          priority: 1,
          assignee: 'Ada Lovelace',
          unassigned: false
        },
        201
      )
    ).toEqual([
      'list',
      '--json',
      '--limit=201',
      '--status=open,in_progress',
      '--parent=baumoscan-cwf',
      '--type=task',
      '--label=ui',
      '--label=backend',
      '--priority=1',
      '--assignee=Ada Lovelace'
    ])
  })

  it('uses --all only when closed issues are requested without explicit statuses', () => {
    expect(buildListArgs({ includeClosed: true }, 10)).toEqual([
      'list',
      '--json',
      '--limit=10',
      '--all'
    ])
    expect(buildListArgs({ includeClosed: true, statuses: ['closed'] }, 10)).toContain(
      '--status=closed'
    )
    expect(buildListArgs({ unassigned: true }, 10)).toContain('--no-assignee')
  })

  it('builds ready, blocked and show', () => {
    expect(buildReadyArgs({ parent: 'e-1', unassigned: true, type: 'bug' }, 51)).toEqual([
      'ready',
      '--json',
      '--limit=51',
      '--parent=e-1',
      '--unassigned',
      '--type=bug'
    ])
    expect(buildBlockedArgs({ parent: 'e-1' })).toEqual(['blocked', '--json', '--parent=e-1'])
    expect(buildShowArgs('baumoscan-cwf.3')).toEqual([
      'show',
      'baumoscan-cwf.3',
      '--json',
      '--include-dependents',
      '--include-comments'
    ])
  })

  it('builds search with --query and priority bounds', () => {
    expect(
      buildSearchArgs('-playtest', { priority: 2, includeClosed: true, unassigned: true }, 21)
    ).toEqual([
      'search',
      '--json',
      '--query=-playtest',
      '--limit=21',
      '--status=all',
      '--no-assignee',
      '--priority-min=2',
      '--priority-max=2'
    ])
  })

  it('builds count without parent support', () => {
    expect(buildCountArgs({ statuses: ['open'], labels: ['ui'] })).toEqual([
      'count',
      '--json',
      '--status=open',
      '--label=ui'
    ])
    expect(() => buildCountArgs({ parent: 'e-1' })).toThrow(/count cannot filter by parent/)
    expect(() => buildCountArgs({ statuses: ['open', 'closed'] })).toThrow(/one status/)
    expect(() => buildCountArgs({ includeClosed: true })).toThrow(
      /count cannot filter by includeClosed/
    )
  })

  it('rejects filters bd ready cannot apply instead of silently dropping them', () => {
    expect(() => buildReadyArgs({ statuses: ['open'] }, 10)).toThrow(
      /ready cannot filter by statuses/
    )
    expect(() => buildReadyArgs({ includeClosed: true }, 10)).toThrow(
      /ready cannot filter by includeClosed/
    )
  })

  it('rejects every filter bd blocked cannot apply, allowing only parent', () => {
    expect(buildBlockedArgs({ parent: 'e-1' })).toEqual(['blocked', '--json', '--parent=e-1'])
    expect(() => buildBlockedArgs({ type: 'bug' })).toThrow(/blocked cannot filter by type/)
    expect(() => buildBlockedArgs({ labels: ['ui'] })).toThrow(/blocked cannot filter by labels/)
    expect(() => buildBlockedArgs({ priority: 1 })).toThrow(/blocked cannot filter by priority/)
    expect(() => buildBlockedArgs({ assignee: 'a' })).toThrow(/blocked cannot filter by assignee/)
    expect(() => buildBlockedArgs({ unassigned: true })).toThrow(
      /blocked cannot filter by unassigned/
    )
    expect(() => buildBlockedArgs({ statuses: ['open'] })).toThrow(
      /blocked cannot filter by statuses/
    )
    expect(() => buildBlockedArgs({ includeClosed: true })).toThrow(
      /blocked cannot filter by includeClosed/
    )
  })

  it('rejects hostile or malformed input before anything runs', () => {
    expect(() => buildShowArgs('--help')).toThrow(/Invalid beads issue id/)
    expect(() => buildListArgs({ statuses: ['open;rm'] }, 10)).toThrow(/status/)
    expect(() => buildListArgs({ labels: ['a,b'] }, 10)).toThrow(/label/)
    expect(() => buildListArgs({ priority: 7 }, 10)).toThrow(/Priority/)
    expect(() => buildListArgs({}, 0)).toThrow(/limit/)
    expect(() => buildListArgs({ assignee: 'a\nb' }, 10)).toThrow(/assignee/)
    expect(() => buildSearchArgs('  ', {}, 10)).toThrow(/search text/)
    expect(() => buildSearchArgs('x', { parent: 'e-1' }, 10)).toThrow(
      /search cannot filter by parent/
    )
    expect(() => buildListArgs(JSON.parse('{"labels":"ui"}'), 10)).toThrow(/labels must be a list/)
    expect(() => buildListArgs(JSON.parse('{"statuses":"open"}'), 10)).toThrow(
      /statuses must be a list/
    )
  })
})
