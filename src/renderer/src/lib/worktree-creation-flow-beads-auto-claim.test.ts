import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type {
  PendingWorktreeCreation,
  WorktreeCreationRequest
} from '@/lib/pending-worktree-creation'
import type { WorkspaceLinkedItem } from '../../../shared/worktree/types'

// Regression guard: autoClaimBeadsWorktree is called from exactly one call
// site (worktree-creation-flow-execute.ts:144-146). Nothing else pins that
// wire — delete the call there and this test is the only one that reddens.
const { autoClaimBeadsWorktreeMock } = vi.hoisted(() => ({
  autoClaimBeadsWorktreeMock: vi.fn(async () => {})
}))

type TestActiveView = 'terminal' | 'tasks'
type TestRepo = { id: string; connectionId: string | null }
type TestCreatedWorktree = { id: string; repoId: string; linkedWorkItem?: WorkspaceLinkedItem }
type TestCreateWorktreeResult = { worktree: TestCreatedWorktree }

type TestStore = {
  settings: { activeRuntimeEnvironmentId: string | null }
  activeView: TestActiveView
  activePendingCreationId: string | null
  repos: TestRepo[]
  pendingWorktreeCreations: Record<string, PendingWorktreeCreation>
  beginPendingWorktreeCreation: (entry: PendingWorktreeCreation) => void
  updatePendingWorktreeCreation: (
    creationId: string,
    patch: Partial<PendingWorktreeCreation>
  ) => void
  removePendingWorktreeCreation: (creationId: string) => void
  updateWorktreeMeta: () => void
  setActivePendingWorktreeCreation: () => void
  setActiveView: () => void
  setSidebarOpen: () => void
  createWorktree: Mock<() => Promise<TestCreateWorktreeResult>>
  setupProjectExistingFolder: () => void
  refreshRuntimeEnvironmentStatus: () => void
  seedNativeChatLaunchDraft: () => void
  setTabViewMode: () => void
  tabsByWorktree: Record<string, { id: string; launchAgent?: string }[]>
  unifiedTabsByWorktree: Record<string, unknown>
}

const store: TestStore = {
  settings: { activeRuntimeEnvironmentId: null },
  activeView: 'terminal',
  activePendingCreationId: 'creation-1',
  repos: [{ id: 'repo-1', connectionId: null }],
  pendingWorktreeCreations: {},
  beginPendingWorktreeCreation: vi.fn((entry: PendingWorktreeCreation) => {
    store.pendingWorktreeCreations[entry.creationId] = entry
    store.activePendingCreationId = entry.creationId
  }),
  updatePendingWorktreeCreation: vi.fn(
    (creationId: string, patch: Partial<PendingWorktreeCreation>) => {
      const entry = store.pendingWorktreeCreations[creationId]
      if (entry) {
        store.pendingWorktreeCreations[creationId] = { ...entry, ...patch }
      }
    }
  ),
  removePendingWorktreeCreation: vi.fn((creationId: string) => {
    delete store.pendingWorktreeCreations[creationId]
  }),
  updateWorktreeMeta: vi.fn(),
  setActivePendingWorktreeCreation: vi.fn(),
  setActiveView: vi.fn(),
  setSidebarOpen: vi.fn(),
  createWorktree: vi.fn(() => new Promise<TestCreateWorktreeResult>(() => {})),
  setupProjectExistingFolder: vi.fn(),
  refreshRuntimeEnvironmentStatus: vi.fn(),
  seedNativeChatLaunchDraft: vi.fn(),
  setTabViewMode: vi.fn(),
  tabsByWorktree: {},
  unifiedTabsByWorktree: {}
}

vi.mock('@/store', () => ({
  useAppStore: { getState: () => store }
}))

vi.mock('@/lib/browser-uuid', () => ({
  createBrowserUuid: () => 'creation-1'
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: vi.fn(() => false)
}))

vi.mock('@/lib/worktree-initial-terminal-seeding', () => ({
  ensureWorktreeHasInitialTerminal: vi.fn()
}))

vi.mock('@/lib/workspace-activation-terminal-focus', () => ({
  queueWorkspaceActivationTerminalFocus: vi.fn()
}))

vi.mock('@/lib/new-workspace', () => ({
  ensureAgentStartupInTerminal: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn() }
}))

vi.mock('@/lib/ephemeral-vm-workspace-target', () => ({
  prepareEphemeralVmWorkspaceTarget: vi.fn()
}))

vi.mock('@/lib/beads-worktree-auto-claim', () => ({
  autoClaimBeadsWorktree: autoClaimBeadsWorktreeMock
}))

import { continueBackgroundWorktreeCreation } from './worktree-creation-flow'

function makeRequest(overrides: Partial<WorktreeCreationRequest> = {}): WorktreeCreationRequest {
  return {
    repoId: 'repo-1',
    name: 'feature',
    setupDecision: 'inherit',
    agent: null,
    pendingFirstAgentMessageRename: false,
    note: '',
    startupPlan: null,
    quickPrompt: '',
    quickTelemetry: null,
    ...overrides
  }
}

function makePendingCreation(request: WorktreeCreationRequest): PendingWorktreeCreation {
  return {
    creationId: 'creation-1',
    phase: 'preparing',
    status: 'creating',
    startedAt: 1,
    indeterminate: false,
    loaderVisible: true,
    request
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  store.settings.activeRuntimeEnvironmentId = null
  store.activeView = 'terminal'
  store.activePendingCreationId = 'creation-1'
  store.repos = [{ id: 'repo-1', connectionId: null }]
  store.pendingWorktreeCreations = { 'creation-1': makePendingCreation(makeRequest()) }
  store.createWorktree.mockImplementation(() => new Promise<TestCreateWorktreeResult>(() => {}))
  store.tabsByWorktree = {}
  store.unifiedTabsByWorktree = {}
})

describe('worktree creation auto-claim wiring', () => {
  it('auto-claims the linked bead once a beads-linked worktree is created', async () => {
    const linkedWorkItem: WorkspaceLinkedItem = {
      provider: 'beads',
      type: 'issue',
      number: 0,
      title: 'cwf.3 Wire up auto-claim',
      url: 'bd://cwf.3',
      beadsIdentifier: 'cwf.3',
      repoId: 'repo-1'
    }
    store.createWorktree.mockResolvedValueOnce({
      worktree: { id: 'wt-1', repoId: 'repo-1', linkedWorkItem }
    })

    const started = continueBackgroundWorktreeCreation(
      'creation-1',
      makeRequest({ linkedWorkItem }),
      { revealCreationSurface: false }
    )

    expect(started).toBe(true)
    await vi.waitFor(() =>
      expect(autoClaimBeadsWorktreeMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'wt-1', repoId: 'repo-1', linkedWorkItem })
      )
    )
  })
})
