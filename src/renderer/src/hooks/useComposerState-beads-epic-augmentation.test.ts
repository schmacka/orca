// @vitest-environment happy-dom

// Regression guard: useBeadsEpicContextAugmentation is wired in at exactly one
// call site (useComposerState.ts). The hook itself is pinned by
// composer-state/beads-epic-context-augmentation.test.ts and the fetch it
// calls is pinned by beads-epic-launch-context.test.ts — neither test reddens
// if the wire between useComposerState and the hook is cut. This test does.
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { BeadsEpicLinkedContextSource } from '@/lib/beads-epic-launch-context'

const { useBeadsEpicContextAugmentationMock } = vi.hoisted(() => ({
  useBeadsEpicContextAugmentationMock: vi.fn()
}))

vi.mock('./composer-state/beads-epic-context-augmentation', () => ({
  useBeadsEpicContextAugmentation: useBeadsEpicContextAugmentationMock
}))

import { useComposerState } from './useComposerState'

let originalApiDescriptor: PropertyDescriptor | undefined

const EPIC_SOURCE: BeadsEpicLinkedContextSource = {
  repo: { id: 'repo-1', path: '/work/app', connectionId: null, executionHostId: null },
  epic: { id: 'cwf.1', title: 'Ship the thing' }
}

beforeEach(() => {
  useBeadsEpicContextAugmentationMock.mockClear()
  originalApiDescriptor = Object.getOwnPropertyDescriptor(window, 'api')
  const ui = {
    onFileDrop: vi.fn<Window['api']['ui']['onFileDrop']>()
  } satisfies Pick<Window['api']['ui'], 'onFileDrop'>
  const preflight = {
    detectAgents: vi.fn<Window['api']['preflight']['detectAgents']>().mockResolvedValue([])
  } satisfies Pick<Window['api']['preflight'], 'detectAgents'>
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { preflight, ui }
  })
  useAppStore.setState({
    repos: [],
    projects: [],
    projectGroups: [],
    projectHostSetups: [],
    newWorkspaceDraft: null,
    worktreesByRepo: {},
    sparsePresetsByRepo: {}
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  if (originalApiDescriptor) {
    Object.defineProperty(window, 'api', originalApiDescriptor)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})

describe('useComposerState beads epic augmentation wiring', () => {
  it('passes the epic source through to useBeadsEpicContextAugmentation', () => {
    renderHook(() =>
      useComposerState({
        initialName: 'epic-worktree',
        persistDraft: false,
        createGateMode: 'quick',
        initialBeadsEpicSource: EPIC_SOURCE
      })
    )

    expect(useBeadsEpicContextAugmentationMock).toHaveBeenCalledWith(
      expect.objectContaining({ initialBeadsEpicSource: EPIC_SOURCE })
    )
  })

  it('passes null when the composer has no beads epic source', () => {
    renderHook(() =>
      useComposerState({
        initialName: 'plain-worktree',
        persistDraft: false,
        createGateMode: 'quick'
      })
    )

    expect(useBeadsEpicContextAugmentationMock).toHaveBeenCalledWith(
      expect.objectContaining({ initialBeadsEpicSource: null })
    )
  })
})
