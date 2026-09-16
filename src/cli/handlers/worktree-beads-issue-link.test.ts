import { describe, expect, it } from 'vitest'
import { getOptionalBeadsIssueLinkFlag } from './worktree-beads-issue-link'

describe('getOptionalBeadsIssueLinkFlag', () => {
  it('returns undefined when the flag is absent', () => {
    expect(getOptionalBeadsIssueLinkFlag(new Map(), 'beads-issue')).toBeUndefined()
  })

  it('builds a linked work item for a valid bead id', () => {
    const flags = new Map<string, string | boolean>([['beads-issue', 'proj-42']])

    expect(getOptionalBeadsIssueLinkFlag(flags, 'beads-issue')).toEqual({
      linkedWorkItem: {
        provider: 'beads',
        type: 'issue',
        number: 0,
        title: 'proj-42',
        url: 'bd://proj-42',
        beadsIdentifier: 'proj-42'
      }
    })
  })

  it('clears the link on "null" when allowNull is set', () => {
    const flags = new Map<string, string | boolean>([['beads-issue', 'null']])

    expect(getOptionalBeadsIssueLinkFlag(flags, 'beads-issue', { allowNull: true })).toEqual({
      linkedWorkItem: null
    })
  })

  it('rejects "null" naming --beads-issue when allowNull is not set', () => {
    const flags = new Map<string, string | boolean>([['beads-issue', 'null']])

    expect(() => getOptionalBeadsIssueLinkFlag(flags, 'beads-issue')).toThrow(/--beads-issue/)
  })

  it('rejects an invalid bead id with a message naming --beads-issue', () => {
    const flags = new Map<string, string | boolean>([['beads-issue', '-leading-dash']])

    expect(() => getOptionalBeadsIssueLinkFlag(flags, 'beads-issue')).toThrow(/--beads-issue/)
  })
})
