# Beads M2 — Read UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Beads tab on Orca's Tasks page: bd setup states, presets and filters, tree and flat issue lists, a resizable split-pane detail view with blockers and a mini dependency graph, and change-token polling — read-only.

**Architecture:** Beads is added as a fifth `TaskProvider`, but its page body is a self-contained `TaskPageBeadsContent` that reads only `selectedRepos`/`primaryRepo`/`hideTaskSource` from the existing 39-stage task-page model, instead of adding stages to that chain. Data flows through a renderer runtime client (IPC for local/SSH repos, RPC for runtime-owned repos) into a `beads` store slice keyed by repo id; pure model modules (request builder, tree rows, keyboard resolver) are unit-tested separately from the React components.

**Tech Stack:** React 19, Zustand store slices, Tailwind v4 tokens + shadcn primitives, `@tanstack/react-virtual`, Vitest + happy-dom + Testing Library. No Playwright spec in M2 — spec §11 puts the beads e2e in M3, where Start worktree makes the flow worth driving end to end.

**Spec:** `docs/superpowers/specs/2026-09-15-beads-task-source-design.md` (§3.3, §4.1, §4.2 read parts, §4.3 settings card, §6). Backend from M1 is on branch `beads`: `window.api.beads.*` (`src/preload/api/beads-api.ts`), `beads.*` RPC, contract types in `src/shared/beads/beads-contract.ts` and `src/shared/beads/beads-issue-types.ts`.

**Beads issue:** `orca-q11.3` — claim before starting (`bd update orca-q11.3 --claim`), close in the last task.

## Global Constraints

- Read-only milestone: no write calls (`createIssue`, `updateIssue`, `claimIssue`, …) anywhere in M2 code.
- Deferred on purpose (do not build): board view (M4, needs drag-to-change-status), assignee "me" and the `beads.actor` setting (M3, needed for claim), Start worktree (M3), linked-worktree badges in the detail pane (M3, needs the linked-item union), nav-history / deep links for an open bead (M3), poll-interval settings (fixed values below).
- `openIssueId`, `currentKey` and `query` live in `useBeadsPageState` as component state. M3 moves the open bead into `taskPageData` (`src/renderer/src/store/slices/ui/ui-slice-contract-core.ts:65` holds `openJiraIssue?: JiraIssue`, written by `openTaskPage` in `ui-slice-task-actions.ts:57-89`) so deep links, back/forward and "return here after Start worktree" work — the same milestone that adds the nav-history entry, which is what makes the store field worth having. Do not add the field in M2: nothing would write it.
- Also deferred, and these are spec items M2 deliberately does not deliver — say so when handing off:
  - **Preset counts** (spec §4.1 "Each preset shows a count"): M1 ships `countIssues` (`bd count`, ~20 ms), but `buildCountArgs` cannot express the `ready` and `blocked` views, so two of the five presets would need a full list call anyway — five extra calls per repo per change token for a number nobody acts on. M4 adds counts together with the board's per-column counts, once the backend can count a view. M2 renders the preset buttons without counts.
  - **The Tasks-settings card rows** "bd version and status" and "per-repo beads availability" (spec §4.3): M2 shows version and state inside the per-repo `BeadsSetupCard` on the Beads tab itself, where the user is when it matters; the global settings card keeps the static install/initialize steps plus the show-in-Tasks toggle. Moving those rows into settings is M3, with the actor setting.
  - **Gates and the merge-slot holder** in the blocked callout (spec §4.2): `BeadsIssueDetails` from M1 carries `blockedBy` and dependency edges only — there is no gate or merge-slot data in the contract, and adding it means new bd commands. M2's callout lists open blockers; gates arrive with the write milestone (M4).
- Poll the change token every **5 000 ms** while the window is visible and every **60 000 ms** while hidden.
- List page size **200**; "Load more" re-requests with `limit + 200`, capped at **2000** (`BEADS_LIST_PAGE_SIZE`, `BEADS_LIST_MAX_LIMIT` from `beads-contract.ts`).
- Tree index request: `{ view: 'list', filter: { includeClosed: true }, limit: 2000 }` — one per repo per change token.
- Split pane: list width default **460 px**, min **320**, max **720**; below a container width of **880 px** the detail opens in a right `Sheet` instead.
- Every IPC call passes `{ repoPath: repo.path, repoId: repo.id }` (M1 made `repoId` required). RPC calls pass `{ repo: repo.id }`.
- Design system (`docs/STYLEGUIDE.md`): tokens only, no raw palette colors (`emerald-500`, `amber-*`, `white/14`…); `components/ui` primitives take layout-only `className` (`shadcn/no-restyle`); list rows idle transparent, hover `bg-accent`, current row `bg-accent` + `data-current="true"`; 13 px dense rows, 12 px sub-text, mono for IDs; lucide icons `size-3`/`size-3.5`; `scrollbar-sleek` on overflow containers; no hard-coded `metaKey`.
- Every user-visible string goes through `translate('auto.components.task-page.beads.<name>', 'English')` (never at module top level; use functions or `createLocalizedCatalog`). After adding strings run `pnpm sync:localization-catalog` and `pnpm sync:localization-runtime-catalog`. Only `en.json` must contain new keys — `verify-localization-catalog.mjs` checks en only, and the other five locales are filled by the translation pipeline, not by this milestone. Say so in the hand-off (the bead's description says "i18n in 6 locales").
- File limits: `.ts` ≤ 300 lines, `.tsx` ≤ 400 lines (blank lines and comments excluded); never add a `max-lines` disable.
- Component tests start with `// @vitest-environment happy-dom` and import `'@testing-library/jest-dom/vitest'`.
- Import a type and values from the same module in one statement with inline `type`. Every `as` needs `// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: …` directly above it; `as const` is fine.
- No new `// @ts-nocheck`. No repo-wide `pnpm format` — format only changed files (`pnpm exec oxfmt <files>`).
- Machine has 8 GB RAM: run only the named test files, never the whole suite; the fork CI runs everything on push.
- **Implementers never run `pnpm tc` or `pnpm lint`.** Both take longer than the 600 s subagent stall watchdog on this machine, which kills the agent mid-run (it happened on Task 1). The controller runs them between tasks and hands the error list back as a file. Implementers run only the scoped test paths their task names, one command at a time, each with an explicit 300000 ms timeout.
- Commit trailers, exactly:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016WpdEv8mKGKnbFSPk884i5
  ```

## File structure

```
src/shared/task-providers.ts                         + 'beads' (Task 1)
src/renderer/src/components/icons/BeadsIcon.tsx      monochrome provider icon (Task 1)
src/renderer/src/lib/window-visibility-timeout-poller.ts   + hiddenDelayMs option (Task 2)
src/renderer/src/runtime/runtime-beads-client.ts     IPC/RPC routing for beads reads (Task 3)
src/renderer/src/store/slices/
  beads-slice-contract.ts                            slice types (Task 4)
  beads-load-state.ts                                load-state helpers (Task 4)
  beads.ts                                           slice creator + read actions (Task 4)
src/renderer/src/components/task-page/beads/
  beads-list-request.ts                              presets, filter support, request builder (Task 5)
  beads-tree-rows.ts                                 tree/flat row model (Task 6)
  beads-list-keyboard.ts                             keyboard resolver (Task 7)
  beads-status-visuals.ts                            status category → icon + tone classes (Task 8)
  BeadsIssueRow.tsx, BeadsListPane.tsx               rows + virtualized list (Task 8)
  BeadsFiltersBar.tsx                                presets, filters, search, mode toggle (Task 9)
  beads-detail-relations.ts                          blockers/parent/dependents grouping (Task 10)
  BeadsDetailPane.tsx, BeadsDetailSections.tsx       detail view (Task 10)
  BeadsSetupCard.tsx                                 bd setup / error states (Task 11)
  BeadsSplitLayout.tsx                               resizable split or drawer (Task 11)
  use-beads-page-state.ts                            page UI state + effects (Task 12)
  Content.tsx                                        TaskPageBeadsContent container (Task 12)
src/renderer/src/components/task-page/Content.tsx    + beads branch (Task 12)
```

---

### Task 1: Add `beads` as a task provider

Mechanical but wide: adding a member to the `TaskProvider` union breaks every exhaustive switch and `Record<TaskProvider, …>`. Fix each site with the decision listed below — do not invent other behavior.

**Files:**
- Modify: `src/shared/task-providers.ts` (lines 1, 3, 93-109)
- Modify: `src/shared/task-providers.test.ts:19`
- Modify: `src/shared/task-provider-identity.ts` (identity union 5-36; switches ~49-82, ~96-115; record ~118-123; cache part ~151-160)
- Modify: `src/shared/task-source-context.ts` (`normalizeTaskProvider` ~205-216)
- Modify: `src/shared/rpc-contract/automation-params.ts` (identity discriminated union ~66-103; `provider: z.enum([...])` ~111)
- Modify: `src/renderer/src/components/task-page-list-chrome-visibility.ts` and its caller `src/renderer/src/components/use-task-page-composer-actions.ts` (~231-239)
- Modify: `src/renderer/src/components/task-source-context-summary.ts` (switches ~48-67, ~189-201)
- Modify: `src/renderer/src/components/automations/automation-target-availability.ts` (~254-265)
- Modify: `src/renderer/src/components/automations/automation-source-display.ts` (~34-45, ~52-62)
- Modify: `src/renderer/src/components/settings/TasksPane.tsx` (`PROVIDER_META` ~36-92; setup body ~216-246)
- Modify: `src/renderer/src/components/settings/TaskSourceSimpleSetup.tsx` (add `BeadsSetupSteps`)
- Modify: `src/renderer/src/components/settings/use-task-source-provider-readiness.ts` (~68-93)
- Modify: `src/renderer/src/components/task-page-localized-options.tsx` (`getSourceOptions` ~114-135)
- Modify: settings migration in `src/shared/global-settings-types.ts` (~354-358), `src/shared/default-global-settings.ts` (~198), `src/main/persistence/loading-store/prepare-loaded-profile-settings.ts` (~96-127), `src/main/persistence/loading-store/normalize-loaded-global-settings.ts` (~119), `src/main/persistence/applying-settings/settings-update.ts` (~154)
- Create: `src/renderer/src/components/icons/BeadsIcon.tsx`
- Test: `src/shared/task-providers.test.ts`, plus any existing tests for the files above that pin provider lists

**Interfaces:**
- Produces: `TaskProvider` includes `'beads'`; `TASK_PROVIDERS` = `['github', 'gitlab', 'linear', 'jira', 'beads']`; `BeadsIcon({ className?: string }): React.JSX.Element`; source option `{ id: 'beads', label: 'Beads', Icon: BeadsIcon }`; `GlobalSettings.visibleTaskProvidersDefaultedForBeads: boolean`; `BeadsTaskProviderIdentity = { provider: 'beads' }`; `BeadsSetupSteps` component.

- [ ] **Step 1: Write the failing test**

In `src/shared/task-providers.test.ts`, change the expectation at line 19 to `['github', 'gitlab', 'linear', 'jira', 'beads']`, and add:
```ts
import { filterAvailableTaskProviders } from './task-providers'

describe('beads availability', () => {
  it('keeps beads available without a linear connection so its setup card stays reachable', () => {
    expect(
      filterAvailableTaskProviders(['beads'], { gitlabInstalled: false, linearConnected: false })
    ).toEqual(['beads'])
  })
})
```
(If `filterAvailableTaskProviders` is already imported in that file, merge the import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/shared/task-providers.test.ts`
Expected: FAIL — list expectation and the beads availability case (`['github']` returned).

- [ ] **Step 3: Update `task-providers.ts`**

```ts
export type TaskProvider = 'github' | 'gitlab' | 'linear' | 'jira' | 'beads'

export const TASK_PROVIDERS: readonly TaskProvider[] = ['github', 'gitlab', 'linear', 'jira', 'beads']
```
and in `isTaskProviderAvailable`, before the final `return availability.linearConnected`:
```ts
  // Why: Beads availability is per repository (bd install, bd init), which the
  // Tasks tab reports itself; hiding the tab would remove that setup entry point.
  if (provider === 'beads') {
    return true
  }
```

- [ ] **Step 4: Fix the compile sites (exact decisions)**

Run `pnpm tc` and fix every error with these decisions:

1. `task-provider-identity.ts`: add `export type BeadsTaskProviderIdentity = { provider: 'beads' }` to the `TaskProviderIdentity` union. In `normalizeTaskProviderIdentity` add `case 'beads': return { provider: 'beads' }`. In `isStoredTaskProviderIdentity` add `case 'beads': return true`. In `TASK_PROVIDER_IDENTITY_FIELDS` add `beads: []`. In `taskProviderIdentityCachePart` add `case 'beads': return ''` — every other case joins identity fields, and a beads identity has none, so the empty string the `!identity` guard already returns is the honest value.
2. `task-source-context.ts` `normalizeTaskProvider`: add `case 'beads':` to the list that returns `value`.
3. `automation-params.ts`: add `z.object({ provider: z.literal('beads') }).passthrough()` as a member of the identity discriminated union (mirror the Jira member's style), and add `'beads'` to the `provider: z.enum([...])`. Then run `pnpm run generate:rpc-params-catalog` and commit the generated catalog if it changes.
4. `task-page-list-chrome-visibility.ts`: add `hasBeadsDetail: boolean` to the state type and destructuring, and `case 'beads': return hasBeadsDetail`. In `use-task-page-composer-actions.ts` pass `hasBeadsDetail: false` (Beads detail lives inside its own content; list chrome stays visible).
5. `task-source-context-summary.ts`: in `getTaskSourceContextSummary` add `case 'beads':` to the branch that calls `getRepoBackedTaskSourceSummary(args)` (Beads is repo-scoped like GitHub/GitLab). In `getProviderIdentityLabel` add `case 'beads': return null` (or the same "no label" value the function uses for providers without an identity label).
6. `automation-target-availability.ts` `getAutomationSourceProviderLabel` and `automation-source-display.ts` `getProviderLabel`: add `case 'beads': return 'Beads'`. Both switches return bare brand literals (`'GitHub'`, `'Jira'`) — do not introduce `translate()` in these two functions; a product name is not translated, and mixing the two styles in one switch is worse than either. In the identity switch of `automation-source-display.ts` add `case 'beads': return null` (same "no detail" value as the other identity-less path).
7. `TasksPane.tsx` `PROVIDER_META`: add
   ```tsx
   beads: {
     get label() {
       return translate('auto.components.task-page.beads.providerLabel', 'Beads')
     },
     get description() {
       return translate(
         'auto.components.settings.TasksPane.beadsDescription',
         'Local issues tracked with bd in each repository.'
       )
     },
     Icon: BeadsIcon
   }
   ```
   (match the exact getter/object shape the other entries use). In the setup-body conditional add a branch `provider === 'beads' ? (<BeadsSetupSteps visible={visible} canHide={canHide} onToggleVisible={() => toggleProvider('beads')} />)` before the final fallback.
8. `TaskSourceSimpleSetup.tsx`: add `BeadsSetupSteps`, built from the same pieces `JiraSetupSteps` uses (`TaskSourceStepRow` + `TaskSourceShowInTasksStep`): one informational step row titled `translate('auto.components.settings.TaskSourceSimpleSetup.beadsInstallTitle', 'Install bd 1.2.0 or newer')` with description `translate('auto.components.settings.TaskSourceSimpleSetup.beadsInstallDescription', 'Each repository needs bd initialized (bd init). The Beads tab checks this per repository.')`, marked complete-agnostic (use the same "neutral" status the step row supports; if it only supports done/pending, render it as pending without an action), followed by `TaskSourceShowInTasksStep` wired to `visible`/`canHide`/`onToggleVisible` exactly like Jira's.
9. `use-task-source-provider-readiness.ts`: add `beads: { connected: true, checking: false, visible: visible.has('beads') }` with a `// Why:` comment that readiness is per repository and shown on the Tasks tab.
10. `task-page-localized-options.tsx` `getSourceOptions`: append
    ```tsx
    {
      id: 'beads',
      label: translate('auto.components.task-page.beads.providerLabel', 'Beads'),
      Icon: ({ className }) => <BeadsIcon className={className} />
    }
    ```
11. Settings migration (visible by default once, like Jira): add `visibleTaskProvidersDefaultedForBeads: boolean` next to `visibleTaskProvidersDefaultedForJira` in `global-settings-types.ts`; default `true` in `default-global-settings.ts`; in `prepare-loaded-profile-settings.ts` add a second step after the Jira migration that appends `'beads'` when `parsed.settings?.visibleTaskProvidersDefaultedForBeads !== true` and it is missing, sets the flag, and calls `markNeedsSave()` under the same condition the Jira flag uses; mirror the flag handling in `normalize-loaded-global-settings.ts` and `settings-update.ts` exactly where `visibleTaskProvidersDefaultedForJira` is handled. Extend the existing tests of those files that cover the Jira migration with the equivalent Beads case (profile without the flag gets `'beads'` appended once; profile with the flag and without `'beads'` is left alone).
12. `use-task-page-source-summary.ts:38` (`Partial<Record<TaskProvider, TaskSourceAvailabilityNotice>>`): beads needs no availability notice — the Beads tab reports setup itself — so leave the partial record without a `beads` key unless `pnpm tc` demands one. Then anything else `pnpm tc` reports for the `TaskProvider` union (`task-source-setup-state.ts`, `use-task-source-provider-readiness.ts` and their tests all hold full `Record<TaskProvider, TaskProviderReadiness>` maps): add a `beads` entry that follows the Jira/GitLab entry closest in meaning, and list each such site in your report.

Do **not** touch the linked-item unions (`WorkspaceLinkedItem`, `new-workspace/*`, composer state, nav history, mobile) — those are M3.

- [ ] **Step 5: Add the icon**

`src/renderer/src/components/icons/BeadsIcon.tsx`:
```tsx
export function BeadsIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      {/* Why: a monochrome chain of beads, matching Orca's single-color provider icons. */}
      <circle cx="5" cy="12" r="3" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="19" cy="12" r="3" />
      <rect x="7.5" y="11.25" width="2" height="1.5" rx="0.75" />
      <rect x="14.5" y="11.25" width="2" height="1.5" rx="0.75" />
    </svg>
  )
}
```

- [ ] **Step 6: Verify**

Run:
```bash
pnpm tc
pnpm test src/shared/task-providers.test.ts src/shared/task-provider-identity src/shared/task-source-context src/main/persistence/loading-store src/main/persistence/applying-settings src/renderer/src/components/settings src/renderer/src/components/automations src/renderer/src/components/task-page-list-chrome-visibility
pnpm sync:localization-catalog
pnpm sync:localization-runtime-catalog
pnpm run verify:rpc-params-catalog
pnpm exec oxlint <changed files>
```
Expected: typecheck clean; tests PASS (update only expectations that pin the provider list or migration outputs); catalogs synced. If a test path above does not exist, skip it and say so.

- [ ] **Step 7: Commit**

```bash
git add -A src/shared src/main/persistence src/renderer/src/components src/renderer/src/i18n src/shared/rpc-contract
git status --short   # confirm only the files from this task
git commit -m "feat(beads): add beads as a task provider

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_016WpdEv8mKGKnbFSPk884i5"
```

---

### Task 2: Keep polling while hidden (slower)

**Files:**
- Modify: `src/renderer/src/lib/window-visibility-timeout-poller.ts`
- Test: `src/renderer/src/lib/window-visibility-timeout-poller.test.ts`

**Interfaces:**
- Produces: `installWindowVisibilityTimeoutPoller(args: { run; getDelayMs; hiddenDelayMs?: number; setTimeoutFn?; clearTimeoutFn? }): () => void`. Without `hiddenDelayMs` behavior is unchanged (pauses while hidden). With it, the poller keeps running while hidden at that delay and returns to `getDelayMs()` when visible, running immediately on becoming visible.

- [ ] **Step 1: Write the failing test**

Append to `window-visibility-timeout-poller.test.ts` (inside the existing `describe`):
```ts
  it('keeps polling at hiddenDelayMs while hidden when that option is set', async () => {
    let visibilityState: DocumentVisibilityState = 'hidden'
    const run = vi.fn().mockResolvedValue(undefined)
    const setTimeoutMock = vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>)

    vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('document', {
      get visibilityState() {
        return visibilityState
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })

    const cleanup = installWindowVisibilityTimeoutPoller({
      run,
      getDelayMs: () => 5000,
      hiddenDelayMs: 60_000,
      setTimeoutFn: setTimeoutMock,
      clearTimeoutFn: vi.fn()
    })

    expect(run).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    await Promise.resolve()
    expect(setTimeoutMock).toHaveBeenLastCalledWith(expect.any(Function), 60_000)

    visibilityState = 'visible'
    const scheduled = setTimeoutMock.mock.calls.at(-1)?.[0] as () => void
    scheduled()
    await Promise.resolve()
    await Promise.resolve()
    expect(run).toHaveBeenCalledTimes(2)
    expect(setTimeoutMock).toHaveBeenLastCalledWith(expect.any(Function), 5000)
    cleanup()
  })
```
The `as () => void` and `as unknown as` casts in this test follow the existing file's style; add the `oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test timer handle and captured scheduled callback` line above each new cast.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/lib/window-visibility-timeout-poller.test.ts`
Expected: FAIL — `run` is not called while hidden (called 0 times).

- [ ] **Step 3: Implement**

Change the args type and three places:
```ts
export function installWindowVisibilityTimeoutPoller(args: {
  run: () => Promise<void> | void
  getDelayMs: () => number
  /** When set, keep polling while hidden at this delay instead of pausing. */
  hiddenDelayMs?: number
  setTimeoutFn?: (callback: () => void, delayMs: number) => WindowVisibilityTimeoutPollerTimer
  clearTimeoutFn?: (handle: WindowVisibilityTimeoutPollerTimer) => void
}): () => void {
```
add after the `inFlight` declaration:
```ts
  const pollsWhileHidden = args.hiddenDelayMs !== undefined
  const canPoll = (): boolean => pollsWhileHidden || isWindowVisible()
  const nextDelayMs = (): number =>
    isWindowVisible() ? args.getDelayMs() : (args.hiddenDelayMs ?? args.getDelayMs())
```
in `schedulePoll` replace `if (disposed || !isWindowVisible())` with `if (disposed || !canPoll())` and `args.getDelayMs()` with `nextDelayMs()`; in `runAndSchedule` replace `!isWindowVisible()` with `!canPoll()`; and in `reconcileVisibility` replace the `else` branch with:
```ts
    } else if (pollsWhileHidden) {
      schedulePoll()
    } else {
      clearScheduledPoll()
    }
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/renderer/src/lib/window-visibility-timeout-poller.test.ts`
Expected: PASS (all existing cases plus the new one).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/window-visibility-timeout-poller.ts src/renderer/src/lib/window-visibility-timeout-poller.test.ts
git commit -m "feat(beads): let the visibility poller keep a slow cadence while hidden"
```

---

### Task 3: Renderer runtime client for beads reads

**Files:**
- Create: `src/renderer/src/runtime/runtime-beads-client.ts`
- Test: `src/renderer/src/runtime/runtime-beads-client.test.ts`

**Interfaces:**
- Consumes: `window.api.beads.getStatus/getSchema/getChangeToken/listIssues/getIssueDetails` (args `BeadsRepoArgs = { repoPath: string; repoId: string }`, returning `Promise<BeadsResult<T>>`); RPC methods `beads.getStatus`, `beads.getSchema`, `beads.getChangeToken`, `beads.listIssues` (params `{ repo, request }`), `beads.getIssueDetails` (params `{ repo, id }`); `callRuntimeRpc<T>(target, method, params, { timeoutMs })` and `runtimeEnvironmentSupportsCapability(environmentId, capability, timeoutMs): Promise<boolean>` from `./runtime-rpc-client`; `getActiveRuntimeTarget`, `runtimeTargetForExecutionHostId`, `RuntimeClientTarget` from `./runtime-client-target`; `getRepoExecutionHostId(repo)` from `../../../shared/execution-host`; `BEADS_TASK_SOURCE_RUNTIME_CAPABILITY` from `../../../shared/protocol-version`.
- Produces:
  - `type BeadsRepoRef = Pick<Repo, 'id' | 'path' | 'connectionId' | 'executionHostId'>`
  - `type BeadsRuntimeSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined`
  - `getBeadsRuntimeTarget(settings: BeadsRuntimeSettings, repo: BeadsRepoRef): RuntimeClientTarget`
  - `beadsGetStatus(settings, repo): Promise<BeadsResult<BeadsWorkspaceStatus>>`
  - `beadsGetSchema(settings, repo): Promise<BeadsResult<BeadsSchema>>`
  - `beadsGetChangeToken(settings, repo): Promise<BeadsResult<string>>`
  - `beadsListIssues(settings, repo, request: BeadsListRequest): Promise<BeadsResult<BeadsIssuePage>>`
  - `beadsGetIssueDetails(settings, repo, id: string): Promise<BeadsResult<BeadsIssueDetails>>`
  - None of these throw: transport failures become `{ ok: false, error }`.

- [ ] **Step 1: Write the failing test**

`src/renderer/src/runtime/runtime-beads-client.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  runtimeEnvironmentSupportsCapability: vi.fn()
}))

vi.mock('./runtime-rpc-client', () => ({
  callRuntimeRpc: mocks.callRuntimeRpc,
  runtimeEnvironmentSupportsCapability: mocks.runtimeEnvironmentSupportsCapability,
  // The real class lives in runtime-rpc-result and is re-exported; the mock needs its
  // own so `instanceof` still classifies (same shape as remote-agent-session-launch.test.ts).
  RuntimeRpcCallError: class RuntimeRpcCallError extends Error {
    code: string
    constructor(response: { id: string; ok: false; error: { code: string; message: string } }) {
      super(response.error.message)
      this.code = response.error.code
    }
  }
}))

import { RuntimeRpcCallError } from './runtime-rpc-client'

import {
  beadsGetIssueDetails,
  beadsGetStatus,
  beadsListIssues,
  getBeadsRuntimeTarget,
  type BeadsRepoRef
} from './runtime-beads-client'

// Why: annotate, don't infer — `Repo.executionHostId` is `'local' | `ssh:${string}` |
// `runtime:${string}` | null`, and a bare object literal widens it to `string`, which
// `pnpm tc` rejects (config/tsconfig.tc.web.json type-checks tests too).
const LOCAL_REPO: BeadsRepoRef = {
  id: 'r1',
  path: '/work/app',
  connectionId: null,
  executionHostId: null
}
const RUNTIME_REPO: BeadsRepoRef = {
  id: 'r2',
  path: '/srv/app',
  connectionId: null,
  executionHostId: 'runtime:env-1'
}
const SSH_REPO: BeadsRepoRef = {
  id: 'r3',
  path: '/srv/ssh',
  connectionId: 'ssh-1',
  executionHostId: null
}

const beadsApi = {
  getStatus: vi.fn(),
  getSchema: vi.fn(),
  getChangeToken: vi.fn(),
  listIssues: vi.fn(),
  getIssueDetails: vi.fn()
}

beforeEach(() => {
  vi.stubGlobal('window', { api: { beads: beadsApi } })
  mocks.runtimeEnvironmentSupportsCapability.mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('getBeadsRuntimeTarget', () => {
  it('routes runtime-owned repos to that runtime and everything else to the active target', () => {
    expect(getBeadsRuntimeTarget(null, RUNTIME_REPO)).toEqual({
      kind: 'environment',
      environmentId: 'env-1'
    })
    expect(getBeadsRuntimeTarget(null, LOCAL_REPO)).toEqual({ kind: 'local' })
    expect(getBeadsRuntimeTarget(null, SSH_REPO)).toEqual({ kind: 'local' })
    expect(getBeadsRuntimeTarget({ activeRuntimeEnvironmentId: 'env-9' }, LOCAL_REPO)).toEqual({
      kind: 'environment',
      environmentId: 'env-9'
    })
  })
})

describe('beads runtime client', () => {
  it('uses IPC with repoPath and repoId for local and SSH repos', async () => {
    beadsApi.getStatus.mockResolvedValue({ ok: true, value: { initialized: true } })
    await expect(beadsGetStatus(null, SSH_REPO)).resolves.toEqual({
      ok: true,
      value: { initialized: true }
    })
    expect(beadsApi.getStatus).toHaveBeenCalledWith({ repoPath: '/srv/ssh', repoId: 'r3' })
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('uses RPC with the repo id for runtime-owned repos', async () => {
    const request = { view: 'ready' as const, filter: {}, limit: 200 }
    mocks.callRuntimeRpc.mockResolvedValue({ ok: true, value: { issues: [], hasMore: false } })
    await beadsListIssues(null, RUNTIME_REPO, request)
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-1' },
      'beads.listIssues',
      { repo: 'r2', request },
      { timeoutMs: 45_000 }
    )
  })

  it('reports an outdated runtime instead of calling it', async () => {
    mocks.runtimeEnvironmentSupportsCapability.mockResolvedValue(false)
    const result = await beadsGetIssueDetails(null, RUNTIME_REPO, 'p-1')
    expect(result.ok).toBe(false)
    expect(mocks.callRuntimeRpc).not.toHaveBeenCalled()
  })

  it('turns transport errors into failures instead of throwing', async () => {
    beadsApi.getIssueDetails.mockRejectedValue(new Error('No handler registered'))
    await expect(beadsGetIssueDetails(null, LOCAL_REPO, 'p-1')).resolves.toEqual({
      ok: false,
      error: { kind: 'failed', message: 'No handler registered' }
    })
    mocks.callRuntimeRpc.mockRejectedValue(new Error('socket closed'))
    await expect(beadsGetStatus(null, RUNTIME_REPO)).resolves.toMatchObject({
      ok: false,
      error: { kind: 'host-offline' }
    })
  })

  it('reports a refused RPC as failed, not as an offline host', async () => {
    mocks.callRuntimeRpc.mockRejectedValue(
      // RuntimeRpcFailure needs id and ok:false — the imported symbol carries the real
      // constructor's type even though the module is mocked at runtime.
      new RuntimeRpcCallError({
        id: 'rpc-1',
        ok: false,
        error: { code: 'forbidden', message: 'scope does not allow beads.getStatus' }
      })
    )
    await expect(beadsGetStatus(null, RUNTIME_REPO)).resolves.toEqual({
      ok: false,
      error: { kind: 'failed', message: 'scope does not allow beads.getStatus' }
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/runtime/runtime-beads-client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/renderer/src/runtime/runtime-beads-client.ts`:
```ts
import type {
  BeadsIssuePage,
  BeadsListRequest,
  BeadsRepoArgs,
  BeadsResult
} from '../../../shared/beads/beads-contract'
import type {
  BeadsIssueDetails,
  BeadsSchema,
  BeadsWorkspaceStatus
} from '../../../shared/beads/beads-issue-types'
import { getRepoExecutionHostId } from '../../../shared/execution-host'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import { BEADS_TASK_SOURCE_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import type { Repo } from '../../../shared/repo-types'
import { translate } from '@/i18n/i18n'
import {
  getActiveRuntimeTarget,
  runtimeTargetForExecutionHostId,
  type RuntimeClientTarget
} from './runtime-client-target'
import {
  callRuntimeRpc,
  RuntimeRpcCallError,
  runtimeEnvironmentSupportsCapability
} from './runtime-rpc-client'

const BEADS_RPC_TIMEOUT_MS = 45_000
const CAPABILITY_TIMEOUT_MS = 30_000

export type BeadsRepoRef = Pick<Repo, 'id' | 'path' | 'connectionId' | 'executionHostId'>
export type BeadsRuntimeSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined

export function getBeadsRuntimeTarget(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef
): RuntimeClientTarget {
  const hostTarget = runtimeTargetForExecutionHostId(getRepoExecutionHostId(repo))
  // Why: runtime-owned repos run bd on that runtime; local and SSH repos go through
  // this app's main process (which routes SSH itself) unless this renderer is a
  // client of a runtime.
  if (hostTarget?.kind === 'environment') {
    return hostTarget
  }
  return getActiveRuntimeTarget(settings)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function callBeads<T>(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef,
  method: string,
  rpcParams: Record<string, unknown>,
  callLocal: (args: BeadsRepoArgs) => Promise<BeadsResult<T>>
): Promise<BeadsResult<T>> {
  const target = getBeadsRuntimeTarget(settings, repo)
  if (target.kind === 'local') {
    try {
      return await callLocal({ repoPath: repo.path, repoId: repo.id })
    } catch (error) {
      return { ok: false, error: { kind: 'failed', message: errorMessage(error) } }
    }
  }
  const supported = await runtimeEnvironmentSupportsCapability(
    target.environmentId,
    BEADS_TASK_SOURCE_RUNTIME_CAPABILITY,
    CAPABILITY_TIMEOUT_MS
  )
  if (!supported) {
    return {
      ok: false,
      error: {
        kind: 'failed',
        message: translate(
          'auto.components.task-page.beads.runtimeUpdateRequired',
          'Update the Orca runtime on this host to use Beads.'
        )
      }
    }
  }
  try {
    return await callRuntimeRpc<BeadsResult<T>>(
      target,
      `beads.${method}`,
      { repo: repo.id, ...rpcParams },
      { timeoutMs: BEADS_RPC_TIMEOUT_MS }
    )
  } catch (error) {
    // Why: only a dead connection is 'host-offline'. A rejected param schema or a
    // mobile-scope 'forbidden' is a real failure, and calling it offline sends the
    // user to check their network for a bug in our own call.
    return { ok: false, error: { kind: rpcErrorKind(error), message: errorMessage(error) } }
  }
}

// Why: a RuntimeRpcCallError means the host answered and refused (invalid_argument,
// forbidden, operation_unknown, runtime_error…). Anything else — timeout, closed
// socket, no pairing — never reached it.
function rpcErrorKind(error: unknown): 'host-offline' | 'failed' {
  return error instanceof RuntimeRpcCallError ? 'failed' : 'host-offline'
}

export function beadsGetStatus(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef
): Promise<BeadsResult<BeadsWorkspaceStatus>> {
  return callBeads(settings, repo, 'getStatus', {}, (args) => window.api.beads.getStatus(args))
}

export function beadsGetSchema(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef
): Promise<BeadsResult<BeadsSchema>> {
  return callBeads(settings, repo, 'getSchema', {}, (args) => window.api.beads.getSchema(args))
}

export function beadsGetChangeToken(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef
): Promise<BeadsResult<string>> {
  return callBeads(settings, repo, 'getChangeToken', {}, (args) =>
    window.api.beads.getChangeToken(args)
  )
}

export function beadsListIssues(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef,
  request: BeadsListRequest
): Promise<BeadsResult<BeadsIssuePage>> {
  return callBeads(settings, repo, 'listIssues', { request }, (args) =>
    window.api.beads.listIssues({ ...args, request })
  )
}

export function beadsGetIssueDetails(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef,
  id: string
): Promise<BeadsResult<BeadsIssueDetails>> {
  return callBeads(settings, repo, 'getIssueDetails', { id }, (args) =>
    window.api.beads.getIssueDetails({ ...args, id })
  )
}
```

If `window.api.beads` is typed as possibly undefined in the web preload (`Partial<PreloadApi>`), keep the calls as written — the renderer's `window.api` type is `PreloadApi`; web clients always take the RPC branch because they have an active runtime target.

- [ ] **Step 4: Run tests**

Run: `pnpm test src/renderer/src/runtime/runtime-beads-client.test.ts`
Expected: PASS (6 tests). Then `pnpm exec oxlint src/renderer/src/runtime/runtime-beads-client.ts src/renderer/src/runtime/runtime-beads-client.test.ts` and `pnpm sync:localization-catalog`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/runtime/runtime-beads-client.ts src/renderer/src/runtime/runtime-beads-client.test.ts src/renderer/src/i18n
git commit -m "feat(beads): route beads reads through IPC or runtime RPC"
```

---

### Task 4: Beads store slice

**Files:**
- Create: `src/renderer/src/store/slices/beads-slice-contract.ts`
- Create: `src/renderer/src/store/slices/beads-load-state.ts`
- Create: `src/renderer/src/store/slices/beads.ts`
- Modify: `src/renderer/src/store/index.ts` (import ~line 15, spread ~line 89), `src/renderer/src/store/types.ts` (import ~13, intersection ~59), `src/renderer/src/store/slices/store-test-helpers.ts` (import ~19, spread ~76)
- Test: `src/renderer/src/store/slices/beads.test.ts`

**Interfaces:**
- Consumes: Task 3 client functions and `BeadsRepoRef`; `AppState` from `../types` (has `settings`).
- Produces:
  - `type BeadsLoad<T> = { data: T | null; error: BeadsFailure | null; loading: boolean; token: string | null }`
  - `type BeadsRepoState = { status: BeadsLoad<BeadsWorkspaceStatus>; schema: BeadsLoad<BeadsSchema>; changeToken: string | null; pollError: BeadsFailure | null; lists: Record<string, BeadsLoad<BeadsIssuePage>>; details: Record<string, BeadsLoad<BeadsIssueDetails>> }`
  - `type BeadsSlice = { beadsRepos: Record<string, BeadsRepoState>; loadBeadsStatus(repo, options?: { force?: boolean }): Promise<void>; loadBeadsSchema(repo): Promise<void>; pollBeadsChangeToken(repo): Promise<void>; loadBeadsList(repo, request: BeadsListRequest, options?: { force?: boolean }): Promise<void>; loadBeadsDetails(repo, id: string, options?: { force?: boolean }): Promise<void> }`
  - `createBeadsSlice: StateCreator<AppState, [], [], BeadsSlice>` (exported from `beads.ts`, which also re-exports `BeadsSlice`)
  - `beadsListKey(request: BeadsListRequest): string` = `JSON.stringify(request)`
  - `EMPTY_BEADS_REPO_STATE: BeadsRepoState` and `selectBeadsRepoState(state: AppState, repoId: string): BeadsRepoState`
  - `pruneBeadsEntries<T>(entries: Record<string, BeadsLoad<T>>, keep: string, max: number): Record<string, BeadsLoad<T>>`
  - **Components import `selectBeadsRepoState`, `beadsListKey` and the `BeadsLoad`/`BeadsRepoState` types from `./beads-load-state` / `./beads-slice-contract`, never from `./beads.ts`** — `beads.ts` pulls in the runtime client and with it `runtime-rpc-client`, which every component test would then have to mock. Only the page container imports the actions from `beads.ts` (through `useAppStore`, so it gets them from the store anyway).
  - Freshness rule: a list, details or schema entry is fresh when `data !== null && token === changeToken && !force`; a changed token makes every token-bound entry stale without deleting its data (stale data keeps rendering while the reload runs).

- [ ] **Step 1: Write the failing test**

`src/renderer/src/store/slices/beads.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'

const client = vi.hoisted(() => ({
  beadsGetStatus: vi.fn(),
  beadsGetSchema: vi.fn(),
  beadsGetChangeToken: vi.fn(),
  beadsListIssues: vi.fn(),
  beadsGetIssueDetails: vi.fn()
}))

vi.mock('@/runtime/runtime-beads-client', () => client)

import type { AppState } from '../types'
import { createBeadsSlice } from './beads'
import { beadsListKey, BEADS_LIST_CACHE_MAX, selectBeadsRepoState } from './beads-load-state'

const REPO = { id: 'r1', path: '/work/app', connectionId: null, executionHostId: null }
const REQUEST = { view: 'ready' as const, filter: {}, limit: 200 }

function createTestStore() {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the slice only reads `settings` and its own fields; the rest of AppState is unused in these tests.
  return create<AppState>()((...a) => ({ settings: null, ...createBeadsSlice(...a) }) as AppState)
}

function page(ids: string[]) {
  return {
    ok: true,
    value: { issues: ids.map((id) => ({ id, title: id })), hasMore: false }
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('beads slice', () => {
  it('loads status and keeps a failure as data', async () => {
    const store = createTestStore()
    client.beadsGetStatus.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'bd-missing', message: 'bd is not installed on this host.' }
    })
    await store.getState().loadBeadsStatus(REPO)
    const status = selectBeadsRepoState(store.getState(), 'r1').status
    expect(status).toMatchObject({ loading: false, data: null, error: { kind: 'bd-missing' } })
  })

  it('serves a list from cache until the change token moves', async () => {
    const store = createTestStore()
    client.beadsGetChangeToken.mockResolvedValue({ ok: true, value: 'h1' })
    client.beadsListIssues.mockResolvedValue(page(['a']))

    await store.getState().pollBeadsChangeToken(REPO)
    await store.getState().loadBeadsList(REPO, REQUEST)
    await store.getState().loadBeadsList(REPO, REQUEST)
    expect(client.beadsListIssues).toHaveBeenCalledTimes(1)

    client.beadsGetChangeToken.mockResolvedValue({ ok: true, value: 'h2' })
    await store.getState().pollBeadsChangeToken(REPO)
    const stale = selectBeadsRepoState(store.getState(), 'r1').lists[beadsListKey(REQUEST)]
    expect(stale?.data?.issues).toHaveLength(1)
    await store.getState().loadBeadsList(REPO, REQUEST)
    expect(client.beadsListIssues).toHaveBeenCalledTimes(2)
  })

  it('reloads when forced and ignores a stale response that finishes last', async () => {
    const store = createTestStore()
    let resolveFirst: (value: unknown) => void = () => {}
    client.beadsListIssues
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(page(['new']))

    const first = store.getState().loadBeadsList(REPO, REQUEST, { force: true })
    await store.getState().loadBeadsList(REPO, REQUEST, { force: true })
    resolveFirst(page(['old']))
    await first

    const entry = selectBeadsRepoState(store.getState(), 'r1').lists[beadsListKey(REQUEST)]
    expect(entry?.data?.issues.map((issue) => issue.id)).toEqual(['new'])
  })

  it('stores details per issue id and schema per token', async () => {
    const store = createTestStore()
    client.beadsGetIssueDetails.mockResolvedValue({
      ok: true,
      value: { issue: { id: 'p-1' }, dependencies: [], dependents: [], comments: [] }
    })
    client.beadsGetSchema.mockResolvedValue({ ok: true, value: { statuses: [], types: [] } })
    await store.getState().loadBeadsDetails(REPO, 'p-1')
    await store.getState().loadBeadsSchema(REPO)
    await store.getState().loadBeadsSchema(REPO)
    const repoState = selectBeadsRepoState(store.getState(), 'r1')
    expect(repoState.details['p-1']?.data?.issue.id).toBe('p-1')
    expect(client.beadsGetSchema).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous token when polling fails and records why', async () => {
    const store = createTestStore()
    client.beadsGetChangeToken
      .mockResolvedValueOnce({ ok: true, value: 'h1' })
      .mockResolvedValueOnce({ ok: false, error: { kind: 'busy', message: 'busy' } })
    await store.getState().pollBeadsChangeToken(REPO)
    await store.getState().pollBeadsChangeToken(REPO)
    expect(selectBeadsRepoState(store.getState(), 'r1')).toMatchObject({
      changeToken: 'h1',
      pollError: { kind: 'busy' }
    })

    client.beadsGetChangeToken.mockResolvedValueOnce({ ok: true, value: 'h1' })
    await store.getState().pollBeadsChangeToken(REPO)
    expect(selectBeadsRepoState(store.getState(), 'r1').pollError).toBeNull()
  })

  it('caps the list cache so search keystrokes cannot grow it forever', async () => {
    const store = createTestStore()
    client.beadsGetChangeToken.mockResolvedValue({ ok: true, value: 'h1' })
    client.beadsListIssues.mockResolvedValue(page(['a']))
    await store.getState().pollBeadsChangeToken(REPO)
    for (let index = 0; index < BEADS_LIST_CACHE_MAX + 3; index += 1) {
      await store.getState().loadBeadsList(REPO, { ...REQUEST, text: `q${index}` })
    }
    const lists = selectBeadsRepoState(store.getState(), 'r1').lists
    expect(Object.keys(lists)).toHaveLength(BEADS_LIST_CACHE_MAX)
    // The newest key survives, the first ones were dropped.
    expect(lists[beadsListKey({ ...REQUEST, text: 'q0' })]).toBeUndefined()
    expect(
      lists[beadsListKey({ ...REQUEST, text: `q${BEADS_LIST_CACHE_MAX + 2}` })]
    ).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/store/slices/beads.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the contract and load-state helpers**

`src/renderer/src/store/slices/beads-slice-contract.ts`:
```ts
import type { StateCreator } from 'zustand'
import type {
  BeadsFailure,
  BeadsIssuePage,
  BeadsListRequest
} from '../../../../shared/beads/beads-contract'
import type {
  BeadsIssueDetails,
  BeadsSchema,
  BeadsWorkspaceStatus
} from '../../../../shared/beads/beads-issue-types'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'
import type { AppState } from '../types'

export type BeadsLoad<T> = {
  data: T | null
  error: BeadsFailure | null
  loading: boolean
  token: string | null
}

export type BeadsRepoState = {
  status: BeadsLoad<BeadsWorkspaceStatus>
  schema: BeadsLoad<BeadsSchema>
  changeToken: string | null
  /** Last change-token poll failure, or null. Stale lists keep rendering under it. */
  pollError: BeadsFailure | null
  lists: Record<string, BeadsLoad<BeadsIssuePage>>
  details: Record<string, BeadsLoad<BeadsIssueDetails>>
}

export type BeadsLoadOptions = { force?: boolean }

export type BeadsSlice = {
  beadsRepos: Record<string, BeadsRepoState>
  loadBeadsStatus: (repo: BeadsRepoRef, options?: BeadsLoadOptions) => Promise<void>
  loadBeadsSchema: (repo: BeadsRepoRef) => Promise<void>
  pollBeadsChangeToken: (repo: BeadsRepoRef) => Promise<void>
  loadBeadsList: (
    repo: BeadsRepoRef,
    request: BeadsListRequest,
    options?: BeadsLoadOptions
  ) => Promise<void>
  loadBeadsDetails: (repo: BeadsRepoRef, id: string, options?: BeadsLoadOptions) => Promise<void>
}

type BeadsStateCreator = StateCreator<AppState, [], [], BeadsSlice>
export type BeadsSliceSet = Parameters<BeadsStateCreator>[0]
export type BeadsSliceGet = Parameters<BeadsStateCreator>[1]
```

`src/renderer/src/store/slices/beads-load-state.ts`:
```ts
import type { BeadsListRequest, BeadsResult } from '../../../../shared/beads/beads-contract'
import type { AppState } from '../types'
import type { BeadsLoad, BeadsRepoState } from './beads-slice-contract'

export function emptyBeadsLoad<T>(): BeadsLoad<T> {
  return { data: null, error: null, loading: false, token: null }
}

export const EMPTY_BEADS_REPO_STATE: BeadsRepoState = {
  status: emptyBeadsLoad(),
  schema: emptyBeadsLoad(),
  changeToken: null,
  pollError: null,
  lists: {},
  details: {}
}

export const BEADS_LIST_CACHE_MAX = 12
export const BEADS_DETAILS_CACHE_MAX = 24

// Why: every debounced search string and every Load-more limit adds a key, and each
// page can be hundreds of KB. Keys keep insertion order, so the oldest go first; the
// key being written and anything still loading stay.
export function pruneBeadsEntries<T>(
  entries: Record<string, BeadsLoad<T>>,
  keep: string,
  max: number
): Record<string, BeadsLoad<T>> {
  const keys = Object.keys(entries)
  if (keys.length <= max) {
    return entries
  }
  const removable = keys.filter((key) => key !== keep && !entries[key]?.loading)
  const dropCount = Math.min(keys.length - max, removable.length)
  if (dropCount === 0) {
    return entries
  }
  const dropped = new Set(removable.slice(0, dropCount))
  return Object.fromEntries(keys.filter((key) => !dropped.has(key)).map((key) => [key, entries[key]]))
}

export function selectBeadsRepoState(state: AppState, repoId: string): BeadsRepoState {
  return state.beadsRepos[repoId] ?? EMPTY_BEADS_REPO_STATE
}

export function beadsListKey(request: BeadsListRequest): string {
  return JSON.stringify(request)
}

export function isFreshBeadsLoad<T>(
  entry: BeadsLoad<T> | undefined,
  changeToken: string | null,
  force: boolean | undefined
): boolean {
  return !force && entry !== undefined && entry.data !== null && entry.token === changeToken
}

export function startedBeadsLoad<T>(entry: BeadsLoad<T> | undefined): BeadsLoad<T> {
  // Why: keep showing the previous data while a reload runs instead of flashing empty.
  return { ...(entry ?? emptyBeadsLoad<T>()), loading: true, error: null }
}

export function settledBeadsLoad<T>(
  entry: BeadsLoad<T> | undefined,
  result: BeadsResult<T>,
  token: string | null
): BeadsLoad<T> {
  if (result.ok) {
    return { data: result.value, error: null, loading: false, token }
  }
  return { ...(entry ?? emptyBeadsLoad<T>()), error: result.error, loading: false }
}

export function updateBeadsRepo(
  state: AppState,
  repoId: string,
  update: (repo: BeadsRepoState) => BeadsRepoState
): Pick<AppState, 'beadsRepos'> {
  const current = state.beadsRepos[repoId] ?? EMPTY_BEADS_REPO_STATE
  return { beadsRepos: { ...state.beadsRepos, [repoId]: update(current) } }
}
```

- [ ] **Step 4: Implement the slice**

`src/renderer/src/store/slices/beads.ts`:
```ts
import type { BeadsListRequest } from '../../../../shared/beads/beads-contract'
import type { StateCreator } from 'zustand'
import {
  beadsGetChangeToken,
  beadsGetIssueDetails,
  beadsGetSchema,
  beadsGetStatus,
  beadsListIssues,
  type BeadsRepoRef
} from '@/runtime/runtime-beads-client'
import type { AppState } from '../types'
import {
  beadsListKey,
  BEADS_DETAILS_CACHE_MAX,
  BEADS_LIST_CACHE_MAX,
  isFreshBeadsLoad,
  pruneBeadsEntries,
  selectBeadsRepoState,
  settledBeadsLoad,
  startedBeadsLoad,
  updateBeadsRepo
} from './beads-load-state'
import type { BeadsSlice } from './beads-slice-contract'

export type { BeadsSlice } from './beads-slice-contract'
export { beadsListKey, selectBeadsRepoState, EMPTY_BEADS_REPO_STATE } from './beads-load-state'

// Why: a newer request for the same key wins even if an older one resolves later.
const latestRequest = new Map<string, number>()
let requestCounter = 0

function beginRequest(key: string): number {
  requestCounter += 1
  latestRequest.set(key, requestCounter)
  return requestCounter
}

function isLatestRequest(key: string, requestId: number): boolean {
  return latestRequest.get(key) === requestId
}

export const createBeadsSlice: StateCreator<AppState, [], [], BeadsSlice> = (set, get) => ({
  beadsRepos: {},

  loadBeadsStatus: async (repo, options) => {
    const current = selectBeadsRepoState(get(), repo.id).status
    if (!options?.force && (current.data !== null || current.loading)) {
      return
    }
    const requestKey = `${repo.id}\nstatus`
    const requestId = beginRequest(requestKey)
    set((state) => updateBeadsRepo(state, repo.id, (r) => ({ ...r, status: startedBeadsLoad(r.status) })))
    const result = await beadsGetStatus(get().settings, repo)
    if (!isLatestRequest(requestKey, requestId)) {
      return
    }
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({ ...r, status: settledBeadsLoad(r.status, result, null) }))
    )
  },

  loadBeadsSchema: async (repo) => {
    const repoState = selectBeadsRepoState(get(), repo.id)
    if (isFreshBeadsLoad(repoState.schema, repoState.changeToken, false)) {
      return
    }
    const token = repoState.changeToken
    const requestKey = `${repo.id}\nschema`
    const requestId = beginRequest(requestKey)
    set((state) => updateBeadsRepo(state, repo.id, (r) => ({ ...r, schema: startedBeadsLoad(r.schema) })))
    const result = await beadsGetSchema(get().settings, repo)
    if (!isLatestRequest(requestKey, requestId)) {
      return
    }
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({ ...r, schema: settledBeadsLoad(r.schema, result, token) }))
    )
  },

  pollBeadsChangeToken: async (repo) => {
    const result = await beadsGetChangeToken(get().settings, repo)
    if (!result.ok) {
      // Why: keep the last token and the data it loaded; only record why we are stale.
      set((state) => updateBeadsRepo(state, repo.id, (r) => ({ ...r, pollError: result.error })))
      return
    }
    const repoState = selectBeadsRepoState(get(), repo.id)
    if (repoState.changeToken === result.value && repoState.pollError === null) {
      return
    }
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({ ...r, changeToken: result.value, pollError: null }))
    )
  },

  loadBeadsList: async (repo, request: BeadsListRequest, options) => {
    const key = beadsListKey(request)
    const repoState = selectBeadsRepoState(get(), repo.id)
    if (isFreshBeadsLoad(repoState.lists[key], repoState.changeToken, options?.force)) {
      return
    }
    const token = repoState.changeToken
    const requestKey = `${repo.id}\nlist\n${key}`
    const requestId = beginRequest(requestKey)
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({
        ...r,
        lists: { ...r.lists, [key]: startedBeadsLoad(r.lists[key]) }
      }))
    )
    const result = await beadsListIssues(get().settings, repo, request)
    if (!isLatestRequest(requestKey, requestId)) {
      return
    }
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({
        ...r,
        lists: pruneBeadsEntries(
          { ...r.lists, [key]: settledBeadsLoad(r.lists[key], result, token) },
          key,
          BEADS_LIST_CACHE_MAX
        )
      }))
    )
  },

  loadBeadsDetails: async (repo, id, options) => {
    const repoState = selectBeadsRepoState(get(), repo.id)
    if (isFreshBeadsLoad(repoState.details[id], repoState.changeToken, options?.force)) {
      return
    }
    const token = repoState.changeToken
    const requestKey = `${repo.id}\ndetails\n${id}`
    const requestId = beginRequest(requestKey)
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({
        ...r,
        details: { ...r.details, [id]: startedBeadsLoad(r.details[id]) }
      }))
    )
    const result = await beadsGetIssueDetails(get().settings, repo, id)
    if (!isLatestRequest(requestKey, requestId)) {
      return
    }
    set((state) =>
      updateBeadsRepo(state, repo.id, (r) => ({
        ...r,
        details: pruneBeadsEntries(
          { ...r.details, [id]: settledBeadsLoad(r.details[id], result, token) },
          id,
          BEADS_DETAILS_CACHE_MAX
        )
      }))
    )
  }
})

export type { BeadsRepoRef }
```

If `beads.ts` exceeds 300 lines after formatting, move the request-counter helpers (`latestRequest`, `requestCounter`, `beginRequest`, `isLatestRequest`) into `beads-load-state.ts` and import them.

- [ ] **Step 5: Register the slice**

- `src/renderer/src/store/types.ts`: `import type { BeadsSlice } from './slices/beads'` next to the Jira import, and add `BeadsSlice &` next to `JiraSlice &` in `AppState`.
- `src/renderer/src/store/index.ts`: `import { createBeadsSlice } from './slices/beads'` next to `createJiraSlice`, and `...createBeadsSlice(...a),` next to `...createJiraSlice(...a),`.
- `src/renderer/src/store/slices/store-test-helpers.ts`: same import and spread next to Jira's.

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm test src/renderer/src/store/slices/beads.test.ts` then `pnpm tc`.
Expected: PASS (6 tests); typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/store/slices/beads-slice-contract.ts src/renderer/src/store/slices/beads-load-state.ts src/renderer/src/store/slices/beads.ts src/renderer/src/store/slices/beads.test.ts src/renderer/src/store/index.ts src/renderer/src/store/types.ts src/renderer/src/store/slices/store-test-helpers.ts
git commit -m "feat(beads): add the beads store slice with change-token freshness"
```

---

### Task 5: Presets, filter support and the list request builder

**Files:**
- Create: `src/renderer/src/components/task-page/beads/beads-list-request.ts`
- Test: `src/renderer/src/components/task-page/beads/beads-list-request.test.ts`

**Interfaces:**
- Consumes: `BeadsListRequest`, `BeadsListView`, `BEADS_LIST_PAGE_SIZE`, `BEADS_LIST_MAX_LIMIT` from `src/shared/beads/beads-contract.ts`.
- Produces:
  - `type BeadsPreset = 'ready' | 'in_progress' | 'blocked' | 'open' | 'closed'`, `BEADS_PRESETS: readonly BeadsPreset[]` (that order)
  - `type BeadsFilterKey = 'type' | 'labels' | 'parent' | 'priority' | 'assignee'`
  - `type BeadsFilterValues = { type: string | null; labels: string[]; parent: string | null; priority: number | null; assignee: string }`, `EMPTY_BEADS_FILTERS: BeadsFilterValues`
  - `type BeadsListQuery = { preset: BeadsPreset; filters: BeadsFilterValues; text: string; limit: number }`
  - `beadsViewForQuery(query: BeadsListQuery): BeadsListView`
  - `supportedBeadsFilterKeys(view: BeadsListView): ReadonlySet<BeadsFilterKey>`
  - `buildBeadsListRequest(query: BeadsListQuery): BeadsListRequest`
  - `nextBeadsLimit(limit: number): number` (limit + 200, max 2000)
  - `BEADS_TREE_INDEX_REQUEST: BeadsListRequest` = `{ view: 'list', filter: { includeClosed: true }, limit: 2000 }`
  - `countActiveBeadsFilters(filters: BeadsFilterValues, view: BeadsListView): number`

Rules (M1 backend rejects unsupported filters with `invalid-input`, so the builder must never send them):

| view | when | supported filters | status from preset |
|---|---|---|---|
| `search` | `text.trim() !== ''` | type, labels, priority, assignee | `in_progress` → `['in_progress']`, `closed` → `['closed']`, others none |
| `ready` | preset `ready` | type, labels, parent, priority, assignee | none |
| `blocked` | preset `blocked` | parent | none |
| `list` | presets `open`, `in_progress`, `closed` | all | `in_progress` → `['in_progress']`, `closed` → `['closed']`, `open` none |

- [ ] **Step 1: Write the failing test**

`src/renderer/src/components/task-page/beads/beads-list-request.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  BEADS_PRESETS,
  EMPTY_BEADS_FILTERS,
  buildBeadsListRequest,
  countActiveBeadsFilters,
  nextBeadsLimit,
  supportedBeadsFilterKeys,
  type BeadsListQuery
} from './beads-list-request'

const FILTERS = {
  type: 'bug',
  labels: ['ui'],
  parent: 'e-1',
  priority: 1,
  assignee: 'ada'
}

function query(overrides: Partial<BeadsListQuery>): BeadsListQuery {
  return { preset: 'open', filters: EMPTY_BEADS_FILTERS, text: '', limit: 200, ...overrides }
}

describe('buildBeadsListRequest', () => {
  it('lists presets in the spec order', () => {
    expect(BEADS_PRESETS).toEqual(['ready', 'in_progress', 'blocked', 'open', 'closed'])
  })

  it('maps list presets to status filters and keeps every filter', () => {
    expect(buildBeadsListRequest(query({ preset: 'in_progress', filters: FILTERS }))).toEqual({
      view: 'list',
      filter: { statuses: ['in_progress'], type: 'bug', labels: ['ui'], parent: 'e-1', priority: 1, assignee: 'ada' },
      limit: 200
    })
    expect(buildBeadsListRequest(query({ preset: 'closed' })).filter).toEqual({ statuses: ['closed'] })
    expect(buildBeadsListRequest(query({ preset: 'open' })).filter).toEqual({})
  })

  it('drops filters bd cannot apply for ready and blocked', () => {
    expect(buildBeadsListRequest(query({ preset: 'ready', filters: FILTERS }))).toEqual({
      view: 'ready',
      filter: { type: 'bug', labels: ['ui'], parent: 'e-1', priority: 1, assignee: 'ada' },
      limit: 200
    })
    expect(buildBeadsListRequest(query({ preset: 'blocked', filters: FILTERS }))).toEqual({
      view: 'blocked',
      filter: { parent: 'e-1' },
      limit: 200
    })
  })

  it('switches to search for text and never sends parent', () => {
    expect(
      buildBeadsListRequest(query({ preset: 'closed', text: '  playtest ', filters: FILTERS }))
    ).toEqual({
      view: 'search',
      filter: { statuses: ['closed'], type: 'bug', labels: ['ui'], priority: 1, assignee: 'ada' },
      text: 'playtest',
      limit: 200
    })
    expect(buildBeadsListRequest(query({ preset: 'ready', text: 'x' })).filter).toEqual({})
  })

  it('omits empty filter values', () => {
    expect(
      buildBeadsListRequest(query({ filters: { ...EMPTY_BEADS_FILTERS, assignee: '  ' } })).filter
    ).toEqual({})
  })
})

describe('filter helpers', () => {
  it('reports supported filters per view', () => {
    expect([...supportedBeadsFilterKeys('blocked')]).toEqual(['parent'])
    expect(supportedBeadsFilterKeys('search').has('parent')).toBe(false)
    expect(supportedBeadsFilterKeys('list').size).toBe(5)
  })

  it('counts only filters the current view applies', () => {
    expect(countActiveBeadsFilters(FILTERS, 'list')).toBe(5)
    expect(countActiveBeadsFilters(FILTERS, 'blocked')).toBe(1)
  })

  it('grows the limit by a page up to the maximum', () => {
    expect(nextBeadsLimit(200)).toBe(400)
    expect(nextBeadsLimit(1900)).toBe(2000)
    expect(nextBeadsLimit(2000)).toBe(2000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/components/task-page/beads/beads-list-request.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/renderer/src/components/task-page/beads/beads-list-request.ts`:
```ts
import {
  BEADS_LIST_MAX_LIMIT,
  BEADS_LIST_PAGE_SIZE,
  type BeadsListFilter,
  type BeadsListRequest,
  type BeadsListView
} from '../../../../../shared/beads/beads-contract'

export type BeadsPreset = 'ready' | 'in_progress' | 'blocked' | 'open' | 'closed'

export const BEADS_PRESETS: readonly BeadsPreset[] = ['ready', 'in_progress', 'blocked', 'open', 'closed']

export type BeadsFilterKey = 'type' | 'labels' | 'parent' | 'priority' | 'assignee'

export type BeadsFilterValues = {
  type: string | null
  labels: string[]
  parent: string | null
  priority: number | null
  assignee: string
}

export const EMPTY_BEADS_FILTERS: BeadsFilterValues = {
  type: null,
  labels: [],
  parent: null,
  priority: null,
  assignee: ''
}

export type BeadsListQuery = {
  preset: BeadsPreset
  filters: BeadsFilterValues
  text: string
  limit: number
}

export const BEADS_TREE_INDEX_REQUEST: BeadsListRequest = {
  view: 'list',
  filter: { includeClosed: true },
  limit: BEADS_LIST_MAX_LIMIT
}

const ALL_FILTERS: readonly BeadsFilterKey[] = ['type', 'labels', 'parent', 'priority', 'assignee']

// Why: M1's argv builders reject these combinations with invalid-input; the UI
// disables them and the builder never sends them.
const SUPPORTED_FILTERS: Record<BeadsListView, ReadonlySet<BeadsFilterKey>> = {
  list: new Set(ALL_FILTERS),
  ready: new Set(['type', 'labels', 'parent', 'priority', 'assignee']),
  blocked: new Set(['parent']),
  search: new Set(['type', 'labels', 'priority', 'assignee'])
}

export function beadsViewForQuery(query: BeadsListQuery): BeadsListView {
  if (query.text.trim() !== '') {
    return 'search'
  }
  if (query.preset === 'ready') {
    return 'ready'
  }
  if (query.preset === 'blocked') {
    return 'blocked'
  }
  return 'list'
}

export function supportedBeadsFilterKeys(view: BeadsListView): ReadonlySet<BeadsFilterKey> {
  return SUPPORTED_FILTERS[view]
}

function presetStatuses(preset: BeadsPreset, view: BeadsListView): string[] | undefined {
  if (view !== 'list' && view !== 'search') {
    return undefined
  }
  if (preset === 'in_progress') {
    return ['in_progress']
  }
  if (preset === 'closed') {
    return ['closed']
  }
  return undefined
}

function hasFilterValue(filters: BeadsFilterValues, key: BeadsFilterKey): boolean {
  switch (key) {
    case 'type':
      return filters.type !== null
    case 'labels':
      return filters.labels.length > 0
    case 'parent':
      return filters.parent !== null
    case 'priority':
      return filters.priority !== null
    case 'assignee':
      return filters.assignee.trim() !== ''
  }
}

export function buildBeadsListRequest(query: BeadsListQuery): BeadsListRequest {
  const view = beadsViewForQuery(query)
  const supported = SUPPORTED_FILTERS[view]
  const { filters } = query
  const filter: BeadsListFilter = {}
  const statuses = presetStatuses(query.preset, view)
  if (statuses) {
    filter.statuses = statuses
  }
  if (supported.has('type') && filters.type !== null) {
    filter.type = filters.type
  }
  if (supported.has('labels') && filters.labels.length > 0) {
    filter.labels = filters.labels
  }
  if (supported.has('parent') && filters.parent !== null) {
    filter.parent = filters.parent
  }
  if (supported.has('priority') && filters.priority !== null) {
    filter.priority = filters.priority
  }
  if (supported.has('assignee') && filters.assignee.trim() !== '') {
    filter.assignee = filters.assignee.trim()
  }
  const request: BeadsListRequest = { view, filter, limit: query.limit }
  if (view === 'search') {
    request.text = query.text.trim()
  }
  return request
}

export function countActiveBeadsFilters(filters: BeadsFilterValues, view: BeadsListView): number {
  return ALL_FILTERS.filter((key) => SUPPORTED_FILTERS[view].has(key) && hasFilterValue(filters, key))
    .length
}

export function nextBeadsLimit(limit: number): number {
  return Math.min(limit + BEADS_LIST_PAGE_SIZE, BEADS_LIST_MAX_LIMIT)
}
```

Check the property order in the test's first `toEqual`: `toEqual` ignores key order, so the object shapes match.

- [ ] **Step 4: Run tests**

Run: `pnpm test src/renderer/src/components/task-page/beads/beads-list-request.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/task-page/beads/beads-list-request.ts src/renderer/src/components/task-page/beads/beads-list-request.test.ts
git commit -m "feat(beads): build beads list requests from presets and filters"
```

---

### Task 6: Tree and flat row model

**Files:**
- Create: `src/renderer/src/components/task-page/beads/beads-tree-rows.ts`
- Test: `src/renderer/src/components/task-page/beads/beads-tree-rows.test.ts`

**Interfaces:**
- Consumes: `BeadsIssue` (`id`, `title`, `status`, `parent?`, …) from `src/shared/beads/beads-issue-types.ts`.
- Produces:
  - `type BeadsListMode = 'tree' | 'flat'`
  - `type BeadsProgress = { closed: number; total: number }`
  - `type BeadsIssueListRow = { kind: 'issue'; key: string; issue: BeadsIssue; depth: number; hasChildren: boolean; expanded: boolean; parentKey: string | null }`
  - `type BeadsContextListRow = { kind: 'context'; key: string; parentId: string; parent: BeadsIssue | null; depth: 0; hasChildren: true; expanded: boolean; parentKey: null }`
  - `type BeadsListRow = BeadsIssueListRow | BeadsContextListRow`
  - `beadsIssueRowKey(id: string): string` → `issue:<id>`; `beadsContextRowKey(id: string): string` → `context:<id>`
  - `buildBeadsListRows(input: { issues: readonly BeadsIssue[]; index: readonly BeadsIssue[] | null; mode: BeadsListMode; collapsed: ReadonlySet<string> }): BeadsListRow[]`
  - `buildBeadsProgressByParent(index: readonly BeadsIssue[] | null, isDone: (status: string) => boolean): ReadonlyMap<string, BeadsProgress>`

Tree rules (spec §4.1):
- An issue whose parent is also in the result renders under that parent (recursively), in result order.
- Children of a parent that is **not** in the result are grouped under a greyed **context** row for that parent at depth 0 (title from the tree index when known).
- A collapsed row (key in `collapsed`) hides its whole subtree.
- Parent cycles never hide issues: anything not emitted and not hidden enters `emitIssue` at depth 0 at the end. Note what that produces for a cycle a↔b: `a` is emitted at depth 0 and `b` is then emitted as `a`'s child at depth 1 (the wrap-around edge back to `a` is filtered because `a` is already in `emitted`). The guarantee is termination with every issue visible exactly once — not that every cycle member sits at depth 0.
- Flat mode: every issue at depth 0, no children.
- Progress for a parent = closed children / all children in the tree index (which includes closed issues).

- [ ] **Step 1: Write the failing test**

`src/renderer/src/components/task-page/beads/beads-tree-rows.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { BeadsIssue } from '../../../../../shared/beads/beads-issue-types'
import {
  beadsContextRowKey,
  beadsIssueRowKey,
  buildBeadsListRows,
  buildBeadsProgressByParent
} from './beads-tree-rows'

function issue(id: string, parent?: string, status = 'open'): BeadsIssue {
  return {
    id,
    title: `Title ${id}`,
    status,
    priority: 2,
    issueType: 'task',
    labels: [],
    parent,
    createdAt: '',
    updatedAt: '',
    dependencyCount: 0,
    dependentCount: 0,
    commentCount: 0,
    blockedBy: [],
    dependencyEdges: []
  }
}

function summary(rows: ReturnType<typeof buildBeadsListRows>): string[] {
  return rows.map((row) => `${'  '.repeat(row.depth)}${row.key}${row.expanded ? ' +' : ''}`)
}

describe('buildBeadsListRows', () => {
  it('nests children under parents in the result, even when a child comes first', () => {
    const rows = buildBeadsListRows({
      issues: [issue('c1', 'e1'), issue('e1'), issue('x')],
      index: null,
      mode: 'tree',
      collapsed: new Set()
    })
    expect(summary(rows)).toEqual(['issue:e1 +', '  issue:c1', 'issue:x'])
    expect(rows[1]).toMatchObject({ parentKey: 'issue:e1', hasChildren: false })
  })

  it('groups children of a missing parent under a context row titled from the index', () => {
    const rows = buildBeadsListRows({
      issues: [issue('c1', 'e9'), issue('c2', 'e9')],
      index: [issue('e9')],
      mode: 'tree',
      collapsed: new Set()
    })
    expect(summary(rows)).toEqual(['context:e9 +', '  issue:c1', '  issue:c2'])
    expect(rows[0]).toMatchObject({ kind: 'context', parent: { title: 'Title e9' } })
  })

  it('hides collapsed subtrees, including nested ones', () => {
    const rows = buildBeadsListRows({
      issues: [issue('e1'), issue('c1', 'e1'), issue('g1', 'c1')],
      index: null,
      mode: 'tree',
      collapsed: new Set([beadsIssueRowKey('e1')])
    })
    expect(summary(rows)).toEqual(['issue:e1'])
    expect(rows[0]).toMatchObject({ hasChildren: true, expanded: false })
  })

  it('collapses a context row', () => {
    const rows = buildBeadsListRows({
      issues: [issue('c1', 'e9')],
      index: null,
      mode: 'tree',
      collapsed: new Set([beadsContextRowKey('e9')])
    })
    expect(summary(rows)).toEqual(['context:e9'])
    expect(rows[0]).toMatchObject({ parent: null })
  })

  it('never hides issues caught in a parent cycle', () => {
    const rows = buildBeadsListRows({
      issues: [issue('a', 'b'), issue('b', 'a')],
      index: null,
      mode: 'tree',
      collapsed: new Set()
    })
    // Assert the shape, not just the set: a regression that changed cycle-remainder
    // depth or parentKey would still produce the same two keys.
    expect(rows.map((row) => ({ key: row.key, depth: row.depth, parentKey: row.parentKey }))).toEqual([
      { key: 'issue:a', depth: 0, parentKey: null },
      { key: 'issue:b', depth: 1, parentKey: 'issue:a' }
    ])
  })

  it('renders a flat list at depth zero', () => {
    const rows = buildBeadsListRows({
      issues: [issue('c1', 'e1'), issue('e1')],
      index: null,
      mode: 'flat',
      collapsed: new Set()
    })
    expect(summary(rows)).toEqual(['issue:c1', 'issue:e1'])
  })
})

describe('buildBeadsProgressByParent', () => {
  it('counts closed and total children from the index', () => {
    const progress = buildBeadsProgressByParent(
      [issue('e1'), issue('c1', 'e1', 'closed'), issue('c2', 'e1'), issue('c3', 'e2')],
      (status) => status === 'closed'
    )
    expect(progress.get('e1')).toEqual({ closed: 1, total: 2 })
    expect(progress.get('e2')).toEqual({ closed: 0, total: 1 })
    expect(buildBeadsProgressByParent(null, () => false).size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/components/task-page/beads/beads-tree-rows.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/renderer/src/components/task-page/beads/beads-tree-rows.ts`:
```ts
import type { BeadsIssue } from '../../../../../shared/beads/beads-issue-types'

export type BeadsListMode = 'tree' | 'flat'

export type BeadsProgress = { closed: number; total: number }

export type BeadsIssueListRow = {
  kind: 'issue'
  key: string
  issue: BeadsIssue
  depth: number
  hasChildren: boolean
  expanded: boolean
  parentKey: string | null
}

export type BeadsContextListRow = {
  kind: 'context'
  key: string
  parentId: string
  parent: BeadsIssue | null
  depth: 0
  hasChildren: true
  expanded: boolean
  parentKey: null
}

export type BeadsListRow = BeadsIssueListRow | BeadsContextListRow

export type BeadsListRowsInput = {
  issues: readonly BeadsIssue[]
  index: readonly BeadsIssue[] | null
  mode: BeadsListMode
  collapsed: ReadonlySet<string>
}

export function beadsIssueRowKey(id: string): string {
  return `issue:${id}`
}

export function beadsContextRowKey(id: string): string {
  return `context:${id}`
}

function flatRows(issues: readonly BeadsIssue[]): BeadsListRow[] {
  return issues.map((issue) => ({
    kind: 'issue',
    key: beadsIssueRowKey(issue.id),
    issue,
    depth: 0,
    hasChildren: false,
    expanded: false,
    parentKey: null
  }))
}

export function buildBeadsListRows(input: BeadsListRowsInput): BeadsListRow[] {
  const { issues, index, mode, collapsed } = input
  if (mode === 'flat') {
    return flatRows(issues)
  }
  const ids = new Set(issues.map((issue) => issue.id))
  const children = new Map<string, BeadsIssue[]>()
  for (const issue of issues) {
    if (issue.parent) {
      children.set(issue.parent, [...(children.get(issue.parent) ?? []), issue])
    }
  }
  const indexById = new Map((index ?? []).map((entry) => [entry.id, entry]))
  const rows: BeadsListRow[] = []
  const emitted = new Set<string>()
  const hidden = new Set<string>()

  const hide = (issue: BeadsIssue): void => {
    if (hidden.has(issue.id) || emitted.has(issue.id)) {
      return
    }
    hidden.add(issue.id)
    for (const child of children.get(issue.id) ?? []) {
      hide(child)
    }
  }

  const emitIssue = (issue: BeadsIssue, depth: number, parentKey: string | null): void => {
    if (emitted.has(issue.id)) {
      return
    }
    emitted.add(issue.id)
    const key = beadsIssueRowKey(issue.id)
    const kids = (children.get(issue.id) ?? []).filter((child) => !emitted.has(child.id))
    const hasChildren = kids.length > 0
    const expanded = hasChildren && !collapsed.has(key)
    rows.push({ kind: 'issue', key, issue, depth, hasChildren, expanded, parentKey })
    for (const kid of kids) {
      if (expanded) {
        emitIssue(kid, depth + 1, key)
      } else {
        hide(kid)
      }
    }
  }

  const contexts = new Set<string>()
  for (const issue of issues) {
    if (emitted.has(issue.id) || hidden.has(issue.id)) {
      continue
    }
    const parentId = issue.parent
    if (parentId && ids.has(parentId)) {
      continue
    }
    if (!parentId) {
      emitIssue(issue, 0, null)
      continue
    }
    if (contexts.has(parentId)) {
      continue
    }
    contexts.add(parentId)
    const key = beadsContextRowKey(parentId)
    const expanded = !collapsed.has(key)
    rows.push({
      kind: 'context',
      key,
      parentId,
      parent: indexById.get(parentId) ?? null,
      depth: 0,
      hasChildren: true,
      expanded,
      parentKey: null
    })
    for (const kid of children.get(parentId) ?? []) {
      if (expanded) {
        emitIssue(kid, 1, key)
      } else {
        hide(kid)
      }
    }
  }

  // Why: a parent cycle (a→b→a) skips both issues above; emit leftovers at the root.
  for (const issue of issues) {
    if (!emitted.has(issue.id) && !hidden.has(issue.id)) {
      emitIssue(issue, 0, null)
    }
  }
  return rows
}

export function buildBeadsProgressByParent(
  index: readonly BeadsIssue[] | null,
  isDone: (status: string) => boolean
): ReadonlyMap<string, BeadsProgress> {
  const progress = new Map<string, BeadsProgress>()
  for (const entry of index ?? []) {
    if (!entry.parent) {
      continue
    }
    const current = progress.get(entry.parent) ?? { closed: 0, total: 0 }
    progress.set(entry.parent, {
      closed: current.closed + (isDone(entry.status) ? 1 : 0),
      total: current.total + 1
    })
  }
  return progress
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/renderer/src/components/task-page/beads/beads-tree-rows.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/task-page/beads/beads-tree-rows.ts src/renderer/src/components/task-page/beads/beads-tree-rows.test.ts
git commit -m "feat(beads): build tree and flat rows for the beads list"
```

---

### Task 7: Keyboard resolver

**Files:**
- Create: `src/renderer/src/components/task-page/beads/beads-list-keyboard.ts`
- Test: `src/renderer/src/components/task-page/beads/beads-list-keyboard.test.ts`

**Interfaces:**
- Consumes: `BeadsListRow` (Task 6).
- Produces:
  - `type BeadsListKeyAction = { type: 'select'; index: number } | { type: 'expand'; key: string } | { type: 'collapse'; key: string } | { type: 'open'; index: number } | { type: 'none' }`
  - `resolveBeadsListKey(key: string, rows: readonly BeadsListRow[], currentIndex: number): BeadsListKeyAction`

Key map (spec §4.1; `s`/`c`/`n` are M3/M4 and must return `none` for now):

| key | action |
|---|---|
| ArrowDown / ArrowUp | select next / previous (from `-1`, ArrowDown selects 0) |
| Home / End | select first / last |
| ArrowRight | collapsed parent → expand; expanded parent → select first child (next row); else none |
| ArrowLeft | expanded parent → collapse; otherwise select the row whose key is `parentKey`; else none |
| Enter | issue row → open; context row → toggle (collapse if expanded, else expand) |

- [ ] **Step 1: Write the failing test**

`src/renderer/src/components/task-page/beads/beads-list-keyboard.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { BeadsIssue } from '../../../../../shared/beads/beads-issue-types'
import { resolveBeadsListKey } from './beads-list-keyboard'
import type { BeadsListRow } from './beads-tree-rows'

const ISSUE: BeadsIssue = {
  id: 'x',
  title: 'x',
  status: 'open',
  priority: 2,
  issueType: 'task',
  labels: [],
  createdAt: '',
  updatedAt: '',
  dependencyCount: 0,
  dependentCount: 0,
  commentCount: 0,
  blockedBy: [],
  dependencyEdges: []
}

const ROWS: BeadsListRow[] = [
  { kind: 'issue', key: 'issue:e1', issue: ISSUE, depth: 0, hasChildren: true, expanded: true, parentKey: null },
  { kind: 'issue', key: 'issue:c1', issue: ISSUE, depth: 1, hasChildren: false, expanded: false, parentKey: 'issue:e1' },
  { kind: 'context', key: 'context:e9', parentId: 'e9', parent: null, depth: 0, hasChildren: true, expanded: false, parentKey: null }
]

describe('resolveBeadsListKey', () => {
  it('moves the selection with arrows, Home and End', () => {
    expect(resolveBeadsListKey('ArrowDown', ROWS, -1)).toEqual({ type: 'select', index: 0 })
    expect(resolveBeadsListKey('ArrowDown', ROWS, 2)).toEqual({ type: 'select', index: 2 })
    expect(resolveBeadsListKey('ArrowUp', ROWS, 0)).toEqual({ type: 'select', index: 0 })
    expect(resolveBeadsListKey('End', ROWS, 0)).toEqual({ type: 'select', index: 2 })
    expect(resolveBeadsListKey('Home', ROWS, 2)).toEqual({ type: 'select', index: 0 })
  })

  it('expands, enters and collapses parents', () => {
    expect(resolveBeadsListKey('ArrowRight', ROWS, 2)).toEqual({ type: 'expand', key: 'context:e9' })
    expect(resolveBeadsListKey('ArrowRight', ROWS, 0)).toEqual({ type: 'select', index: 1 })
    expect(resolveBeadsListKey('ArrowLeft', ROWS, 0)).toEqual({ type: 'collapse', key: 'issue:e1' })
    expect(resolveBeadsListKey('ArrowLeft', ROWS, 1)).toEqual({ type: 'select', index: 0 })
    expect(resolveBeadsListKey('ArrowRight', ROWS, 1)).toEqual({ type: 'none' })
  })

  it('opens issues and toggles context rows on Enter', () => {
    expect(resolveBeadsListKey('Enter', ROWS, 1)).toEqual({ type: 'open', index: 1 })
    expect(resolveBeadsListKey('Enter', ROWS, 2)).toEqual({ type: 'expand', key: 'context:e9' })
  })

  it('ignores other keys, empty lists and no selection for row actions', () => {
    expect(resolveBeadsListKey('s', ROWS, 1)).toEqual({ type: 'none' })
    expect(resolveBeadsListKey('ArrowDown', [], -1)).toEqual({ type: 'none' })
    expect(resolveBeadsListKey('Enter', ROWS, -1)).toEqual({ type: 'none' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/components/task-page/beads/beads-list-keyboard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/renderer/src/components/task-page/beads/beads-list-keyboard.ts`:
```ts
import type { BeadsListRow } from './beads-tree-rows'

export type BeadsListKeyAction =
  | { type: 'select'; index: number }
  | { type: 'expand'; key: string }
  | { type: 'collapse'; key: string }
  | { type: 'open'; index: number }
  | { type: 'none' }

const NONE: BeadsListKeyAction = { type: 'none' }

function clampIndex(index: number, rows: readonly BeadsListRow[]): number {
  return Math.min(Math.max(index, 0), rows.length - 1)
}

export function resolveBeadsListKey(
  key: string,
  rows: readonly BeadsListRow[],
  currentIndex: number
): BeadsListKeyAction {
  if (rows.length === 0) {
    return NONE
  }
  switch (key) {
    case 'ArrowDown':
      return { type: 'select', index: clampIndex(currentIndex + 1, rows) }
    case 'ArrowUp':
      return { type: 'select', index: clampIndex(currentIndex - 1, rows) }
    case 'Home':
      return { type: 'select', index: 0 }
    case 'End':
      return { type: 'select', index: rows.length - 1 }
    default:
      break
  }
  const row = rows[currentIndex]
  if (!row) {
    return NONE
  }
  if (key === 'ArrowRight') {
    if (!row.hasChildren) {
      return NONE
    }
    return row.expanded
      ? { type: 'select', index: clampIndex(currentIndex + 1, rows) }
      : { type: 'expand', key: row.key }
  }
  if (key === 'ArrowLeft') {
    if (row.hasChildren && row.expanded) {
      return { type: 'collapse', key: row.key }
    }
    const parentIndex = row.parentKey ? rows.findIndex((entry) => entry.key === row.parentKey) : -1
    return parentIndex >= 0 ? { type: 'select', index: parentIndex } : NONE
  }
  if (key === 'Enter') {
    if (row.kind === 'issue') {
      return { type: 'open', index: currentIndex }
    }
    return row.expanded ? { type: 'collapse', key: row.key } : { type: 'expand', key: row.key }
  }
  return NONE
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test src/renderer/src/components/task-page/beads/beads-list-keyboard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/task-page/beads/beads-list-keyboard.ts src/renderer/src/components/task-page/beads/beads-list-keyboard.test.ts
git commit -m "feat(beads): resolve beads list keyboard navigation"
```

---

### Task 8: Status visuals, issue rows and the virtualized list pane

**Files:**
- Create: `src/renderer/src/components/task-page/beads/beads-status-visuals.ts`
- Create: `src/renderer/src/components/task-page/beads/BeadsIssueRow.tsx`
- Create: `src/renderer/src/components/task-page/beads/BeadsListPane.tsx`
- Test: `src/renderer/src/components/task-page/beads/BeadsListPane.test.tsx`

**Interfaces:**
- Consumes: `BeadsSchema`, `BeadsStatusCategory` (shared), `beadsStatusCategory(schema, status)` from `src/shared/beads/beads-schema.ts`; Task 6 row types and `BeadsProgress`; Task 7 `resolveBeadsListKey`; `useVirtualizer` from `@tanstack/react-virtual`; `cn` from `@/lib/utils`; `translate` from `@/i18n/i18n`; `Button` from `@/components/ui/button`; `isEditableTarget(target: EventTarget | null): boolean` from `@/lib/editable-target`.
- Produces:
  - `beadsStatusIcon(category: BeadsStatusCategory): LucideIcon` (active `Circle`, wip `CircleDot`, frozen `Snowflake`, done `CircleCheck`)
  - `beadsStatusToneClass(category: BeadsStatusCategory): string` (active `text-muted-foreground`, wip `text-foreground`, frozen `text-muted-foreground`, done `text-status-success`)
  - `BeadsIssueRow(props: { row: BeadsListRow; schema: BeadsSchema; progress: BeadsProgress | null; mode: BeadsListMode; current: boolean; onSelect: (key: string) => void; onToggle: (key: string, expand: boolean) => void }): React.JSX.Element` — row element has `id={beadsRowDomId(row.key)}`, `role="option"`, `aria-selected`, `data-current`
  - `beadsRowDomId(key: string): string` (exported from `BeadsIssueRow.tsx`; prefixes `beads-row-` and escapes every non-alphanumeric character as `_<hex>`, so distinct bd ids never collide)
  - `BeadsListPane(props: { rows: BeadsListRow[]; schema: BeadsSchema; progressByParent: ReadonlyMap<string, BeadsProgress>; mode: BeadsListMode; currentKey: string | null; hasMore: boolean; loading: boolean; onSelectKey: (key: string) => void; onToggleKey: (key: string, expand: boolean) => void; onOpenKey: (key: string) => void; onLoadMore: () => void }): React.JSX.Element`

- [ ] **Step 1: Write the failing test**

`src/renderer/src/components/task-page/beads/BeadsListPane.test.tsx`:
```tsx
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FALLBACK_BEADS_SCHEMA } from '../../../../../shared/beads/beads-schema'
import type { BeadsIssue } from '../../../../../shared/beads/beads-issue-types'
import { BeadsListPane } from './BeadsListPane'
import { buildBeadsListRows } from './beads-tree-rows'

// Why: a mock that always renders every row cannot tell "current row rendered" from
// "current row virtualized out", and would pass even if the component ignored the
// virtualizer entirely. `virtual.window` narrows the rendered slice on demand, and
// scrollToIndex is a stable spy so the scroll-into-view effect can be asserted.
// Why a full-range window instead of `null`: a nullable property would need either a
// type assertion (which the repo forbids) or an annotation, because TypeScript narrows
// an initializer of `null` to `null`. A default window that spans everything keeps the
// type plain `{ start: number; end: number }` and needs neither.
const virtual = vi.hoisted(() => ({
  window: { start: 0, end: Number.MAX_SAFE_INTEGER },
  scrollToIndex: vi.fn((_index: number) => {})
}))

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () => {
      const items = Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 36
      }))
      return items.slice(virtual.window.start, virtual.window.end)
    },
    measureElement: () => {},
    scrollToIndex: virtual.scrollToIndex
  })
}))

afterEach(() => {
  cleanup()
  virtual.window = { start: 0, end: Number.MAX_SAFE_INTEGER }
  virtual.scrollToIndex.mockClear()
})

function issue(id: string, parent?: string): BeadsIssue {
  return {
    id,
    title: `Title ${id}`,
    status: id === 'c1' ? 'closed' : 'open',
    priority: 1,
    issueType: 'task',
    labels: ['ui'],
    parent,
    createdAt: '',
    updatedAt: '',
    dependencyCount: 0,
    dependentCount: 0,
    commentCount: 0,
    blockedBy: [],
    dependencyEdges: []
  }
}

function renderPane(overrides: Partial<Parameters<typeof BeadsListPane>[0]> = {}) {
  const rows = buildBeadsListRows({
    issues: [issue('e1'), issue('c1', 'e1'), issue('x')],
    index: null,
    mode: 'tree',
    collapsed: new Set()
  })
  const props = {
    rows,
    schema: FALLBACK_BEADS_SCHEMA,
    progressByParent: new Map([['e1', { closed: 1, total: 2 }]]),
    mode: 'tree' as const,
    currentKey: 'issue:e1',
    hasMore: false,
    loading: false,
    onSelectKey: vi.fn(),
    onToggleKey: vi.fn(),
    onOpenKey: vi.fn(),
    onLoadMore: vi.fn(),
    ...overrides
  }
  render(<BeadsListPane {...props} />)
  return props
}

describe('BeadsListPane', () => {
  it('renders rows with ids, titles, priority and epic progress', () => {
    renderPane()
    // 'issue:e1' → ':' escaped as _3a, so `cwf.3` and `cwf-3` cannot collide.
    expect(screen.getByRole('listbox')).toHaveAttribute(
      'aria-activedescendant',
      'beads-row-issue_3ae1'
    )
    expect(screen.getByText('Title c1')).toBeInTheDocument()
    expect(screen.getAllByText('P1')).toHaveLength(3)
    expect(screen.getByText('1/2')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Title e1/ })).toHaveAttribute('data-current', 'true')
  })

  it('drops aria-activedescendant when the current key matches no row', () => {
    renderPane({ currentKey: 'issue:not-rendered' })
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-activedescendant')
  })

  it('renders only the virtual window and drops aria-activedescendant for a row outside it', () => {
    // The row exists in the data; the virtualizer just has not rendered it. Pointing
    // aria-activedescendant at an id with no DOM node announces nothing.
    virtual.window = { start: 0, end: 1 }
    renderPane({ currentKey: 'issue:c1' })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-activedescendant')
  })

  it('scrolls the current row into view when the selection changes', () => {
    renderPane({ currentKey: 'issue:x' })
    expect(virtual.scrollToIndex).toHaveBeenCalledWith(2)
  })

  it('hides the expand chevron from assistive tech (the option owns the row)', () => {
    renderPane()
    expect(screen.queryByRole('button', { name: /Collapse e1/ })).toBeNull()
    expect(screen.getByRole('option', { name: /Title e1/ }).textContent).not.toContain('Collapse')
  })

  it('navigates with the keyboard', () => {
    const props = renderPane()
    const list = screen.getByRole('listbox')
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(props.onSelectKey).toHaveBeenCalledWith('issue:c1')
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(props.onToggleKey).toHaveBeenCalledWith('issue:e1', false)
    fireEvent.keyDown(list, { key: 'Enter' })
    expect(props.onOpenKey).toHaveBeenCalledWith('issue:e1')
  })

  it('selects on click and toggles with the chevron without selecting', () => {
    const props = renderPane()
    fireEvent.click(screen.getByText('Title x'))
    expect(props.onSelectKey).toHaveBeenCalledWith('issue:x')
    // The chevron is aria-hidden (it lives inside a role="option"), so it is invisible
    // to role queries by design — reach it by its title instead.
    fireEvent.click(screen.getByTitle('Collapse e1'))
    expect(props.onToggleKey).toHaveBeenCalledWith('issue:e1', false)
    expect(props.onSelectKey).toHaveBeenCalledTimes(1)
  })

  it('offers Load more when there are more rows', () => {
    const props = renderPane({ hasMore: true })
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    expect(props.onLoadMore).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/components/task-page/beads/BeadsListPane.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement status visuals**

`src/renderer/src/components/task-page/beads/beads-status-visuals.ts`:
```ts
import { Circle, CircleCheck, CircleDot, Snowflake, type LucideIcon } from 'lucide-react'
import type { BeadsStatusCategory } from '../../../../../shared/beads/beads-issue-types'

export function beadsStatusIcon(category: BeadsStatusCategory): LucideIcon {
  switch (category) {
    case 'active':
      return Circle
    case 'wip':
      return CircleDot
    case 'frozen':
      return Snowflake
    case 'done':
      return CircleCheck
  }
}

export function beadsStatusToneClass(category: BeadsStatusCategory): string {
  switch (category) {
    case 'active':
      return 'text-muted-foreground'
    case 'wip':
      return 'text-foreground'
    case 'frozen':
      return 'text-muted-foreground'
    case 'done':
      return 'text-status-success'
  }
}
```

- [ ] **Step 4: Implement the row**

`src/renderer/src/components/task-page/beads/BeadsIssueRow.tsx`:
```tsx
import { ChevronDown } from 'lucide-react'
import { beadsStatusCategory } from '../../../../../shared/beads/beads-schema'
import type { BeadsSchema } from '../../../../../shared/beads/beads-issue-types'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { beadsStatusIcon, beadsStatusToneClass } from './beads-status-visuals'
import type { BeadsListMode, BeadsListRow, BeadsProgress } from './beads-tree-rows'

const INDENT_PX = 16

// Why: bd ids allow '.', '_' and '-', so folding them all to '-' makes `cwf.3` and
// `cwf-3` the same DOM id and aria-activedescendant points at the wrong row.
export function beadsRowDomId(key: string): string {
  return `beads-row-${key.replace(/[^A-Za-z0-9]/g, (char) => `_${char.charCodeAt(0).toString(16)}`)}`
}

type BeadsIssueRowProps = {
  row: BeadsListRow
  schema: BeadsSchema
  progress: BeadsProgress | null
  mode: BeadsListMode
  current: boolean
  onSelect: (key: string) => void
  onToggle: (key: string, expand: boolean) => void
}

export function BeadsIssueRow({
  row,
  schema,
  progress,
  mode,
  current,
  onSelect,
  onToggle
}: BeadsIssueRowProps): React.JSX.Element {
  const id = row.kind === 'issue' ? row.issue.id : row.parentId
  const title = row.kind === 'issue' ? row.issue.title : (row.parent?.title ?? id)
  const toggleLabel = row.expanded
    ? translate('auto.components.task-page.beads.collapseRow', 'Collapse {{id}}', { id })
    : translate('auto.components.task-page.beads.expandRow', 'Expand {{id}}', { id })
  const category = row.kind === 'issue' ? beadsStatusCategory(schema, row.issue.status) : null
  const StatusIcon = category ? beadsStatusIcon(category) : null
  return (
    <div
      id={beadsRowDomId(row.key)}
      role="option"
      aria-selected={current}
      data-current={current ? 'true' : undefined}
      onClick={() => onSelect(row.key)}
      className={cn(
        'group/row flex h-9 cursor-pointer items-center gap-2 pr-3 text-[13px] transition hover:bg-accent',
        current && 'bg-accent'
      )}
      style={{ paddingLeft: row.depth * INDENT_PX + 8 }}
    >
      {row.hasChildren ? (
        <button
          type="button"
          // Why: this row is a `role="option"`; its children are presentational, so an
          // AT user can neither reach this button nor benefit from its label leaking
          // into the option name. Left/Right on the listbox does the same job.
          aria-hidden
          tabIndex={-1}
          title={toggleLabel}
          onClick={(event) => {
            event.stopPropagation()
            onToggle(row.key, !row.expanded)
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={cn('size-3.5 transition-transform', !row.expanded && '-rotate-90')} />
        </button>
      ) : (
        <span aria-hidden className="size-5 shrink-0" />
      )}
      {StatusIcon && category ? (
        {/* createElement, not <StatusIcon/>: react/static-components (error) rejects a
            component value created during render. */}
        {React.createElement(StatusIcon, {
          'aria-hidden': true,
          className: cn('size-3.5 shrink-0', beadsStatusToneClass(category))
        })}
      ) : null}
      <span className="shrink-0 font-mono text-[12px] text-muted-foreground">{id}</span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          row.kind === 'context' ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {title}
      </span>
      {row.kind === 'issue' && mode === 'flat' && row.issue.parent ? (
        <span className="shrink-0 rounded-full border border-border/60 bg-muted/50 px-1.5 text-[11px] text-muted-foreground">
          {row.issue.parent}
        </span>
      ) : null}
      {row.kind === 'issue' && row.issue.blockedBy.length > 0 ? (
        <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 text-[11px] text-destructive">
          {translate('auto.components.task-page.beads.blockedCount', 'Blocked by {{count}}', {
            count: row.issue.blockedBy.length
          })}
        </span>
      ) : null}
      {progress ? (
        <span className="shrink-0 text-[12px] text-muted-foreground">
          {`${progress.closed}/${progress.total}`}
        </span>
      ) : null}
      {row.kind === 'issue' ? (
        <span className="shrink-0 text-[12px] text-muted-foreground">{`P${row.issue.priority}`}</span>
      ) : null}
    </div>
  )
}
```

Note the test expects `P1` three times (every row in the fixture has priority 1 and there is no context row) and the option accessible name to contain the title; the id and title spans provide it.

- [ ] **Step 5: Implement the list pane**

`src/renderer/src/components/task-page/beads/BeadsListPane.tsx`:
```tsx
import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2 } from 'lucide-react'
import type { BeadsSchema } from '../../../../../shared/beads/beads-issue-types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { isEditableTarget } from '@/lib/editable-target'
import { BeadsIssueRow, beadsRowDomId } from './BeadsIssueRow'
import { resolveBeadsListKey } from './beads-list-keyboard'
import type { BeadsListMode, BeadsListRow, BeadsProgress } from './beads-tree-rows'

const ROW_HEIGHT_PX = 36

type BeadsListPaneProps = {
  rows: BeadsListRow[]
  schema: BeadsSchema
  progressByParent: ReadonlyMap<string, BeadsProgress>
  mode: BeadsListMode
  currentKey: string | null
  hasMore: boolean
  loading: boolean
  onSelectKey: (key: string) => void
  onToggleKey: (key: string, expand: boolean) => void
  onOpenKey: (key: string) => void
  onLoadMore: () => void
}

export function BeadsListPane(props: BeadsListPaneProps): React.JSX.Element {
  const { rows, currentKey, onSelectKey, onToggleKey, onOpenKey } = props
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 12
  })
  const currentIndex = currentKey ? rows.findIndex((row) => row.key === currentKey) : -1
  const virtualItems = virtualizer.getVirtualItems()
  // Why: aria-activedescendant must name an element that exists. Outside the virtual
  // window (selection from the relations list, or after Load more) it does not, and
  // screen readers then announce nothing at all.
  const currentRendered = virtualItems.some((item) => item.index === currentIndex)

  useEffect(() => {
    if (currentIndex >= 0) {
      virtualizer.scrollToIndex(currentIndex)
    }
    // `useVirtualizer` keeps one instance for the component's life, so it is a safe dep.
  }, [currentKey, currentIndex, virtualizer])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (isEditableTarget(event.target)) {
      return
    }
    const action = resolveBeadsListKey(event.key, rows, currentIndex)
    if (action.type === 'none') {
      return
    }
    event.preventDefault()
    if (action.type === 'select') {
      onSelectKey(rows[action.index].key)
      virtualizer.scrollToIndex(action.index)
    } else if (action.type === 'expand' || action.type === 'collapse') {
      onToggleKey(action.key, action.type === 'expand')
    } else {
      onOpenKey(rows[action.index].key)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        role="listbox"
        tabIndex={0}
        aria-label={translate('auto.components.task-page.beads.listLabel', 'Beads issues')}
        aria-activedescendant={
          currentIndex >= 0 && currentRendered ? beadsRowDomId(rows[currentIndex].key) : undefined
        }
        onKeyDown={handleKeyDown}
        className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map((item) => {
            const row = rows[item.index]
            return (
              <div
                key={row.key}
                className="absolute left-0 right-0 top-0"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <BeadsIssueRow
                  row={row}
                  schema={props.schema}
                  // An epic whose children are filtered out still shows closed/total from the index.
                  progress={row.kind === 'issue' ? (props.progressByParent.get(row.issue.id) ?? null) : (props.progressByParent.get(row.parentId) ?? null)}
                  mode={props.mode}
                  current={row.key === currentKey}
                  onSelect={onSelectKey}
                  onToggle={onToggleKey}
                />
              </div>
            )
          })}
        </div>
      </div>
      {props.hasMore || props.loading ? (
        <div className="flex h-10 shrink-0 items-center justify-center border-t border-border/50">
          {props.loading ? (
            <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <Button variant="ghost" size="sm" onClick={props.onLoadMore}>
              {translate('auto.components.task-page.beads.loadMore', 'Load more')}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
```


- [ ] **Step 6: Run tests, localization sync and lint**

Run:
```bash
pnpm test src/renderer/src/components/task-page/beads/BeadsListPane.test.tsx
pnpm sync:localization-catalog && pnpm sync:localization-runtime-catalog
pnpm exec oxlint src/renderer/src/components/task-page/beads
pnpm run check:code-quality:changed
```
Expected: PASS (6 tests); lint and the design-system scan clean. If `check:code-quality:changed` flags a restyled primitive, move the classes to a plain element or use a variant/size instead.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/task-page/beads/beads-status-visuals.ts src/renderer/src/components/task-page/beads/BeadsIssueRow.tsx src/renderer/src/components/task-page/beads/BeadsListPane.tsx src/renderer/src/components/task-page/beads/BeadsListPane.test.tsx src/renderer/src/i18n
git commit -m "feat(beads): render the beads issue list with keyboard navigation"
```

---

### Task 9: Filters bar

**Files:**
- Create: `src/renderer/src/components/task-page/beads/BeadsFiltersBar.tsx`
- Test: `src/renderer/src/components/task-page/beads/BeadsFiltersBar.test.tsx`

**Interfaces:**
- Consumes: Task 5 (`BEADS_PRESETS`, `BeadsPreset`, `BeadsFilterValues`, `EMPTY_BEADS_FILTERS`, `supportedBeadsFilterKeys`, `countActiveBeadsFilters`); Task 6 `BeadsListMode`; `BeadsSchema`, `BeadsListView`; UI primitives `Button`, `Input`, `ToggleGroup`/`ToggleGroupItem`, `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuLabel`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, `DropdownMenuCheckboxItem`, `DropdownMenuSeparator`; lucide `RefreshCw`, `Search`, `ListTree`, `List`, `ChevronDown`, `X`.
- Produces: `BeadsFiltersBar(props: BeadsFiltersBarProps): React.JSX.Element` with
  ```ts
  type BeadsFiltersBarProps = {
    preset: BeadsPreset
    onPresetChange: (preset: BeadsPreset) => void
    text: string
    onTextChange: (text: string) => void
    filters: BeadsFilterValues
    onFiltersChange: (filters: BeadsFilterValues) => void
    view: BeadsListView
    schema: BeadsSchema
    labelOptions: readonly string[]
    epicOptions: readonly { id: string; title: string }[]
    mode: BeadsListMode
    onModeChange: (mode: BeadsListMode) => void
    refreshing: boolean
    onRefresh: () => void
  }
  ```

Behavior:
- Preset buttons in `BEADS_PRESETS` order, each `aria-pressed` when active. Labels: Ready, In progress, Blocked, All open, Closed.
- Search `Input` (placeholder "Search beads"), controlled by `text`.
- Dropdown triggers for Type, Priority, Epic, Labels; each trigger is **disabled** when `supportedBeadsFilterKeys(view)` does not include its key, with `title` "Not available for this view". Type options come from `schema.types` (names), Priority 0–4 as `P0`…`P4`, Epic from `epicOptions`, Labels from `labelOptions` (checkbox, multiple). Each single-choice dropdown has an "Any" radio item that sets the value back to `null`.
- Assignee: a small `Input` (placeholder "Assignee"), disabled when unsupported.
- "Clear filters" button shown only when `countActiveBeadsFilters(filters, view) > 0`; it calls `onFiltersChange(EMPTY_BEADS_FILTERS)`.
- Mode `ToggleGroup type="single"` with items Tree / Flat (`aria-label`s "Tree view", "Flat view"); ignore empty values from Radix (re-clicking the active item).
- Refresh icon `Button variant="ghost" size="icon-sm"` with `aria-label` "Refresh", spinning icon while `refreshing`.
- Keep primitive `className`s layout-only (e.g. `className="w-56"` on `Input` is fine; no padding/color classes on primitives). Style the preset buttons as plain `<button>` elements with token classes: idle `text-muted-foreground hover:bg-accent`, active `bg-accent text-foreground`, `rounded-full px-2.5 h-7 text-[12px]`.

- [ ] **Step 1: Write the failing test**

`src/renderer/src/components/task-page/beads/BeadsFiltersBar.test.tsx`:
```tsx
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FALLBACK_BEADS_SCHEMA } from '../../../../../shared/beads/beads-schema'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BeadsFiltersBar } from './BeadsFiltersBar'
import { EMPTY_BEADS_FILTERS } from './beads-list-request'

afterEach(cleanup)

function renderBar(overrides: Partial<Parameters<typeof BeadsFiltersBar>[0]> = {}) {
  const props = {
    preset: 'ready' as const,
    onPresetChange: vi.fn(),
    text: '',
    onTextChange: vi.fn(),
    filters: EMPTY_BEADS_FILTERS,
    onFiltersChange: vi.fn(),
    view: 'ready' as const,
    schema: FALLBACK_BEADS_SCHEMA,
    labelOptions: ['ui'],
    epicOptions: [{ id: 'e1', title: 'Epic one' }],
    mode: 'tree' as const,
    onModeChange: vi.fn(),
    refreshing: false,
    onRefresh: vi.fn(),
    ...overrides
  }
  render(
    <TooltipProvider>
      <BeadsFiltersBar {...props} />
    </TooltipProvider>
  )
  return props
}

describe('BeadsFiltersBar', () => {
  it('marks the active preset and switches presets', () => {
    const props = renderBar()
    expect(screen.getByRole('button', { name: 'Ready' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Blocked' }))
    expect(props.onPresetChange).toHaveBeenCalledWith('blocked')
  })

  it('reports search text and mode changes', () => {
    const props = renderBar()
    fireEvent.change(screen.getByPlaceholderText('Search beads'), { target: { value: 'playtest' } })
    expect(props.onTextChange).toHaveBeenCalledWith('playtest')
    fireEvent.click(screen.getByRole('radio', { name: 'Flat view' }))
    expect(props.onModeChange).toHaveBeenCalledWith('flat')
  })

  it('says that search ignores the preset and the epic filter', () => {
    renderBar({ view: 'search', text: 'playtest' })
    expect(
      screen.getByText('Search looks at every issue and ignores the preset and epic filter.')
    ).toBeInTheDocument()
  })

  it('shows a parent that is not in the epic options', () => {
    renderBar({ filters: { ...EMPTY_BEADS_FILTERS, parent: 'orca-q9' }, view: 'list', preset: 'open' })
    expect(screen.getByRole('button', { name: /Epic: orca-q9/ })).toBeInTheDocument()
  })

  it('disables filters the blocked view cannot apply', () => {
    renderBar({ preset: 'blocked', view: 'blocked' })
    expect(screen.getByRole('button', { name: /Type/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Epic/ })).toBeEnabled()
    expect(screen.getByPlaceholderText('Assignee')).toBeDisabled()
  })

  it('clears active filters', () => {
    const props = renderBar({ filters: { ...EMPTY_BEADS_FILTERS, type: 'bug' }, view: 'list', preset: 'open' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(props.onFiltersChange).toHaveBeenCalledWith(EMPTY_BEADS_FILTERS)
  })

  it('refreshes', () => {
    const props = renderBar()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(props.onRefresh).toHaveBeenCalled()
  })
})
```
If Radix `ToggleGroup` items render with role `radio` only when `type="single"` and `rovingFocus`, keep `type="single"`; if the rendered role differs in this Radix version, query by `getByLabelText('Flat view')` instead and note it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/renderer/src/components/task-page/beads/BeadsFiltersBar.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/renderer/src/components/task-page/beads/BeadsFiltersBar.tsx`:
```tsx
import { ChevronDown, List, ListTree, RefreshCw, Search } from 'lucide-react'
import type { BeadsListView } from '../../../../../shared/beads/beads-contract'
import type { BeadsSchema } from '../../../../../shared/beads/beads-issue-types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  BEADS_PRESETS,
  EMPTY_BEADS_FILTERS,
  countActiveBeadsFilters,
  supportedBeadsFilterKeys,
  type BeadsFilterKey,
  type BeadsFilterValues,
  type BeadsPreset
} from './beads-list-request'
import type { BeadsListMode } from './beads-tree-rows'

type BeadsFiltersBarProps = {
  preset: BeadsPreset
  onPresetChange: (preset: BeadsPreset) => void
  text: string
  onTextChange: (text: string) => void
  filters: BeadsFilterValues
  onFiltersChange: (filters: BeadsFilterValues) => void
  view: BeadsListView
  schema: BeadsSchema
  labelOptions: readonly string[]
  epicOptions: readonly { id: string; title: string }[]
  mode: BeadsListMode
  onModeChange: (mode: BeadsListMode) => void
  refreshing: boolean
  onRefresh: () => void
}

const ANY = '__any__'

function presetLabel(preset: BeadsPreset): string {
  switch (preset) {
    case 'ready':
      return translate('auto.components.task-page.beads.presetReady', 'Ready')
    case 'in_progress':
      return translate('auto.components.task-page.beads.presetInProgress', 'In progress')
    case 'blocked':
      return translate('auto.components.task-page.beads.presetBlocked', 'Blocked')
    case 'open':
      return translate('auto.components.task-page.beads.presetOpen', 'All open')
    case 'closed':
      return translate('auto.components.task-page.beads.presetClosed', 'Closed')
  }
}

function FilterTrigger({
  label,
  value,
  disabled
}: {
  label: string
  value: string | null
  disabled: boolean
}): React.JSX.Element {
  return (
    <DropdownMenuTrigger asChild disabled={disabled}>
      <Button
        variant="outline"
        size="xs"
        disabled={disabled}
        title={
          disabled
            ? translate('auto.components.task-page.beads.filterUnavailable', 'Not available for this view')
            : undefined
        }
      >
        {value ? `${label}: ${value}` : label}
        <ChevronDown aria-hidden className="size-3" />
      </Button>
    </DropdownMenuTrigger>
  )
}

export function BeadsFiltersBar(props: BeadsFiltersBarProps): React.JSX.Element {
  const { filters, onFiltersChange, view } = props
  const supported = supportedBeadsFilterKeys(view)
  const unavailable = (key: BeadsFilterKey): boolean => !supported.has(key)
  const setFilter = <K extends keyof BeadsFilterValues>(key: K, value: BeadsFilterValues[K]): void =>
    onFiltersChange({ ...filters, [key]: value })
  // Fall back to the raw id: the index may not be loaded, or the parent may not be an epic.
  const epicTitle = filters.parent ?? null

  return (
    <div className="flex flex-col gap-2 border-b border-border/50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {BEADS_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={props.preset === preset}
            onClick={() => props.onPresetChange(preset)}
            className={cn(
              'h-7 rounded-full px-2.5 text-[12px] transition',
              props.preset === preset
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {presetLabel(preset)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <ToggleGroup
            type="single"
            value={props.mode}
            onValueChange={(value) => {
              if (value === 'tree' || value === 'flat') {
                props.onModeChange(value)
              }
            }}
          >
            <ToggleGroupItem
              value="tree"
              aria-label={translate('auto.components.task-page.beads.treeView', 'Tree view')}
            >
              <ListTree aria-hidden className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="flat"
              aria-label={translate('auto.components.task-page.beads.flatView', 'Flat view')}
            >
              <List aria-hidden className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={translate('auto.components.task-page.beads.refresh', 'Refresh')}
            onClick={props.onRefresh}
          >
            <RefreshCw aria-hidden className={cn('size-3.5', props.refreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={props.text}
            onChange={(event) => props.onTextChange(event.target.value)}
            placeholder={translate('auto.components.task-page.beads.searchPlaceholder', 'Search beads')}
            className="h-7 w-56 rounded-md border border-input bg-transparent pl-7 pr-2 text-[12px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <DropdownMenu>
          <FilterTrigger
            label={translate('auto.components.task-page.beads.filterType', 'Type')}
            value={filters.type}
            disabled={unavailable('type')}
          />
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={filters.type ?? ANY}
              onValueChange={(value) => setFilter('type', value === ANY ? null : value)}
            >
              <DropdownMenuRadioItem value={ANY}>
                {translate('auto.components.task-page.beads.filterAny', 'Any')}
              </DropdownMenuRadioItem>
              {props.schema.types.map((type) => (
                <DropdownMenuRadioItem key={type.name} value={type.name}>
                  {type.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <FilterTrigger
            label={translate('auto.components.task-page.beads.filterPriority', 'Priority')}
            value={filters.priority === null ? null : `P${filters.priority}`}
            disabled={unavailable('priority')}
          />
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={filters.priority === null ? ANY : String(filters.priority)}
              onValueChange={(value) => setFilter('priority', value === ANY ? null : Number(value))}
            >
              <DropdownMenuRadioItem value={ANY}>
                {translate('auto.components.task-page.beads.filterAny', 'Any')}
              </DropdownMenuRadioItem>
              {[0, 1, 2, 3, 4].map((priority) => (
                <DropdownMenuRadioItem key={priority} value={String(priority)}>
                  {`P${priority}`}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <FilterTrigger
            label={translate('auto.components.task-page.beads.filterEpic', 'Epic')}
            value={epicTitle}
            disabled={unavailable('parent')}
          />
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={filters.parent ?? ANY}
              onValueChange={(value) => setFilter('parent', value === ANY ? null : value)}
            >
              <DropdownMenuRadioItem value={ANY}>
                {translate('auto.components.task-page.beads.filterAny', 'Any')}
              </DropdownMenuRadioItem>
              {props.epicOptions.map((epic) => (
                <DropdownMenuRadioItem key={epic.id} value={epic.id}>
                  {`${epic.id} · ${epic.title}`}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <FilterTrigger
            label={translate('auto.components.task-page.beads.filterLabels', 'Labels')}
            value={filters.labels.length > 0 ? filters.labels.join(', ') : null}
            disabled={unavailable('labels')}
          />
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>
              {translate('auto.components.task-page.beads.filterLabelsHint', 'Issues must have all selected labels')}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {props.labelOptions.map((label) => (
              <DropdownMenuCheckboxItem
                key={label}
                checked={filters.labels.includes(label)}
                onCheckedChange={(checked) =>
                  setFilter(
                    'labels',
                    checked === true
                      ? [...filters.labels, label]
                      : filters.labels.filter((entry) => entry !== label)
                  )
                }
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          value={filters.assignee}
          disabled={unavailable('assignee')}
          onChange={(event) => setFilter('assignee', event.target.value)}
          placeholder={translate('auto.components.task-page.beads.filterAssignee', 'Assignee')}
          className="h-7 w-32 rounded-md border border-input bg-transparent px-2 text-[12px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
        {countActiveBeadsFilters(filters, view) > 0 ? (
          <Button variant="ghost" size="xs" onClick={() => onFiltersChange(EMPTY_BEADS_FILTERS)}>
            {translate('auto.components.task-page.beads.clearFilters', 'Clear filters')}
          </Button>
        ) : null}
        {view === 'search' ? (
          // Why: `bd search` ignores the preset and the epic filter; without this the
          // highlighted "Ready" button silently lies about what is on screen.
          <span className="text-[12px] text-muted-foreground">
            {translate(
              'auto.components.task-page.beads.searchOverridesPreset',
              'Search looks at every issue and ignores the preset and epic filter.'
            )}
          </span>
        ) : null}
      </div>
    </div>
  )
}
```

Notes for the implementer:
- The two text fields are plain `<input>` elements on purpose: `shadcn/no-restyle` forbids padding/size classes on the `Input` primitive, and these fields need a compact 28 px height with an icon inset. If the design-system scan still flags them, switch to `<Input className="w-56" />` and accept the default height.
- **Pass no `className` to `DropdownMenuContent` and add no scroll wrapper.** The primitive already ships `max-h-(--radix-dropdown-menu-content-available-height) overflow-x-hidden overflow-y-auto scrollbar-sleek` in its base classes (`src/renderer/src/components/ui/dropdown-menu.tsx:34`), so the Epic and Labels menus scroll correctly on their own, capped to the space actually available on screen. Adding `max-h-72 overflow-y-auto` there trips `shadcn/no-restyle`, and adding `scrollbar-sleek` to satisfy `require-styled-vertical-scrollbar` trips it too — both rules are already satisfied by the primitive itself, so the right amount of code is none.
- The `epicTitle` value shows the selected epic's id on the trigger (titles can be long), taken straight from `filters.parent` so a parent that is not in `epicOptions` — index still loading, or a non-epic parent — still reads back.
- If the file exceeds 400 lines after formatting, move `presetLabel` and `FilterTrigger` into `beads-filters-bar-parts.tsx`.

- [ ] **Step 4: Run tests and lint**

Run:
```bash
pnpm test src/renderer/src/components/task-page/beads/BeadsFiltersBar.test.tsx
pnpm sync:localization-catalog && pnpm sync:localization-runtime-catalog
pnpm exec oxlint src/renderer/src/components/task-page/beads/BeadsFiltersBar.tsx
pnpm run check:code-quality:changed
```
Expected: PASS (7 tests); lint and design-system scan clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/task-page/beads/BeadsFiltersBar.tsx src/renderer/src/components/task-page/beads/BeadsFiltersBar.test.tsx src/renderer/src/i18n
git commit -m "feat(beads): add presets, filters, search and view mode to the beads tab"
```

---

### Task 10: Detail pane

**Files:**
- Create: `src/renderer/src/components/task-page/beads/beads-detail-relations.ts`
- Create: `src/renderer/src/components/task-page/beads/BeadsDetailSections.tsx`
- Create: `src/renderer/src/components/task-page/beads/BeadsDetailPane.tsx`
- Test: `src/renderer/src/components/task-page/beads/beads-detail-relations.test.ts`, `src/renderer/src/components/task-page/beads/BeadsDetailPane.test.tsx`

**Interfaces:**
- Consumes: `BeadsIssueDetails`, `BeadsIssueRelation`, `BeadsSchema` (shared); `beadsStatusCategory` (`src/shared/beads/beads-schema.ts`); Task 8 `beadsStatusIcon`/`beadsStatusToneClass`; Task 4 store (`useAppStore`, `loadBeadsDetails`; `selectBeadsRepoState` from `@/store/slices/beads-load-state`); `BeadsRepoRef` (Task 3); `CommentMarkdown` default export from `@/components/sidebar/CommentMarkdown` (props `content`, `variant="document"`, `className`); `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`; `window.api.ui.writeClipboardText(text)`; `toast` from `sonner`.
- Produces:
  - `type BeadsDetailRelations = { parent: BeadsIssueRelation | null; blockers: BeadsIssueRelation[]; openBlockers: BeadsIssueRelation[]; children: BeadsIssueRelation[]; blocks: BeadsIssueRelation[]; related: BeadsIssueRelation[] }`
  - `groupBeadsRelations(details: BeadsIssueDetails, schema: BeadsSchema): BeadsDetailRelations`
  - `BeadsDetailSections(props: { details: BeadsIssueDetails; schema: BeadsSchema; onOpenIssue: (id: string) => void }): React.JSX.Element`
  - `BeadsDetailPane(props: { repo: BeadsRepoRef; issueId: string; schema: BeadsSchema; onOpenIssue: (id: string) => void }): React.JSX.Element`

Content (spec §4.2, read-only parts):
1. Header: mono ID (a button "Copy ID" copies it and shows a success toast), type, `P<n>`, status with icon, labels as `Badge variant="outline"`; title below (14 px, medium).
2. Blocked callout when `openBlockers.length > 0`: `bg-destructive/10 text-destructive` box, "Blocked by", then one row per open blocker with ID, title and an "Open" button (calls `onOpenIssue`). ("Start blocker" is M3.)
3. Mini dependency graph ("Relations"): grouped row lists — Parent, Blocked by (all blockers), Blocks, Children, Related — each row a button `onOpenIssue(id)` with status icon, mono id, truncated title, and the dependency type for Related. Empty groups are omitted; if all are empty show "No relations".
4. Text sections: Description, Design, Acceptance criteria, Notes — each a `Collapsible` (open by default for Description and Acceptance, closed for Design and Notes), body rendered with `CommentMarkdown variant="document" className="text-[14px] leading-relaxed"`; omit sections with no text; if all are empty show "No description".
5. Comments: count heading and a list (author, relative-free ISO date text, markdown body via `CommentMarkdown variant="compact"`); "No comments" when empty.

- [ ] **Step 1: Write the failing tests**

`src/renderer/src/components/task-page/beads/beads-detail-relations.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FALLBACK_BEADS_SCHEMA } from '../../../../../shared/beads/beads-schema'
import type { BeadsIssueDetails } from '../../../../../shared/beads/beads-issue-types'
import { groupBeadsRelations } from './beads-detail-relations'

function relation(id: string, dependencyType: string, status = 'open') {
  return { id, title: `Title ${id}`, status, priority: 2, issueType: 'task', dependencyType }
}

const DETAILS: BeadsIssueDetails = {
  issue: {
    id: 'cwf.3',
    title: 'Run the playtest',
    status: 'open',
    priority: 2,
    issueType: 'task',
    labels: [],
    createdAt: '',
    updatedAt: '',
    dependencyCount: 3,
    dependentCount: 2,
    commentCount: 0,
    blockedBy: [],
    dependencyEdges: []
  },
  dependencies: [
    relation('cwf', 'parent-child'),
    relation('cwf.1', 'blocks'),
    relation('cwf.9', 'blocks', 'closed'),
    relation('x.1', 'related')
  ],
  dependents: [relation('cwf.4', 'blocks'), relation('cwf.3.1', 'parent-child'), relation('d.2', 'discovered-from')],
  comments: []
}

describe('groupBeadsRelations', () => {
  it('splits parent, blockers, open blockers, blocks, children and related', () => {
    const groups = groupBeadsRelations(DETAILS, FALLBACK_BEADS_SCHEMA)
    expect(groups.parent?.id).toBe('cwf')
    expect(groups.blockers.map((entry) => entry.id)).toEqual(['cwf.1', 'cwf.9'])
    expect(groups.openBlockers.map((entry) => entry.id)).toEqual(['cwf.1'])
    expect(groups.blocks.map((entry) => entry.id)).toEqual(['cwf.4'])
    expect(groups.children.map((entry) => entry.id)).toEqual(['cwf.3.1'])
    expect(groups.related.map((entry) => entry.id)).toEqual(['x.1', 'd.2'])
  })
})
```

`src/renderer/src/components/task-page/beads/BeadsDetailPane.test.tsx`:
```tsx
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { FALLBACK_BEADS_SCHEMA } from '../../../../../shared/beads/beads-schema'

const mocks = vi.hoisted(() => {
  // Typed local, not `as`: the repo forbids type assertions. Unlike a `null`
  // initializer (which narrows to `null`), `{}` keeps the declared record type.
  const state: Record<string, unknown> = {}
  return { state, loadBeadsDetails: vi.fn() }
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))

vi.mock('@/components/sidebar/CommentMarkdown', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>
}))

import { BeadsDetailPane } from './BeadsDetailPane'

const REPO = { id: 'r1', path: '/work/app', connectionId: null, executionHostId: null }

const DETAILS: BeadsIssueDetails = {
  issue: {
    id: 'cwf.3',
    title: 'Run the playtest',
    description: 'Recruit families',
    acceptanceCriteria: 'Notes recorded',
    status: 'open',
    priority: 2,
    issueType: 'task',
    labels: ['evaluation'],
    createdAt: '',
    updatedAt: '',
    dependencyCount: 1,
    dependentCount: 0,
    commentCount: 1,
    blockedBy: [],
    dependencyEdges: []
  },
  dependencies: [
    { id: 'cwf.1', title: 'Decide store line', status: 'open', priority: 1, issueType: 'task', dependencyType: 'blocks' }
  ],
  dependents: [],
  comments: [{ id: 'c1', author: 'ada', text: 'Looks good', createdAt: '2026-09-15T10:00:00Z' }]
}

function installState(entry: unknown) {
  mocks.state = {
    beadsRepos: { r1: { status: {}, schema: {}, changeToken: 'h1', lists: {}, details: { 'cwf.3': entry } } },
    loadBeadsDetails: mocks.loadBeadsDetails
  }
}

beforeEach(() => {
  vi.stubGlobal('window', Object.assign(window, { api: { ui: { writeClipboardText: vi.fn() } } }))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('BeadsDetailPane', () => {
  it('loads details for the issue and shows a spinner meanwhile', () => {
    installState(undefined)
    render(<BeadsDetailPane repo={REPO} issueId="cwf.3" schema={FALLBACK_BEADS_SCHEMA} onOpenIssue={vi.fn()} />)
    expect(mocks.loadBeadsDetails).toHaveBeenCalledWith(REPO, 'cwf.3')
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('renders header, blocked callout, relations, text and comments', () => {
    installState({ data: DETAILS, error: null, loading: false, token: 'h1' })
    const onOpenIssue = vi.fn()
    render(<BeadsDetailPane repo={REPO} issueId="cwf.3" schema={FALLBACK_BEADS_SCHEMA} onOpenIssue={onOpenIssue} />)
    expect(screen.getByText('Run the playtest')).toBeInTheDocument()
    expect(screen.getByText('evaluation')).toBeInTheDocument()
    // Callout heading and the "Blocked by" relation group both render the label.
    expect(screen.getAllByText('Blocked by')).toHaveLength(2)
    expect(screen.getByText('Recruit families')).toBeInTheDocument()
    expect(screen.getByText('Looks good')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /cwf\.1/ })[0])
    expect(onOpenIssue).toHaveBeenCalledWith('cwf.1')
  })

  it('shows the error message', () => {
    installState({ data: null, error: { kind: 'not-found', message: 'Issue cwf.3 was not found.' }, loading: false, token: null })
    render(<BeadsDetailPane repo={REPO} issueId="cwf.3" schema={FALLBACK_BEADS_SCHEMA} onOpenIssue={vi.fn()} />)
    expect(screen.getByText('Issue cwf.3 was not found.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/renderer/src/components/task-page/beads/beads-detail-relations.test.ts src/renderer/src/components/task-page/beads/BeadsDetailPane.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement relations grouping**

`src/renderer/src/components/task-page/beads/beads-detail-relations.ts`:
```ts
import { beadsStatusCategory } from '../../../../../shared/beads/beads-schema'
import type {
  BeadsIssueDetails,
  BeadsIssueRelation,
  BeadsSchema
} from '../../../../../shared/beads/beads-issue-types'

export type BeadsDetailRelations = {
  parent: BeadsIssueRelation | null
  blockers: BeadsIssueRelation[]
  openBlockers: BeadsIssueRelation[]
  children: BeadsIssueRelation[]
  blocks: BeadsIssueRelation[]
  related: BeadsIssueRelation[]
}

const STRUCTURAL_TYPES = new Set(['parent-child', 'blocks'])

export function groupBeadsRelations(
  details: BeadsIssueDetails,
  schema: BeadsSchema
): BeadsDetailRelations {
  const blockers = details.dependencies.filter((entry) => entry.dependencyType === 'blocks')
  return {
    parent: details.dependencies.find((entry) => entry.dependencyType === 'parent-child') ?? null,
    blockers,
    openBlockers: blockers.filter((entry) => beadsStatusCategory(schema, entry.status) !== 'done'),
    children: details.dependents.filter((entry) => entry.dependencyType === 'parent-child'),
    blocks: details.dependents.filter((entry) => entry.dependencyType === 'blocks'),
    related: [
      ...details.dependencies.filter((entry) => !STRUCTURAL_TYPES.has(entry.dependencyType)),
      ...details.dependents.filter((entry) => !STRUCTURAL_TYPES.has(entry.dependencyType))
    ]
  }
}
```

- [ ] **Step 4: Implement the sections**

`src/renderer/src/components/task-page/beads/BeadsDetailSections.tsx`:
```tsx
import { ChevronDown, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { beadsStatusCategory } from '../../../../../shared/beads/beads-schema'
import type {
  BeadsIssueDetails,
  BeadsIssueRelation,
  BeadsSchema
} from '../../../../../shared/beads/beads-issue-types'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { groupBeadsRelations } from './beads-detail-relations'
import { beadsStatusIcon, beadsStatusToneClass } from './beads-status-visuals'

type SectionsProps = {
  details: BeadsIssueDetails
  schema: BeadsSchema
  onOpenIssue: (id: string) => void
}

function RelationRow({
  relation,
  schema,
  showType,
  onOpenIssue
}: {
  relation: BeadsIssueRelation
  schema: BeadsSchema
  showType: boolean
  onOpenIssue: (id: string) => void
}): React.JSX.Element {
  const category = beadsStatusCategory(schema, relation.status)
  const Icon = beadsStatusIcon(category)
  return (
    <button
      type="button"
      onClick={() => onOpenIssue(relation.id)}
      className="flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-accent"
    >
      {/* createElement, not <Icon/>: react/static-components (error) rejects a component
          value created during render. Same workaround as BeadsIssueRow.tsx. */}
      {React.createElement(Icon, {
        'aria-hidden': true,
        className: cn('size-3.5 shrink-0', beadsStatusToneClass(category))
      })}
      <span className="shrink-0 font-mono text-[12px] text-muted-foreground">{relation.id}</span>
      <span className="min-w-0 flex-1 truncate">{relation.title}</span>
      {showType ? (
        <span className="shrink-0 text-[12px] text-muted-foreground">{relation.dependencyType}</span>
      ) : null}
    </button>
  )
}

function RelationGroup(props: {
  title: string
  relations: BeadsIssueRelation[]
  schema: BeadsSchema
  showType?: boolean
  onOpenIssue: (id: string) => void
}): React.JSX.Element | null {
  if (props.relations.length === 0) {
    return null
  }
  return (
    <div>
      <p className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {props.title}
      </p>
      {props.relations.map((relation) => (
        <RelationRow
          key={`${relation.dependencyType}:${relation.id}`}
          relation={relation}
          schema={props.schema}
          showType={props.showType ?? false}
          onOpenIssue={props.onOpenIssue}
        />
      ))}
    </div>
  )
}

function TextSection(props: { title: string; text: string | undefined; defaultOpen: boolean }): React.JSX.Element | null {
  if (!props.text?.trim()) {
    return null
  }
  return (
    <Collapsible defaultOpen={props.defaultOpen}>
      {/* asChild: typography and color on the primitive itself trip shadcn/no-restyle (layout only). */}
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-1 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground"
        >
          <ChevronDown aria-hidden className="size-3 transition-transform group-data-[state=closed]:-rotate-90" />
          {props.title}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CommentMarkdown content={props.text} variant="document" className="text-[14px] leading-relaxed" />
      </CollapsibleContent>
    </Collapsible>
  )
}

export function BeadsDetailSections({ details, schema, onOpenIssue }: SectionsProps): React.JSX.Element {
  const { issue } = details
  const groups = groupBeadsRelations(details, schema)
  const category = beadsStatusCategory(schema, issue.status)
  const StatusIcon = beadsStatusIcon(category)
  const hasText = [issue.description, issue.design, issue.acceptanceCriteria, issue.notes].some(
    (text) => text?.trim()
  )
  const hasRelations =
    groups.parent !== null ||
    groups.blockers.length + groups.blocks.length + groups.children.length + groups.related.length > 0

  const copyId = async (): Promise<void> => {
    await window.api.ui.writeClipboardText(issue.id)
    toast.success(translate('auto.components.task-page.beads.copiedId', 'Copied {{id}}', { id: issue.id }))
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <Button
            variant="ghost"
            size="xs"
            aria-label={translate('auto.components.task-page.beads.copyIdLabel', 'Copy issue ID')}
            onClick={() => void copyId()}
          >
            <span className="font-mono">{issue.id}</span>
            <Copy aria-hidden className="size-3" />
          </Button>
          <span>{issue.issueType}</span>
          <span>{`P${issue.priority}`}</span>
          <span className={cn('inline-flex items-center gap-1', beadsStatusToneClass(category))}>
            {React.createElement(StatusIcon, { 'aria-hidden': true, className: 'size-3.5' })}
            {issue.status}
          </span>
          {issue.labels.map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
        <h2 className="text-[14px] font-medium text-foreground">{issue.title}</h2>
      </header>

      {groups.openBlockers.length > 0 ? (
        <section className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
          <p className="text-[12px] font-medium">
            {translate('auto.components.task-page.beads.blockedBy', 'Blocked by')}
          </p>
          {groups.openBlockers.map((blocker) => (
            <div key={blocker.id} className="flex items-center gap-2 text-[13px]">
              <span className="font-mono text-[12px]">{blocker.id}</span>
              <span className="min-w-0 flex-1 truncate">{blocker.title}</span>
              <Button variant="ghost" size="xs" onClick={() => onOpenIssue(blocker.id)}>
                {translate('auto.components.task-page.beads.openIssue', 'Open')}
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      <section aria-label={translate('auto.components.task-page.beads.relations', 'Relations')} className="flex flex-col gap-2">
        <RelationGroup title={translate('auto.components.task-page.beads.relationParent', 'Parent')} relations={groups.parent ? [groups.parent] : []} schema={schema} onOpenIssue={onOpenIssue} />
        <RelationGroup title={translate('auto.components.task-page.beads.relationBlockedBy', 'Blocked by')} relations={groups.blockers} schema={schema} onOpenIssue={onOpenIssue} />
        <RelationGroup title={translate('auto.components.task-page.beads.relationBlocks', 'Blocks')} relations={groups.blocks} schema={schema} onOpenIssue={onOpenIssue} />
        <RelationGroup title={translate('auto.components.task-page.beads.relationChildren', 'Children')} relations={groups.children} schema={schema} onOpenIssue={onOpenIssue} />
        <RelationGroup title={translate('auto.components.task-page.beads.relationRelated', 'Related')} relations={groups.related} schema={schema} showType onOpenIssue={onOpenIssue} />
        {hasRelations ? null : (
          <p className="text-[12px] text-muted-foreground">
            {translate('auto.components.task-page.beads.noRelations', 'No relations')}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <TextSection title={translate('auto.components.task-page.beads.sectionDescription', 'Description')} text={issue.description} defaultOpen />
        <TextSection title={translate('auto.components.task-page.beads.sectionAcceptance', 'Acceptance criteria')} text={issue.acceptanceCriteria} defaultOpen />
        <TextSection title={translate('auto.components.task-page.beads.sectionDesign', 'Design')} text={issue.design} defaultOpen={false} />
        <TextSection title={translate('auto.components.task-page.beads.sectionNotes', 'Notes')} text={issue.notes} defaultOpen={false} />
        {hasText ? null : (
          <p className="text-sm italic text-muted-foreground">
            {translate('auto.components.task-page.beads.noDescription', 'No description')}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {translate('auto.components.task-page.beads.commentsHeading', 'Comments ({{count}})', {
            count: details.comments.length
          })}
        </p>
        {details.comments.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {translate('auto.components.task-page.beads.noComments', 'No comments')}
          </p>
        ) : (
          details.comments.map((comment) => (
            <div key={comment.id} className="rounded-md border border-border/50 px-3 py-2">
              <p className="text-[12px] text-muted-foreground">{`${comment.author} · ${comment.createdAt}`}</p>
              <CommentMarkdown content={comment.text} variant="compact" className="text-[13px] leading-relaxed" />
            </div>
          ))
        )}
      </section>
    </div>
  )
}
```

The `asChild` + plain `<button>` shape above is required, not optional: `config/oxlint-design-system.json` runs `shadcn/no-restyle` with `allow: ["layout"]`, so `text-[11px]`, `font-semibold`, `uppercase` and `text-muted-foreground` on the primitive itself are an error, and `check:code-quality:changed` is the CI gate. `pnpm format` wraps the long `RelationGroup` lines; the file must stay ≤ 400 lines — if not, move `RelationRow`/`RelationGroup`/`TextSection` into `beads-detail-parts.tsx`.

- [ ] **Step 5: Implement the pane**

`src/renderer/src/components/task-page/beads/BeadsDetailPane.tsx`:
```tsx
import { useEffect } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { BeadsSchema } from '../../../../../shared/beads/beads-issue-types'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'
import { useAppStore } from '@/store'
// From beads-load-state, not beads.ts: beads.ts pulls in the runtime client.
import { selectBeadsRepoState } from '@/store/slices/beads-load-state'
import { BeadsDetailSections } from './BeadsDetailSections'

type BeadsDetailPaneProps = {
  repo: BeadsRepoRef
  issueId: string
  schema: BeadsSchema
  onOpenIssue: (id: string) => void
}

export function BeadsDetailPane({ repo, issueId, schema, onOpenIssue }: BeadsDetailPaneProps): React.JSX.Element {
  const entry = useAppStore((state) => selectBeadsRepoState(state, repo.id).details[issueId])
  const changeToken = useAppStore((state) => selectBeadsRepoState(state, repo.id).changeToken)
  const loadBeadsDetails = useAppStore((state) => state.loadBeadsDetails)

  useEffect(() => {
    // Why: changeToken is a dependency so a new bd commit reloads the open issue, and
    // null means the first poll has not answered — loading now would fetch twice.
    if (changeToken === null) {
      return
    }
    void loadBeadsDetails(repo, issueId)
  }, [loadBeadsDetails, repo, issueId, changeToken])

  if (entry?.data) {
    return (
      <div className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        <BeadsDetailSections details={entry.data} schema={schema} onOpenIssue={onOpenIssue} />
      </div>
    )
  }
  if (entry?.error) {
    return (
      <div className="flex items-start gap-2 p-4 text-[13px] text-destructive">
        <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>{entry.error.message}</span>
      </div>
    )
  }
  return (
    <div role="status" aria-busy className="flex flex-1 items-center justify-center p-8">
      <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
    </div>
  )
}
```

The test mocks `@/store`; `selectBeadsRepoState` is imported from `@/store/slices/beads`, which is not mocked — it only reads `state.beadsRepos`, so the mocked state object works. The `repo` object must be stable in callers (Task 12 memoizes it).

- [ ] **Step 6: Run tests and lint**

Run:
```bash
pnpm test src/renderer/src/components/task-page/beads/beads-detail-relations.test.ts src/renderer/src/components/task-page/beads/BeadsDetailPane.test.tsx
pnpm sync:localization-catalog && pnpm sync:localization-runtime-catalog
pnpm exec oxlint src/renderer/src/components/task-page/beads
pnpm run check:code-quality:changed
```
Expected: PASS (4 tests); lint and design-system scan clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/task-page/beads/beads-detail-relations.ts src/renderer/src/components/task-page/beads/beads-detail-relations.test.ts src/renderer/src/components/task-page/beads/BeadsDetailSections.tsx src/renderer/src/components/task-page/beads/BeadsDetailPane.tsx src/renderer/src/components/task-page/beads/BeadsDetailPane.test.tsx src/renderer/src/i18n
git commit -m "feat(beads): show beads issue details with blockers and relations"
```

---

### Task 11: Setup card and split layout

**Files:**
- Create: `src/renderer/src/components/task-page/beads/BeadsSetupCard.tsx`
- Create: `src/renderer/src/components/task-page/beads/BeadsSplitLayout.tsx`
- Test: `src/renderer/src/components/task-page/beads/BeadsSetupCard.test.tsx`, `src/renderer/src/components/task-page/beads/BeadsSplitLayout.test.tsx`

**Interfaces:**
- Consumes: `BeadsLoad<BeadsWorkspaceStatus>` (Task 4); `BEADS_*`-free UI primitives `Button`, `Sheet`, `SheetContent`, `SheetTitle`; `useSidebarResize` from `@/hooks/useSidebarResize`; `useMeasuredWidth` from `@/components/right-sidebar/right-sidebar-measured-width`; `window.api.shell.openUrl(url)`; `window.api.ui.writeClipboardText(text)`; `BeadsIcon` (Task 1).
- Produces:
  - `type BeadsSetupState = 'loading' | 'error' | 'missing' | 'outdated' | 'uninitialized' | 'ready'`
  - `beadsSetupState(status: BeadsLoad<BeadsWorkspaceStatus>): BeadsSetupState`
  - `BeadsSetupCard(props: { status: BeadsLoad<BeadsWorkspaceStatus>; repoName: string; onRecheck: () => void; onHide: () => void }): React.JSX.Element | null` (renders `null` for `ready`)
  - `isBeadsSplitWide(width: number | null): boolean` (`null` → true; `width >= 880`)
  - `BeadsSplitLayout` accepts an optional `detailRef: React.RefObject<HTMLElement | null>`; the wide branch puts it on the detail `<section>` with `tabIndex={-1}` so Enter in the list can focus it. In the narrow branch the `Sheet` takes focus itself.
  - `BeadsSplitLayout(props: { list: React.ReactNode; detail: React.ReactNode | null; detailTitle: string; onCloseDetail: () => void }): React.JSX.Element`

State order for `beadsSetupState`: data present and `bdInstalled === false` → `missing`; data and `versionSupported === false` → `outdated`; data and `initialized === false` → `uninitialized`; data fully ready → `ready`; else error present → `error`; else `loading`. (Data wins over a later error so a failed re-check does not hide a known state.)

Copy per state (translate keys `auto.components.task-page.beads.setup*`):
- loading: spinner with `role="status"`.
- missing: title "Install bd", text "bd was not found on the host that runs {{repo}}.", buttons "Open install guide" (`openUrl('https://github.com/gastownhall/beads')`), "Re-check", "Hide Beads".
- outdated: title "Upgrade bd", text "Found bd {{version}}; Orca needs bd 1.2.0 or newer.", buttons "Re-check", "Hide Beads".
- uninitialized: title "Initialize beads", text "Run bd init in {{repo}}, then re-check.", buttons "Copy bd init" (copies `bd init`, success toast "Copied bd init"), "Re-check", "Hide Beads".
- error: title "Beads could not be read" (or "The host is offline" when `error.kind === 'host-offline'`), text = `error.message`, buttons "Retry", "Hide Beads".
Layout mirrors Jira's connect CTA: centered column, `rounded-md border border-border/50 bg-muted/50 px-6 py-14 text-center`, `BeadsIcon className="mb-4 size-8 text-muted-foreground/60"`, title `text-base font-medium`, text `mt-2 max-w-sm text-sm text-muted-foreground`, buttons row `mt-5 flex flex-wrap items-center justify-center gap-2` (primary action `Button`, others `variant="outline"`).

- [ ] **Step 1: Write the failing tests**

`src/renderer/src/components/task-page/beads/BeadsSetupCard.test.tsx`:
```tsx
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BeadsSetupCard, beadsSetupState } from './BeadsSetupCard'

const READY = { bdInstalled: true, bdVersion: '1.2.2', versionSupported: true, initialized: true, beadsDir: '/r/.beads', isWorktree: false }

function load(data: unknown, error: unknown = null, loading = false) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: test fixtures build BeadsLoad values with partial status objects.
  return { data, error, loading, token: null } as Parameters<typeof beadsSetupState>[0]
}

const openUrl = vi.fn()
const writeClipboardText = vi.fn()

beforeEach(() => {
  Object.assign(window, { api: { shell: { openUrl }, ui: { writeClipboardText } } })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('beadsSetupState', () => {
  it('orders states by what the user must fix first', () => {
    expect(beadsSetupState(load(null, null, true))).toBe('loading')
    expect(beadsSetupState(load({ ...READY, bdInstalled: false }))).toBe('missing')
    expect(beadsSetupState(load({ ...READY, versionSupported: false }))).toBe('outdated')
    expect(beadsSetupState(load({ ...READY, initialized: false }))).toBe('uninitialized')
    expect(beadsSetupState(load(READY))).toBe('ready')
    expect(beadsSetupState(load(null, { kind: 'failed', message: 'boom' }))).toBe('error')
    expect(beadsSetupState(load({ ...READY, initialized: false }, { kind: 'failed', message: 'x' }))).toBe('uninitialized')
  })
})

describe('BeadsSetupCard', () => {
  it('renders nothing when beads is ready', () => {
    const { container } = render(
      <BeadsSetupCard status={load(READY)} repoName="app" onRecheck={vi.fn()} onHide={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('guides installation and re-checks', () => {
    const onRecheck = vi.fn()
    render(
      <BeadsSetupCard status={load({ ...READY, bdInstalled: false })} repoName="app" onRecheck={onRecheck} onHide={vi.fn()} />
    )
    expect(screen.getByText('Install bd')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open install guide' }))
    expect(openUrl).toHaveBeenCalledWith('https://github.com/gastownhall/beads')
    fireEvent.click(screen.getByRole('button', { name: 'Re-check' }))
    expect(onRecheck).toHaveBeenCalled()
  })

  it('copies bd init for uninitialized repositories and can hide the source', () => {
    const onHide = vi.fn()
    render(
      <BeadsSetupCard status={load({ ...READY, initialized: false })} repoName="app" onRecheck={vi.fn()} onHide={onHide} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Copy bd init' }))
    expect(writeClipboardText).toHaveBeenCalledWith('bd init')
    fireEvent.click(screen.getByRole('button', { name: 'Hide Beads' }))
    expect(onHide).toHaveBeenCalled()
  })

  it('shows offline hosts and error messages', () => {
    render(
      <BeadsSetupCard
        status={load(null, { kind: 'host-offline', message: 'SSH connection unavailable' })}
        repoName="app"
        onRecheck={vi.fn()}
        onHide={vi.fn()}
      />
    )
    expect(screen.getByText('The host is offline')).toBeInTheDocument()
    expect(screen.getByText('SSH connection unavailable')).toBeInTheDocument()
  })
})
```

`src/renderer/src/components/task-page/beads/BeadsSplitLayout.test.tsx`:
```tsx
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

// Why mutable: a mock pinned to one width can never render the narrow branch, so a
// layout that split into per-breakpoint trees would still pass every test.
const measured = vi.hoisted(() => ({ width: 1200 }))

vi.mock('@/components/right-sidebar/right-sidebar-measured-width', () => ({
  useMeasuredWidth: (onWidth: (width: number | null) => void) => () => onWidth(measured.width)
}))

import { BeadsSplitLayout, isBeadsSplitWide } from './BeadsSplitLayout'

afterEach(cleanup)

describe('isBeadsSplitWide', () => {
  it('uses the 880px breakpoint and treats unknown width as wide', () => {
    expect(isBeadsSplitWide(null)).toBe(true)
    expect(isBeadsSplitWide(880)).toBe(true)
    expect(isBeadsSplitWide(879)).toBe(false)
  })
})

describe('BeadsSplitLayout', () => {
  it('shows list, resize handle and detail side by side when wide', () => {
    render(
      <BeadsSplitLayout list={<div>LIST</div>} detail={<div>DETAIL</div>} detailTitle="cwf.3" onCloseDetail={vi.fn()} />
    )
    expect(screen.getByText('LIST')).toBeInTheDocument()
    expect(screen.getByText('DETAIL')).toBeInTheDocument()
    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('shows an empty-state hint when nothing is selected', () => {
    render(<BeadsSplitLayout list={<div>LIST</div>} detail={null} detailTitle="" onCloseDetail={vi.fn()} />)
    expect(screen.getByText('Select an issue to see its details')).toBeInTheDocument()
  })

  it('moves the detail into a drawer when narrow and keeps the list in the same tree', () => {
    // The point of the one-tree design: below the breakpoint the list must still be
    // rendered from the same <aside>, not re-created inside a narrow-only branch.
    measured.width = 800
    render(
      <BeadsSplitLayout
        list={<div>LIST</div>}
        detail={<div>DETAIL</div>}
        detailTitle="cwf.3"
        onCloseDetail={vi.fn()}
      />
    )
    expect(screen.getByText('LIST')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('DETAIL')).toBeInTheDocument()
    // No resize handle in the drawer layout — that affordance is wide-only.
    expect(screen.queryByRole('separator')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/renderer/src/components/task-page/beads/BeadsSetupCard.test.tsx src/renderer/src/components/task-page/beads/BeadsSplitLayout.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the setup card**

`src/renderer/src/components/task-page/beads/BeadsSetupCard.tsx`:
```tsx
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BeadsWorkspaceStatus } from '../../../../../shared/beads/beads-issue-types'
import { BeadsIcon } from '@/components/icons/BeadsIcon'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { BeadsLoad } from '@/store/slices/beads-slice-contract'

const INSTALL_GUIDE_URL = 'https://github.com/gastownhall/beads'

export type BeadsSetupState = 'loading' | 'error' | 'missing' | 'outdated' | 'uninitialized' | 'ready'

export function beadsSetupState(status: BeadsLoad<BeadsWorkspaceStatus>): BeadsSetupState {
  const data = status.data
  if (data) {
    if (!data.bdInstalled) {
      return 'missing'
    }
    if (!data.versionSupported) {
      return 'outdated'
    }
    return data.initialized ? 'ready' : 'uninitialized'
  }
  return status.error ? 'error' : 'loading'
}

type BeadsSetupCardProps = {
  status: BeadsLoad<BeadsWorkspaceStatus>
  repoName: string
  onRecheck: () => void
  onHide: () => void
}

function CardShell(props: { title: string; text: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="mt-3 flex flex-col items-center justify-center rounded-md border border-border/50 bg-muted/50 px-6 py-14 text-center shadow-sm">
      <BeadsIcon className="mb-4 size-8 text-muted-foreground/60" />
      <p className="text-base font-medium text-foreground">{props.title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{props.text}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{props.children}</div>
    </div>
  )
}

export function BeadsSetupCard({ status, repoName, onRecheck, onHide }: BeadsSetupCardProps): React.JSX.Element | null {
  const state = beadsSetupState(status)
  const hideButton = (
    <Button variant="outline" onClick={onHide}>
      {translate('auto.components.task-page.beads.setupHide', 'Hide Beads')}
    </Button>
  )
  const recheckButton = (
    <Button variant="outline" onClick={onRecheck}>
      {translate('auto.components.task-page.beads.setupRecheck', 'Re-check')}
    </Button>
  )
  switch (state) {
    case 'ready':
      return null
    case 'loading':
      return (
        <div role="status" aria-busy className="mt-4 flex items-center justify-center py-14">
          <Loader2 aria-hidden className="size-5 animate-spin text-muted-foreground" />
        </div>
      )
    case 'missing':
      return (
        <CardShell
          title={translate('auto.components.task-page.beads.setupMissingTitle', 'Install bd')}
          text={translate('auto.components.task-page.beads.setupMissingText', 'bd was not found on the host that runs {{repo}}.', { repo: repoName })}
        >
          <Button onClick={() => void window.api.shell.openUrl(INSTALL_GUIDE_URL)}>
            {translate('auto.components.task-page.beads.setupOpenGuide', 'Open install guide')}
          </Button>
          {recheckButton}
          {hideButton}
        </CardShell>
      )
    case 'outdated':
      return (
        <CardShell
          title={translate('auto.components.task-page.beads.setupOutdatedTitle', 'Upgrade bd')}
          text={translate('auto.components.task-page.beads.setupOutdatedText', 'Found bd {{version}}; Orca needs bd 1.2.0 or newer.', { version: status.data?.bdVersion ?? '?' })}
        >
          {recheckButton}
          {hideButton}
        </CardShell>
      )
    case 'uninitialized':
      return (
        <CardShell
          title={translate('auto.components.task-page.beads.setupInitTitle', 'Initialize beads')}
          text={translate('auto.components.task-page.beads.setupInitText', 'Run bd init in {{repo}}, then re-check.', { repo: repoName })}
        >
          <Button
            onClick={() => {
              void window.api.ui.writeClipboardText('bd init')
              toast.success(translate('auto.components.task-page.beads.setupCopied', 'Copied bd init'))
            }}
          >
            {translate('auto.components.task-page.beads.setupCopyInit', 'Copy bd init')}
          </Button>
          {recheckButton}
          {hideButton}
        </CardShell>
      )
    case 'error':
      return (
        <CardShell
          title={
            status.error?.kind === 'host-offline'
              ? translate('auto.components.task-page.beads.setupOfflineTitle', 'The host is offline')
              : translate('auto.components.task-page.beads.setupErrorTitle', 'Beads could not be read')
          }
          text={status.error?.message ?? ''}
        >
          <Button onClick={onRecheck}>
            {translate('auto.components.task-page.beads.setupRetry', 'Retry')}
          </Button>
          {hideButton}
        </CardShell>
      )
  }
}
```

- [ ] **Step 4: Implement the split layout**

`src/renderer/src/components/task-page/beads/BeadsSplitLayout.tsx`:
```tsx
import { useState } from 'react'
import { useMeasuredWidth } from '@/components/right-sidebar/right-sidebar-measured-width'
import { VisuallyHidden } from 'radix-ui'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

const SPLIT_BREAKPOINT_PX = 880
const LIST_WIDTH_DEFAULT_PX = 460
const LIST_WIDTH_MIN_PX = 320
const LIST_WIDTH_MAX_PX = 720

// `null` is the first render, before measurement: assume wide, and because both
// layouts share one tree the correction costs a class swap, not a remount.
export function isBeadsSplitWide(width: number | null): boolean {
  return width === null || width >= SPLIT_BREAKPOINT_PX
}

type BeadsSplitLayoutProps = {
  list: React.ReactNode
  detail: React.ReactNode | null
  detailTitle: string
  /** Focused when the list handles Enter ("focus detail", spec §4.1). */
  detailRef?: React.RefObject<HTMLElement | null>
  onCloseDetail: () => void
}

export function BeadsSplitLayout({
  list,
  detail,
  detailTitle,
  detailRef,
  onCloseDetail
}: BeadsSplitLayoutProps): React.JSX.Element {
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const measureRef = useMeasuredWidth(setContainerWidth)
  const [listWidth, setListWidth] = useState(LIST_WIDTH_DEFAULT_PX)
  const { containerRef, isResizing, onResizeStart } = useSidebarResize<HTMLElement>({
    isOpen: true,
    width: listWidth,
    minWidth: LIST_WIDTH_MIN_PX,
    maxWidth: LIST_WIDTH_MAX_PX,
    deltaSign: 1,
    setWidth: setListWidth
  })

  // Why: one tree for both layouts. Returning a different tree per breakpoint remounts
  // the list — the virtualizer loses its scroll offset and the rows flash — and the first
  // render always measures `null`, so every narrow window would see that flash on open.
  const wide = isBeadsSplitWide(containerWidth)
  return (
    <div
      ref={measureRef}
      className={cn('flex min-h-0 flex-1', wide ? 'overflow-hidden' : 'flex-col')}
    >
      <aside
        ref={containerRef}
        className={cn(
          'relative flex min-h-0 flex-col',
          wide ? 'shrink-0 border-r border-border' : 'flex-1'
        )}
        style={wide ? { width: listWidth } : undefined}
      >
        {list}
        {wide ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={translate('auto.components.task-page.beads.resizeList', 'Resize issue list')}
            onMouseDown={onResizeStart}
            className={cn(
              'group absolute -right-1.5 top-0 z-20 flex h-full w-3 cursor-col-resize items-stretch justify-center',
              isResizing && 'bg-ring/10'
            )}
          >
            <div
              className={cn(
                'h-full w-px bg-border transition-colors group-hover:bg-ring/50',
                isResizing && 'bg-ring'
              )}
            />
          </div>
        ) : null}
      </aside>
      {wide ? (
        <section
          ref={detailRef}
          tabIndex={-1}
          className="flex min-h-0 min-w-0 flex-1 flex-col focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {detail ?? (
            <p className="m-auto text-[13px] text-muted-foreground">
              {translate(
                'auto.components.task-page.beads.selectIssue',
                'Select an issue to see its details'
              )}
            </p>
          )}
        </section>
      ) : (
        <Sheet open={detail !== null} onOpenChange={(open) => !open && onCloseDetail()}>
          <SheetContent side="right" className="w-full sm:max-w-[640px]">
            {/* Radix requires a title; VisuallyHidden.Root is how the rest of the app hides it. */}
            <VisuallyHidden.Root asChild>
              <SheetTitle>{detailTitle}</SheetTitle>
            </VisuallyHidden.Root>
            {detail}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
```

`SheetContent` / `SheetTitle`: copy the `VisuallyHidden.Root asChild` title shape from `src/renderer/src/components/linear-item-drawer-sheet.tsx:85-98`, but **not** its `p-0`: `shadcn/no-restyle` rejects padding on `SheetContent` ("<SheetContent> owns its spacing"), and `sheetContentVariants` carries no padding anyway (`ui/sheet.tsx:52`), so `p-0` is a no-op that only survives in that file because the gate checks changed lines only. Width classes (`w-full sm:max-w-[640px]`) are layout and allowed. Do not put `className="sr-only"` on `SheetTitle`: typography/visibility classes on a `components/ui` primitive are exactly what `shadcn/no-restyle` (`allow: ["layout"]`) rejects, and the gate runs on changed lines. If `check:code-quality:changed` also flags `p-0`, move the padding reset to an inner `<div className="p-0">` wrapper and leave `SheetContent` with only the width classes. If `useSidebarResize`'s generic requires `HTMLDivElement`, use `<HTMLDivElement>` and render the list container as a `<div>` instead of `<aside>`.

- [ ] **Step 5: Run tests and lint**

Run:
```bash
pnpm test src/renderer/src/components/task-page/beads/BeadsSetupCard.test.tsx src/renderer/src/components/task-page/beads/BeadsSplitLayout.test.tsx
pnpm sync:localization-catalog && pnpm sync:localization-runtime-catalog
pnpm exec oxlint src/renderer/src/components/task-page/beads
pnpm run check:code-quality:changed
```
Expected: PASS (8 tests); lint and design-system scan clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/task-page/beads/BeadsSetupCard.tsx src/renderer/src/components/task-page/beads/BeadsSetupCard.test.tsx src/renderer/src/components/task-page/beads/BeadsSplitLayout.tsx src/renderer/src/components/task-page/beads/BeadsSplitLayout.test.tsx src/renderer/src/i18n
git commit -m "feat(beads): add the beads setup card and resizable split layout"
```

---

### Task 12: Beads page state, container and task-page wiring

**Files:**
- Create: `src/renderer/src/components/task-page/beads/beads-list-mode-storage.ts`
- Create: `src/renderer/src/components/task-page/beads/use-beads-page-state.ts`
- Create: `src/renderer/src/components/task-page/beads/BeadsTaskPageBody.tsx`
- Create: `src/renderer/src/components/task-page/beads/Content.tsx`
- Modify: `src/renderer/src/components/task-page/Content.tsx` (add the Beads branch)
- Test: `src/renderer/src/components/task-page/beads/beads-list-mode-storage.test.ts`, `src/renderer/src/components/task-page/beads/BeadsTaskPageBody.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–11; `TaskPageComposerActionsModel` fields `selectedRepos: Repo[]`, `primaryRepo: Repo | null`, `hideTaskSource(provider: TaskProvider, label: string): void`; `installWindowVisibilityTimeoutPoller` (Task 2); `useAppStore` actions `loadBeadsStatus`, `loadBeadsSchema`, `pollBeadsChangeToken`, `loadBeadsList`; `FALLBACK_BEADS_SCHEMA`, `beadsStatusCategory`.
- Produces:
  - `readBeadsListMode(repoId: string): BeadsListMode` and `writeBeadsListMode(repoId: string, mode: BeadsListMode): void` (localStorage key `orca.beads.listMode.<repoId>`, default `'tree'`, all access in try/catch)
  - `useBeadsPageState(repo: BeadsRepoRef): BeadsPageState` (shape below)
  - `BeadsTaskPageBody(props: { repos: readonly Repo[]; primaryRepoId: string | null; onHide: () => void }): React.JSX.Element`
  - `TaskPageBeadsContent({ model }: { model: TaskPageComposerActionsModel }): React.JSX.Element`

`BeadsPageState`:
```ts
type BeadsPageState = {
  status: BeadsLoad<BeadsWorkspaceStatus>
  ready: boolean
  schema: BeadsSchema
  query: BeadsListQuery
  view: BeadsListView
  mode: BeadsListMode
  rows: BeadsListRow[]
  progressByParent: ReadonlyMap<string, BeadsProgress>
  labelOptions: string[]
  epicOptions: { id: string; title: string }[]
  listError: BeadsFailure | null
  pollError: BeadsFailure | null
  indexTruncated: boolean
  listLoading: boolean
  listLoaded: boolean
  hasMore: boolean
  currentKey: string | null
  openIssueId: string | null
  setPreset: (preset: BeadsPreset) => void
  setText: (text: string) => void
  setFilters: (filters: BeadsFilterValues) => void
  setMode: (mode: BeadsListMode) => void
  toggleKey: (key: string, expand: boolean) => void
  selectKey: (key: string) => void
  openIssue: (id: string) => void
  closeIssue: () => void
  loadMore: () => void
  refresh: () => void
  recheck: () => void
}
```

Behavior:
- The hook takes a `BeadsRepoRef` built from primitive fields, **not** the store's `Repo` object: the repo catalog replaces those objects whenever main pushes a repo list, and an effect keyed on that identity would reinstall the poller and refetch while the user reads. `BeadsRepoView` is already keyed by `repo.id`, so a repo switch remounts it — there is no reset effect.
- On mount: `loadBeadsStatus(repo)`. Query, mode, selection and collapsed set start from their initial values because the component is fresh.
- `ready` = `beadsSetupState(status) === 'ready'`.
- While `ready`: install the poller `{ run: () => pollBeadsChangeToken(repo), getDelayMs: () => 5000, hiddenDelayMs: 60_000 }` (cleanup on unmount). It runs once synchronously on install, so the first token arrives after one `bd vc status`.
- **Every data load waits for `changeToken !== null`.** Loading at token `null` and again at the first real token doubles the whole first paint — index + list + details, ~700 KB and roughly 900 ms on a 3k-issue database — on every tab open. With the gate, the schema/index effect keyed on `[repo, changeToken]` and the list effect keyed on `[repo, changeToken, requestKey]` each run once.
- While **not** ready: install a slow visible-only poller for `loadBeadsStatus(repo, { force: true })` (`getDelayMs: () => 60_000`, no `hiddenDelayMs`). It re-runs on window focus and `visibilitychange`, which is what spec §6 means by "re-checked when the window regains focus" — the user installs bd in a terminal and comes back.
- Search text is debounced by 300 ms before it enters `query.text`; `setText` keeps the raw input for the field (return both: add `textInput: string` to the state).
- `setPreset`/`setFilters`/text change reset `limit` to 200 and keep the selection.
- `rows` from `buildBeadsListRows({ issues: list.data?.issues ?? [], index: index.data?.issues ?? null, mode, collapsed })`; `progressByParent` from `buildBeadsProgressByParent(index issues, (status) => beadsStatusCategory(schema, status) === 'done')`.
- `labelOptions` = sorted unique labels from the index; `epicOptions` = index issues with `issueType === 'epic'`, `{ id, title }`, in index order.
- `selectKey(key)`: sets `currentKey`; for `issue:<id>` rows also sets `openIssueId = id`; for `context:<id>` rows sets `openIssueId = id`.
- `openIssue(id)` (from relations/callout): sets `openIssueId = id` and `currentKey = issue:<id>` (the row may not be in the list; that's fine).
- `loadMore` sets `limit = nextBeadsLimit(limit)`. `refresh` polls the token first and only forces the two list loads when the token did **not** move — when it did, the `[changeToken]` effects already reload, and forcing as well means up to four `bd` calls whose first two results are thrown away by the request-generation guard. `recheck` forces `loadBeadsStatus`.
- `listError` is shown above the list as an inline destructive row with the message **and a Retry button** (`page.refresh`) — spec §6 pairs `busy` and `failed` with Retry. An `invalid-input` error should not happen (the builder strips unsupported filters); still show it.
- `pollError` (the change-token poll failing, typically `host-offline` or `busy`) renders as a muted line above the list: "Beads is unreachable — showing the last data loaded." Lists keep their data, so without it a stale board looks live.
- `indexTruncated` = the tree index came back with `hasMore`. Progress, epic options and label options are then incomplete, so render a muted one-line notice ("More than 2000 issues — epic progress and filter options cover the first 2000"). Spec §4.1: lists are never silently truncated.
- Empty list (loaded, no rows): centered "No issues match" text.

`BeadsTaskPageBody` renders, inside a card `mt-3 flex min-h-0 max-h-full flex-1 flex-col overflow-hidden rounded-md border border-border/50 bg-background shadow-sm`:
1. A header row (`h-10 border-b border-border/50 bg-muted/35 px-3`) with the 11 px uppercase label "Beads" and, when `repos.length > 1`, a `Select` of repos (value = repo id, item text = `repo.displayName`).
2. If no repo: centered text "Select a repository to see its beads".
3. Else if not ready: `BeadsSetupCard`.
4. Else: `BeadsFiltersBar`, the inline list error, then `BeadsSplitLayout` with `list = BeadsListPane` (or the empty text) and `detail = openIssueId ? <BeadsDetailPane …/> : null`, `detailTitle = openIssueId ?? ''`.

- [ ] **Step 1: Write the failing tests**

`src/renderer/src/components/task-page/beads/beads-list-mode-storage.test.ts`:
```ts
// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readBeadsListMode, writeBeadsListMode } from './beads-list-mode-storage'

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('beads list mode storage', () => {
  it('defaults to tree and remembers the mode per repository', () => {
    expect(readBeadsListMode('r1')).toBe('tree')
    writeBeadsListMode('r1', 'flat')
    expect(readBeadsListMode('r1')).toBe('flat')
    expect(readBeadsListMode('r2')).toBe('tree')
  })

  it('ignores unreadable storage and invalid values', () => {
    window.localStorage.setItem('orca.beads.listMode.r1', 'board')
    expect(readBeadsListMode('r1')).toBe('tree')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readBeadsListMode('r1')).toBe('tree')
  })
})
```

`src/renderer/src/components/task-page/beads/BeadsTaskPageBody.test.tsx`:
```tsx
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

const mocks = vi.hoisted(() => {
  // Typed local, not `as`: the repo forbids type assertions. Unlike a `null`
  // initializer (which narrows to `null`), `{}` keeps the declared record type.
  const state: Record<string, unknown> = {}
  return { state, loadBeadsStatus: vi.fn(), loadBeadsSchema: vi.fn(), pollBeadsChangeToken: vi.fn(), loadBeadsList: vi.fn(), loadBeadsDetails: vi.fn(), installPoller: vi.fn(() => () => {}) }
})

// getState is part of the surface: refresh() re-reads the token through it after
// polling. A bare function mock makes any refresh test throw instead of fail.
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
}))
vi.mock('@/lib/window-visibility-timeout-poller', () => ({
  installWindowVisibilityTimeoutPoller: mocks.installPoller
}))
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 36,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, key: index, start: index * 36 })),
    measureElement: () => {},
    scrollToIndex: () => {}
  })
}))
// Why mutable: a mock pinned to one width can never render the narrow branch, so a
// layout that split into per-breakpoint trees would still pass every test.
const measured = vi.hoisted(() => ({ width: 1200 }))

vi.mock('@/components/right-sidebar/right-sidebar-measured-width', () => ({
  useMeasuredWidth: (onWidth: (width: number | null) => void) => () => onWidth(measured.width)
}))
vi.mock('@/components/sidebar/CommentMarkdown', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>
}))

import type { Repo } from '../../../../../shared/repo-types'
import { BEADS_TREE_INDEX_REQUEST } from './beads-list-request'
import { BeadsTaskPageBody } from './BeadsTaskPageBody'

// A real Repo: only id, path, displayName, badgeColor and addedAt are required, so the
// fixture needs no cast — and spreading it for a second repo stays type-safe.
const REPO: Repo = {
  id: 'r1',
  path: '/work/app',
  displayName: 'app',
  badgeColor: '#4f46e5',
  addedAt: 0,
  connectionId: null,
  executionHostId: null
}

// What the hook and the store actions actually receive: the four routing fields, memoized.
const REPO_REF = { id: 'r1', path: '/work/app', connectionId: null, executionHostId: null }

const READY = { bdInstalled: true, bdVersion: '1.2.2', versionSupported: true, initialized: true, beadsDir: '/work/app/.beads', isWorktree: false }

function issue(id: string, parent?: string) {
  return { id, title: `Title ${id}`, status: 'open', priority: 2, issueType: id.startsWith('e') ? 'epic' : 'task', labels: ['ui'], parent, createdAt: '', updatedAt: '', dependencyCount: 0, dependentCount: 0, commentCount: 0, blockedBy: [], dependencyEdges: [] }
}

// Held in a typed local so a test can move the token (`repoState.changeToken = 'h2'`)
// without reaching through `mocks.state`, whose values are `unknown`.
let repoState: {
  status: unknown
  schema: { data: null; error: null; loading: false; token: null }
  changeToken: string | null
  pollError: unknown
  lists: Record<string, unknown>
  details: Record<string, unknown>
}

function installState(
  status: unknown,
  lists: Record<string, unknown> = {},
  changeToken: string | null = 'h1'
) {
  repoState = {
    status,
    schema: { data: null, error: null, loading: false, token: null },
    changeToken,
    pollError: null,
    lists,
    details: {}
  }
  mocks.state = {
    beadsRepos: { r1: repoState },
    loadBeadsStatus: mocks.loadBeadsStatus,
    loadBeadsSchema: mocks.loadBeadsSchema,
    pollBeadsChangeToken: mocks.pollBeadsChangeToken,
    loadBeadsList: mocks.loadBeadsList,
    loadBeadsDetails: mocks.loadBeadsDetails
  }
}

function renderBody(repos: readonly Repo[] = [REPO]) {
  render(
    <TooltipProvider>
      <BeadsTaskPageBody repos={repos} primaryRepoId="r1" onHide={vi.fn()} />
    </TooltipProvider>
  )
}

beforeEach(() => {
  Object.assign(window, { api: { shell: { openUrl: vi.fn() }, ui: { writeClipboardText: vi.fn() } } })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('BeadsTaskPageBody', () => {
  it('loads status and shows the setup card until beads is ready', () => {
    installState({ data: { ...READY, initialized: false }, error: null, loading: false, token: null })
    renderBody()
    expect(mocks.loadBeadsStatus).toHaveBeenCalledWith(REPO_REF)
    expect(screen.getByText('Initialize beads')).toBeInTheDocument()
    // Not the change-token poller: a slow, visible-only re-check that also runs on focus.
    expect(mocks.installPoller).toHaveBeenCalledWith(
      expect.not.objectContaining({ hiddenDelayMs: expect.anything() })
    )
    expect(mocks.loadBeadsList).not.toHaveBeenCalled()
  })

  it('waits for the first change token before loading anything', () => {
    // Pass the null token in, rather than reaching into `mocks.state` — that field is
    // typed `unknown`, so mutating through it does not typecheck.
    installState({ data: READY, error: null, loading: false, token: null }, {}, null)
    renderBody()
    expect(mocks.installPoller).toHaveBeenCalled()
    expect(mocks.loadBeadsList).not.toHaveBeenCalled()
    expect(mocks.loadBeadsSchema).not.toHaveBeenCalled()
  })

  it('warns when the tree index is truncated', () => {
    const indexKey = JSON.stringify(BEADS_TREE_INDEX_REQUEST)
    installState(
      { data: READY, error: null, loading: false, token: null },
      {
        [indexKey]: {
          data: { issues: [issue('e1')], hasMore: true },
          error: null,
          loading: false,
          token: 'h1'
        }
      }
    )
    renderBody()
    expect(screen.getByText(/More than 2000 issues/)).toBeInTheDocument()
  })

  it('polls, loads the ready list and the tree index, and opens a selected issue', () => {
    const readyKey = JSON.stringify({ view: 'ready', filter: {}, limit: 200 })
    const indexKey = JSON.stringify(BEADS_TREE_INDEX_REQUEST)
    installState(
      { data: READY, error: null, loading: false, token: null },
      {
        [readyKey]: { data: { issues: [issue('e1'), issue('c1', 'e1')], hasMore: false }, error: null, loading: false, token: 'h1' },
        [indexKey]: { data: { issues: [issue('e1'), issue('c1', 'e1')], hasMore: false }, error: null, loading: false, token: 'h1' }
      }
    )
    renderBody()
    expect(mocks.installPoller).toHaveBeenCalledWith(expect.objectContaining({ hiddenDelayMs: 60_000 }))
    expect(mocks.loadBeadsList).toHaveBeenCalledWith(REPO_REF, { view: 'ready', filter: {}, limit: 200 })
    expect(mocks.loadBeadsList).toHaveBeenCalledWith(REPO_REF, BEADS_TREE_INDEX_REQUEST)
    fireEvent.click(screen.getByText('Title c1'))
    expect(mocks.loadBeadsDetails).toHaveBeenCalledWith(REPO_REF, 'c1')
  })

  it('forces both list reloads when the poll leaves the token unchanged', async () => {
    installState({ data: READY, error: null, loading: false, token: null })
    renderBody()
    mocks.loadBeadsList.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => expect(mocks.pollBeadsChangeToken).toHaveBeenCalledWith(REPO_REF))
    await waitFor(() =>
      expect(mocks.loadBeadsList).toHaveBeenCalledWith(REPO_REF, BEADS_TREE_INDEX_REQUEST, {
        force: true
      })
    )
  })

  it('leaves the reload to the effects when the poll moved the token', async () => {
    installState({ data: READY, error: null, loading: false, token: null })
    // The poll finding new data is exactly when forcing would duplicate the work the
    // [changeToken] effects are about to do.
    mocks.pollBeadsChangeToken.mockImplementation(async () => {
      repoState.changeToken = 'h2'
    })
    renderBody()
    mocks.loadBeadsList.mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))

    await waitFor(() => expect(mocks.pollBeadsChangeToken).toHaveBeenCalledWith(REPO_REF))
    expect(mocks.loadBeadsList).not.toHaveBeenCalledWith(REPO_REF, expect.anything(), {
      force: true
    })
  })

  it('offers a repository picker when several repositories are selected', () => {
    installState({ data: READY, error: null, loading: false, token: null })
    renderBody([REPO, { ...REPO, id: 'r2', displayName: 'other' }])
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/renderer/src/components/task-page/beads/beads-list-mode-storage.test.ts src/renderer/src/components/task-page/beads/BeadsTaskPageBody.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the mode storage**

`src/renderer/src/components/task-page/beads/beads-list-mode-storage.ts`:
```ts
import type { BeadsListMode } from './beads-tree-rows'

function storageKey(repoId: string): string {
  return `orca.beads.listMode.${repoId}`
}

export function readBeadsListMode(repoId: string): BeadsListMode {
  try {
    return window.localStorage.getItem(storageKey(repoId)) === 'flat' ? 'flat' : 'tree'
  } catch {
    return 'tree'
  }
}

export function writeBeadsListMode(repoId: string, mode: BeadsListMode): void {
  try {
    window.localStorage.setItem(storageKey(repoId), mode)
  } catch {
    // Why: storage can be unavailable (private window, blocked site data); the mode is a convenience.
  }
}
```

- [ ] **Step 4: Implement the page state hook**

`src/renderer/src/components/task-page/beads/use-beads-page-state.ts`:
```ts
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BEADS_LIST_PAGE_SIZE,
  type BeadsFailure,
  type BeadsListView
} from '../../../../../shared/beads/beads-contract'
import type { BeadsSchema, BeadsWorkspaceStatus } from '../../../../../shared/beads/beads-issue-types'
import { FALLBACK_BEADS_SCHEMA, beadsStatusCategory } from '../../../../../shared/beads/beads-schema'
import { installWindowVisibilityTimeoutPoller } from '@/lib/window-visibility-timeout-poller'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'
import { useAppStore } from '@/store'
import { beadsListKey, selectBeadsRepoState } from '@/store/slices/beads-load-state'
import type { BeadsLoad } from '@/store/slices/beads-slice-contract'
import { beadsSetupState } from './BeadsSetupCard'
import { readBeadsListMode, writeBeadsListMode } from './beads-list-mode-storage'
import {
  BEADS_TREE_INDEX_REQUEST,
  EMPTY_BEADS_FILTERS,
  beadsViewForQuery,
  buildBeadsListRequest,
  nextBeadsLimit,
  type BeadsFilterValues,
  type BeadsListQuery,
  type BeadsPreset
} from './beads-list-request'
import {
  buildBeadsListRows,
  buildBeadsProgressByParent,
  type BeadsListMode,
  type BeadsListRow,
  type BeadsProgress
} from './beads-tree-rows'

const VISIBLE_POLL_MS = 5_000
const HIDDEN_POLL_MS = 60_000
const SETUP_RECHECK_MS = 60_000
const SEARCH_DEBOUNCE_MS = 300

const INITIAL_QUERY: BeadsListQuery = {
  preset: 'ready',
  filters: EMPTY_BEADS_FILTERS,
  text: '',
  limit: BEADS_LIST_PAGE_SIZE
}

export type BeadsPageState = {
  status: BeadsLoad<BeadsWorkspaceStatus>
  ready: boolean
  schema: BeadsSchema
  query: BeadsListQuery
  textInput: string
  view: BeadsListView
  mode: BeadsListMode
  rows: BeadsListRow[]
  progressByParent: ReadonlyMap<string, BeadsProgress>
  labelOptions: string[]
  epicOptions: { id: string; title: string }[]
  listError: BeadsFailure | null
  pollError: BeadsFailure | null
  indexTruncated: boolean
  listLoading: boolean
  listLoaded: boolean
  hasMore: boolean
  currentKey: string | null
  openIssueId: string | null
  setPreset: (preset: BeadsPreset) => void
  setText: (text: string) => void
  setFilters: (filters: BeadsFilterValues) => void
  setMode: (mode: BeadsListMode) => void
  toggleKey: (key: string, expand: boolean) => void
  selectKey: (key: string) => void
  openIssue: (id: string) => void
  closeIssue: () => void
  loadMore: () => void
  refresh: () => void
  recheck: () => void
}

export function useBeadsPageState(repo: BeadsRepoRef): BeadsPageState {
  const repoState = useAppStore((state) => selectBeadsRepoState(state, repo.id))
  const loadBeadsStatus = useAppStore((state) => state.loadBeadsStatus)
  const loadBeadsSchema = useAppStore((state) => state.loadBeadsSchema)
  const pollBeadsChangeToken = useAppStore((state) => state.pollBeadsChangeToken)
  const loadBeadsList = useAppStore((state) => state.loadBeadsList)

  const [query, setQuery] = useState<BeadsListQuery>(INITIAL_QUERY)
  const [textInput, setTextInput] = useState('')
  const [mode, setModeState] = useState<BeadsListMode>(() => readBeadsListMode(repo.id))
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  const [openIssueId, setOpenIssueId] = useState<string | null>(null)

  useEffect(() => {
    void loadBeadsStatus(repo)
  }, [repo, loadBeadsStatus])

  useEffect(() => {
    const handle = setTimeout(() => {
      setQuery((current) =>
        current.text === textInput ? current : { ...current, text: textInput, limit: BEADS_LIST_PAGE_SIZE }
      )
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [textInput])

  const ready = beadsSetupState(repoState.status) === 'ready'
  const request = useMemo(() => buildBeadsListRequest(query), [query])
  const requestKey = beadsListKey(request)
  const { changeToken } = repoState

  useEffect(() => {
    if (!ready) {
      // Why: bd gets installed or initialized in a terminal while Orca is in the
      // background. The poller re-runs on focus and visibilitychange, so this is the
      // focus re-check spec §6 asks for, not just a slow timer.
      return installWindowVisibilityTimeoutPoller({
        run: () => loadBeadsStatus(repo, { force: true }),
        getDelayMs: () => SETUP_RECHECK_MS
      })
    }
    return installWindowVisibilityTimeoutPoller({
      run: () => pollBeadsChangeToken(repo),
      getDelayMs: () => VISIBLE_POLL_MS,
      hiddenDelayMs: HIDDEN_POLL_MS
    })
  }, [ready, repo, pollBeadsChangeToken, loadBeadsStatus])

  // Why: `changeToken === null` means the first poll has not answered yet. Loading now
  // and again at the first token doubles the entire first paint over IPC/SSH.
  const tokenReady = ready && changeToken !== null

  useEffect(() => {
    if (!tokenReady) {
      return
    }
    void loadBeadsSchema(repo)
    void loadBeadsList(repo, BEADS_TREE_INDEX_REQUEST)
  }, [tokenReady, repo, changeToken, loadBeadsSchema, loadBeadsList])

  useEffect(() => {
    if (!tokenReady) {
      return
    }
    // requestKey (not the request object) keys the effect so equal queries don't refetch.
    void loadBeadsList(repo, request)
  }, [tokenReady, repo, changeToken, requestKey, request, loadBeadsList])

  const schema = repoState.schema.data ?? FALLBACK_BEADS_SCHEMA
  const list = repoState.lists[requestKey]
  const index = repoState.lists[beadsListKey(BEADS_TREE_INDEX_REQUEST)]
  const indexIssues = index?.data?.issues ?? null

  const rows = useMemo(
    () => buildBeadsListRows({ issues: list?.data?.issues ?? [], index: indexIssues, mode, collapsed }),
    [list?.data, indexIssues, mode, collapsed]
  )
  const progressByParent = useMemo(
    () => buildBeadsProgressByParent(indexIssues, (status) => beadsStatusCategory(schema, status) === 'done'),
    [indexIssues, schema]
  )
  const labelOptions = useMemo(
    () => [...new Set((indexIssues ?? []).flatMap((entry) => entry.labels))].sort(),
    [indexIssues]
  )
  const epicOptions = useMemo(
    () =>
      (indexIssues ?? [])
        .filter((entry) => entry.issueType === 'epic')
        .map((entry) => ({ id: entry.id, title: entry.title })),
    [indexIssues]
  )

  const setMode = useCallback(
    (next: BeadsListMode) => {
      setModeState(next)
      writeBeadsListMode(repo.id, next)
    },
    [repo.id]
  )

  const idFromKey = (key: string): string => key.slice(key.indexOf(':') + 1)

  return {
    status: repoState.status,
    ready,
    schema,
    query,
    textInput,
    view: beadsViewForQuery(query),
    mode,
    rows,
    progressByParent,
    labelOptions,
    epicOptions,
    listError: list?.error ?? null,
    pollError: repoState.pollError,
    indexTruncated: index?.data?.hasMore ?? false,
    listLoading: list?.loading ?? false,
    listLoaded: list?.data !== null && list?.data !== undefined,
    hasMore: list?.data?.hasMore ?? false,
    currentKey,
    openIssueId,
    setPreset: (preset) => setQuery((current) => ({ ...current, preset, limit: BEADS_LIST_PAGE_SIZE })),
    setText: setTextInput,
    setFilters: (filters) => setQuery((current) => ({ ...current, filters, limit: BEADS_LIST_PAGE_SIZE })),
    setMode,
    toggleKey: (key, expand) =>
      setCollapsed((current) => {
        const next = new Set(current)
        if (expand) {
          next.delete(key)
        } else {
          next.add(key)
        }
        return next
      }),
    selectKey: (key) => {
      setCurrentKey(key)
      setOpenIssueId(idFromKey(key))
    },
    openIssue: (id) => {
      setCurrentKey(`issue:${id}`)
      setOpenIssueId(id)
    },
    closeIssue: () => setOpenIssueId(null),
    loadMore: () => setQuery((current) => ({ ...current, limit: nextBeadsLimit(current.limit) })),
    refresh: () => {
      // Why: if the poll moves the token the [changeToken] effects reload on their own.
      // Forcing as well would run both lists twice and discard the first answers.
      void (async () => {
        const before = changeToken
        await pollBeadsChangeToken(repo)
        if (useAppStore.getState().beadsRepos[repo.id]?.changeToken !== before) {
          return
        }
        void loadBeadsList(repo, request, { force: true })
        void loadBeadsList(repo, BEADS_TREE_INDEX_REQUEST, { force: true })
      })()
    },
    recheck: () => void loadBeadsStatus(repo, { force: true })
  }
}
```

There is deliberately no `eslint-disable` line: oxlint runs `react-hooks/exhaustive-deps` at warn and `pnpm lint` does not deny warnings, so a disable comment for it is noise. If the file exceeds 300 lines after formatting, move the returned handler object construction into `beads-page-actions.ts`.

- [ ] **Step 5: Implement the body and the container**

`src/renderer/src/components/task-page/beads/BeadsTaskPageBody.tsx`:
```tsx
import { useMemo, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import type { Repo } from '../../../../../shared/repo-types'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { BeadsDetailPane } from './BeadsDetailPane'
import { BeadsFiltersBar } from './BeadsFiltersBar'
import { BeadsListPane } from './BeadsListPane'
import { BeadsSetupCard } from './BeadsSetupCard'
import { BeadsSplitLayout } from './BeadsSplitLayout'
import { useBeadsPageState } from './use-beads-page-state'

type BeadsTaskPageBodyProps = {
  repos: readonly Repo[]
  primaryRepoId: string | null
  onHide: () => void
}

function BeadsRepoView({ repo, onHide }: { repo: Repo; onHide: () => void }): React.JSX.Element {
  // Why: the store replaces Repo objects on every repo-list push. Effects keyed on that
  // identity would reinstall the poller and refetch mid-read; these four fields do not change.
  const repoRef = useMemo<BeadsRepoRef>(
    () => ({
      id: repo.id,
      path: repo.path,
      connectionId: repo.connectionId ?? null,
      executionHostId: repo.executionHostId ?? null
    }),
    [repo.id, repo.path, repo.connectionId, repo.executionHostId]
  )
  const page = useBeadsPageState(repoRef)
  const detailRef = useRef<HTMLElement | null>(null)
  if (!page.ready) {
    return <BeadsSetupCard status={page.status} repoName={repo.displayName} onRecheck={page.recheck} onHide={onHide} />
  }
  const list =
    page.listLoaded && page.rows.length === 0 ? (
      <p className="m-auto p-8 text-[13px] text-muted-foreground">
        {translate('auto.components.task-page.beads.noIssues', 'No issues match')}
      </p>
    ) : (
      <BeadsListPane
        rows={page.rows}
        schema={page.schema}
        progressByParent={page.progressByParent}
        mode={page.mode}
        currentKey={page.currentKey}
        hasMore={page.hasMore}
        loading={page.listLoading}
        onSelectKey={page.selectKey}
        onToggleKey={page.toggleKey}
        // Enter means "focus detail" (spec §4.1), not just select.
        onOpenKey={(key) => {
          page.selectKey(key)
          detailRef.current?.focus()
        }}
        onLoadMore={page.loadMore}
      />
    )
  return (
    <>
      <BeadsFiltersBar
        preset={page.query.preset}
        onPresetChange={page.setPreset}
        text={page.textInput}
        onTextChange={page.setText}
        filters={page.query.filters}
        onFiltersChange={page.setFilters}
        view={page.view}
        schema={page.schema}
        labelOptions={page.labelOptions}
        epicOptions={page.epicOptions}
        mode={page.mode}
        onModeChange={page.setMode}
        refreshing={page.listLoading}
        onRefresh={page.refresh}
      />
      {page.listError ? (
        <div className="flex items-start gap-2 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{page.listError.message}</span>
          <Button variant="ghost" size="xs" onClick={page.refresh}>
            {translate('auto.components.task-page.beads.retry', 'Retry')}
          </Button>
        </div>
      ) : null}
      {page.pollError ? (
        <p className="px-3 py-1 text-[12px] text-muted-foreground">
          {translate(
            'auto.components.task-page.beads.pollStale',
            'Beads is unreachable — showing the last data loaded.'
          )}
        </p>
      ) : null}
      {page.indexTruncated ? (
        <p className="px-3 py-1 text-[12px] text-muted-foreground">
          {translate(
            'auto.components.task-page.beads.indexTruncated',
            'More than 2000 issues — epic progress and filter options cover the first 2000.'
          )}
        </p>
      ) : null}
      <BeadsSplitLayout
        list={list}
        detailRef={detailRef}
        detail={
          page.openIssueId ? (
            <BeadsDetailPane
              repo={repoRef}
              issueId={page.openIssueId}
              schema={page.schema}
              onOpenIssue={page.openIssue}
            />
          ) : null
        }
        detailTitle={page.openIssueId ?? ''}
        onCloseDetail={page.closeIssue}
      />
    </>
  )
}

export function BeadsTaskPageBody({ repos, primaryRepoId, onHide }: BeadsTaskPageBodyProps): React.JSX.Element {
  const [chosenRepoId, setChosenRepoId] = useState<string | null>(null)
  const repo = useMemo(
    () => repos.find((entry) => entry.id === (chosenRepoId ?? primaryRepoId)) ?? repos[0] ?? null,
    [repos, chosenRepoId, primaryRepoId]
  )
  return (
    <div className="mt-3 flex min-h-0 max-h-full flex-1 flex-col overflow-hidden rounded-md border border-border/50 bg-background shadow-sm">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/50 bg-muted/35 px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {translate('auto.components.task-page.beads.providerLabel', 'Beads')}
        </span>
        {repos.length > 1 && repo ? (
          <Select value={repo.id} onValueChange={setChosenRepoId}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {repos.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {repo ? (
        <BeadsRepoView key={repo.id} repo={repo} onHide={onHide} />
      ) : (
        <p className="m-auto p-8 text-[13px] text-muted-foreground">
          {translate('auto.components.task-page.beads.selectRepo', 'Select a repository to see its beads')}
        </p>
      )}
    </div>
  )
}
```
If `SelectTrigger` has no `size` prop in this codebase, drop `size="sm"`.

`src/renderer/src/components/task-page/beads/Content.tsx`:
```tsx
import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'
import { translate } from '@/i18n/i18n'
import { BeadsTaskPageBody } from './BeadsTaskPageBody'

export function TaskPageBeadsContent({ model }: { model: TaskPageComposerActionsModel }): React.JSX.Element {
  const { selectedRepos, primaryRepo, hideTaskSource } = model
  return (
    <BeadsTaskPageBody
      repos={selectedRepos}
      primaryRepoId={primaryRepo?.id ?? null}
      onHide={() => hideTaskSource('beads', translate('auto.components.task-page.beads.providerLabel', 'Beads'))}
    />
  )
}
```

`src/renderer/src/components/task-page/Content.tsx`: add `import { TaskPageBeadsContent } from './beads/Content'` and, directly before the final `) : (` fallthrough, a branch:
```tsx
  ) : taskSource === 'beads' ? (
    <TaskPageBeadsContent model={model} />
```

- [ ] **Step 6: Run tests, typecheck and lint**

Run:
```bash
pnpm test src/renderer/src/components/task-page/beads
pnpm tc
pnpm sync:localization-catalog && pnpm sync:localization-runtime-catalog
pnpm exec oxlint src/renderer/src/components/task-page
pnpm run check:code-quality:changed
```
Expected: all beads component tests PASS; typecheck clean; lint and design-system scan clean.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/task-page/beads src/renderer/src/components/task-page/Content.tsx src/renderer/src/i18n
git commit -m "feat(beads): wire the beads tab into the Tasks page"
```

---

### Task 13: Localization, visual check, gates, spec and milestone close

**Files:**
- Modify (fork-only, force-added): `docs/superpowers/specs/2026-09-15-beads-task-source-design.md`
- Create (not committed): screenshots under `.bench-fixtures/beads-m2/`

- [ ] **Step 1: Localization and quality gates**

Run:
```bash
pnpm sync:localization-catalog
pnpm sync:localization-runtime-catalog
pnpm run verify:localization-catalog
pnpm run verify:localization-runtime-catalog
pnpm run verify:localization-extraction
pnpm run verify:localization-coverage
pnpm tc
pnpm lint
pnpm run check:code-quality:changed
pnpm test src/renderer/src/components/task-page/beads src/renderer/src/store/slices/beads.test.ts src/renderer/src/runtime/runtime-beads-client.test.ts src/renderer/src/lib/window-visibility-timeout-poller.test.ts src/shared/task-providers.test.ts
```
Expected: all exit 0. Fix findings only in files changed on this branch since `364bfd6cba` (`git diff --name-only 364bfd6cba..HEAD`). `pnpm lint` can take several minutes (600 000 ms timeout; re-run if it times out). If a lint failure is in a file this branch never touched, report it instead of fixing it.

- [ ] **Step 2: Visual smoke check (read-only, background window)**

With baumoscan registered in the dev app:
```bash
ORCA_BACKGROUND_LAUNCH=1 pnpm dev > /tmp/orca-beads-m2-dev.log 2>&1 &
```
Read the printed `[orca-dev] Remote debugging on http://127.0.0.1:PORT` line from the log, then use the CDP approach from `tests/tools/omp-child-history-rendered/README.md` to: open the Tasks page with `window.__store.getState().openTaskPage({ taskSource: 'beads' })`, wait for rows, capture a screenshot of the wide layout to `.bench-fixtures/beads-m2/beads-tab.png`, click the first issue row, capture `.bench-fixtures/beads-m2/beads-detail.png`. Do not trigger any write. Stop the dev process and confirm no Electron process from this repo remains (`pgrep -fl "Developer/orca"`). If the CDP scripting cannot be completed, record exactly how far it got; this step does not block the milestone.

- [ ] **Step 3: Update the spec**

In `docs/superpowers/specs/2026-09-15-beads-task-source-design.md`:
- §4.1 List modes: mark **Board** "M4 (needs drag-to-change-status)"; filters: note "assignee 'me' arrives with the actor setting in M3" and add the per-view filter table from Task 5.
- §4.1 Presets: note "counts land in M4 with the board's per-column counts (one count-only backend call); M2 renders the preset buttons without counts".
- §4.2: mark actions (Start worktree, Claim, Status, Priority, Close, ⋯) and inline editing "M3/M4"; state that M2 shows the mini graph as grouped relation lists (Parent, Blocked by, Blocks, Children, Related); mark gates and the merge-slot holder in the blocked callout "M4 — needs bd commands and contract fields M1 does not have"; mark linked worktrees "M3".
- §4.3 Settings card: "M2: install/initialize guidance plus show-in-Tasks toggle; actor setting in M3; poll intervals fixed at 5 s visible / 60 s hidden."
- §3 architecture: replace `store/slices/beads/*` with the actual files (`store/slices/beads.ts`, `beads-slice-contract.ts`, `beads-load-state.ts`) and note the Beads tab body is self-contained (`task-page/beads/Content.tsx`) rather than extra stages in the task-page hook chain.

```bash
git add -f docs/superpowers/specs/2026-09-15-beads-task-source-design.md
git commit -m "docs(fork): record M2 scope decisions in the beads design spec"
```

- [ ] **Step 4: Close the milestone**

```bash
bd close orca-q11.3 --reason="Read UI: Beads task provider, setup card, presets/filters, tree+flat list with keyboard nav, split detail with blockers and relations, change-token polling"
bd ready
```
Expected: `orca-q11.4` (M3) is ready.

- [ ] **Step 5: Hand off**

Report commits, gate results, visual check outcome (screenshot paths or where it stopped), and that nothing was pushed. Suggested next: `git push` (fork CI), then the M3 plan.

