import { describe, expect, it } from 'vitest'
import { getMatchingLinkedTaskSourceContext } from '../../../hooks/useComposerState'
import { normalizeTaskSourceContext } from '../../../../../shared/task-source-context'
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

  // Why: no `!`/`as` — a throw-guard narrows `TaskSourceContext | null` for the rest
  // of the test instead of asserting the type away.
  function requireContext(repo: typeof REPO) {
    const context = buildBeadsTaskSourceContext(repo)
    if (!context) {
      throw new Error('expected buildBeadsTaskSourceContext to return a context')
    }
    return context
  }

  it('normalizes to itself — projectId is never empty', () => {
    const context = requireContext(REPO)
    // Why: normalizeTaskSourceContext always emits every key (null for absent optional
    // ones); a hand-rolled literal that omits them would fail this even though it
    // "looks" equal — route production code through the same normalizer instead.
    expect(normalizeTaskSourceContext(context)).toEqual(context)
  })

  it('matches the linked item it was built alongside', () => {
    const context = requireContext(REPO)
    const item = buildBeadsLinkedItem({ id: 'cwf.3', title: 'Run the playtest' }, 'repo-1')
    expect(getMatchingLinkedTaskSourceContext(item, context)).toBe(context)
  })
})
