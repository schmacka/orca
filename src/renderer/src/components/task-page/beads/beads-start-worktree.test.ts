import { describe, expect, it } from 'vitest'
import { getMatchingLinkedTaskSourceContext } from '../../../hooks/useComposerState'
import { normalizeTaskSourceContext } from '../../../../../shared/task-source-context'
import { shouldPreserveWorkspaceSourceOnRepoChange } from '../../../../../shared/new-workspace/workspace-source'
import { normalizeWorkspaceLinkedItem } from '../../../../../shared/workspace-linked-item'
import { toFolderWorkspaceLinkedTask } from '../../sidebar/folder-workspace-composer-helpers'
import {
  buildBeadsLinkedItem,
  buildBeadsTaskSourceContext,
  buildBeadsWorkspaceSeed
} from './beads-start-worktree'

describe('buildBeadsLinkedItem', () => {
  it('builds a linked item a worktree can persist', () => {
    expect(buildBeadsLinkedItem({ id: 'cwf.3', title: 'Run the playtest' }, 'repo-1')).toEqual({
      provider: 'beads',
      type: 'issue',
      number: 0,
      title: 'cwf.3 Run the playtest',
      url: 'bd://cwf.3',
      beadsIdentifier: 'cwf.3',
      repoId: 'repo-1'
    })
  })

  it('survives normalization — the identifier is not dropped on the way to persistence', () => {
    const item = buildBeadsLinkedItem({ id: 'cwf.3', title: 'Run the playtest' }, 'repo-1')
    expect(normalizeWorkspaceLinkedItem(item)?.beadsIdentifier).toBe('cwf.3')
    expect(toFolderWorkspaceLinkedTask(item)?.beadsIdentifier).toBe('cwf.3')
  })
})

describe('buildBeadsWorkspaceSeed', () => {
  it('slugs the identifier and title like other linked-item seeds', () => {
    expect(buildBeadsWorkspaceSeed({ id: 'cwf.3', title: 'Run the playtest' })).toBe(
      'cwf.3-run-the-playtest'
    )
    expect(
      buildBeadsWorkspaceSeed({ id: 'x.1', title: 'Decide: does a "store line" count?' })
    ).toBe('x.1-decide-does-a-store-line-count')
    expect(buildBeadsWorkspaceSeed({ id: 'x.1', title: '!!!' })).toBe('x.1')
  })
})

describe('buildBeadsTaskSourceContext', () => {
  const REPO = { id: 'repo-1', path: '/work/app', connectionId: null, executionHostId: null }

  it('normalizes to itself — projectId is never empty', () => {
    const context = buildBeadsTaskSourceContext(REPO)
    expect(normalizeTaskSourceContext(context)).toEqual(context)
  })

  it('matches the linked item it was built alongside', () => {
    const context = buildBeadsTaskSourceContext(REPO)
    const item = buildBeadsLinkedItem({ id: 'cwf.3', title: 'Run the playtest' }, 'repo-1')
    expect(getMatchingLinkedTaskSourceContext(item, context)).toBe(context)
  })

  it('does not carry over on a repo change — a bead id means nothing in another repo', () => {
    const item = buildBeadsLinkedItem({ id: 'cwf.3', title: 'Run the playtest' }, 'repo-1')
    expect(shouldPreserveWorkspaceSourceOnRepoChange(item)).toBe(false)
  })
})
