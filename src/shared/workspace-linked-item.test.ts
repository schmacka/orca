import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceLinkedItem } from './workspace-linked-item'
import type { WorkspaceLinkedItem } from './worktree/types'

const BEAD_INPUT: WorkspaceLinkedItem = {
  provider: 'beads',
  type: 'issue',
  number: 0,
  title: 'cwf.3 Run the playtest',
  url: 'bd://repo-1/cwf.3',
  beadsIdentifier: 'cwf.3',
  repoId: 'repo-1'
}

describe('normalizeWorkspaceLinkedItem with beads', () => {
  it('round-trips a bead, keeping the identifier that is its real identity', () => {
    expect(normalizeWorkspaceLinkedItem(BEAD_INPUT)).toEqual(BEAD_INPUT)
  })

  it('refuses a bead with no identifier rather than persisting a link nothing can resolve', () => {
    const { beadsIdentifier: _dropped, ...withoutIdentifier } = BEAD_INPUT
    expect(normalizeWorkspaceLinkedItem(withoutIdentifier)).toBeNull()
  })
})
