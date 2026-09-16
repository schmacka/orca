# Beads M3 — Start worktree from a bead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start an agent worktree from a bead — linked item, composer pre-fill, auto-claim, a launch prompt the agent can act on, a `--beads-issue` CLI flag, and a prompt on worktree removal so a bead is never left claimed by accident.

**Architecture:** M2 built the read UI; M1 built the whole write backend. `claim` already runs end to end from argv builder through the write service (with read-back) to IPC and the `beads.claimIssue` RPC method — it stops at the renderer boundary. So M3 adds a thin renderer write client plus one store action, extends Orca's own `WorkspaceLinkedItem` union with a `'beads'` member, and reuses the existing new-workspace composer exactly as Jira does. The only genuinely new surface is the removal-disposition prompt.

**Tech Stack:** React 19, Zustand store slices, Tailwind v4 tokens + shadcn primitives, Vitest + happy-dom + Testing Library, Playwright (Electron) for the end-to-end spec.

**Spec:** `docs/superpowers/specs/2026-09-15-beads-task-source-design.md` §5.1, §5.2, §5.3 (the `--beads-issue` flag only — the `orca-beads` skill guide is M6 per §11).

**Beads issue:** `orca-q11.4` — claim before starting (`bd update orca-q11.4 --claim`), close in the last task.

## Scope decisions already made

- **In:** §5.1 in full, the §5.2 removal prompt, the CLI flag, an e2e spec.
- **Deferred to a later milestone:** §5.2's per-row agent-status badges ("running / waiting / done" on tree, list and detail rows). No provider has such a badge today — GitHub rows show only that a workspace is attached, with no status — so this would be the first of its kind and is cosmetic. The removal prompt stays because it prevents a real data problem: a deleted worktree otherwise leaves its bead claimed forever.
- **Out of scope, do not touch:** `canUseIssueCommandForLinkedItemProvider` (`src/renderer/src/lib/new-workspace.ts:43-47`) allows only `github` and `gitlab`. The spec's §5.1 note about overriding the prompt with the per-repo `issueCommand` template is therefore **not achievable for beads without changing a shared gate that also excludes Jira and Linear**. Leave the gate alone; Task 11 records the discrepancy in the spec.

## OPEN DECISION — for the plan reviewer to rule on before Task 1

`WorkspaceLinkedItem` (`src/shared/worktree/types.ts:10-19`) requires `number: number` and `url: string`. A bead has neither: no numeric id, and no URL at all because it is local to the repo. Two options, and **the reviewer decides**:

**Option A — synthetic URL + identifier (the plan is written for this).** Add `beadsIdentifier?: string` beside the existing `jiraIdentifier`, set `number: 0` exactly as Jira does (`use-task-page-composer-actions.ts:190-223`), and set `url` to `bd://<repoId>/<issueId>`. Nothing outside the beads paths changes. The synthetic URL is never fetched — `isWorkspaceLinkedItemSourceContextMatch` returns `true` for any non-Jira provider match without parsing it (`workspace-linked-item-source-context.ts:37-40`), and the prompt builder uses the identifier, not the URL. Cost: a URL that resolves to nothing, which a future reader could mistake for a real link.

**Option B — make `url` optional.** Model reality: `url?: string`, and teach every consumer to handle its absence. Cost: touches roughly twenty files across shared, main and renderer, and risks providers this milestone otherwise never goes near.

If the reviewer picks B, Task 1 changes shape and Tasks 4–6 need their `url` handling revisited; everything else is unaffected. **Implementers: do not start Task 1 until this is settled.**

## Global Constraints

- **Implementers run no `pnpm` commands at all** — no `tc`, no `lint`, no `test`, no localization sync. A parallel typecheck thrashes this 8 GB machine and has killed agent sessions at a 600 s stall watchdog. The controller runs every verification and feeds results back. Write the failing test first, state in your report which failure you expect and why, then implement.
- **Check the real source before trusting this plan.** Eleven defects were found in M2's plan during execution, nearly all in test scaffolding. If this plan and the committed code disagree, **follow the code** and say so in your report — that is a plan defect the controller needs to know about.
- **Test fixtures are annotated with their real types**, never cast into place. `as never`, `as Record<string, unknown>` and `as SomeType` on a fixture are all defects. `Repo` needs only `id`, `path`, `displayName`, `badgeColor`, `addedAt`; everything else is optional.
- **Mocks carry real parameter signatures.** A zero-argument `vi.fn()` makes `.mock.calls` an array of empty tuples. A mock pinned to a single value hides the branch it was meant to exercise — if a test has a "does not happen" assertion, make sure the "does happen" case is also covered, or the test may be passing for the wrong reason.
- **A mocked module's imported symbol keeps its real type.** Arguments must satisfy the genuine signature, not the mock's simplified one.
- Control-flow narrowing only narrows *union* types: `const x: SomeRecord = {}` keeps its declared type, while `const y: A | null = null` narrows to `null` and needs an annotation.
- **Design system** (`docs/STYLEGUIDE.md`), enforced by `pnpm run check:code-quality:changed`: tokens only, never raw palette colors; `components/ui` primitives take **layout-only** `className`. **Read a primitive's base classes before styling it** — M2 lost three rounds to classes the primitive already had. An existing file's classes are evidence of what the gate tolerated when that line was written, not of what it permits now.
- Every user-visible string goes through `translate('auto.components.<area>.<name>', 'English')` — never at module top level. Only `en.json` gets new keys; the controller runs the syncs.
- `.ts` ≤ 300 lines, `.tsx` ≤ 400 lines (blank lines and comments excluded); never add a `max-lines` disable.
- Component tests start with `// @vitest-environment happy-dom` and import `'@testing-library/jest-dom/vitest'`.
- Inline `type` imports. **No `as` casts** outside `as const`; if one is genuinely unavoidable, the `oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: …` comment goes on **the line carrying the cast** (`oxfmt` reflows long calls and a drifted comment stops suppressing).
- No new `@ts-nocheck`. Never hard-code `metaKey` — platform checks only.
- M3 introduces the milestone's **first renderer write**. Every write is explicit and user-initiated; nothing writes on render, on hover, or on selection.
- Commit trailers, exactly:
  ```
  Co-Authored-By: Claude <model> <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016WpdEv8mKGKnbFSPk884i5
  ```

## What M1 and M2 already provide

Verified against the committed source — do not rebuild any of this:

| Capability | Where | State |
|---|---|---|
| `bd update <id> --claim` argv | `src/main/beads/beads-write-args.ts:113-115` | done, unit-tested |
| Claim + read-back service | `src/main/beads/beads-write-service.ts:60-66` | done |
| IPC `beads:claimIssue` | `src/main/ipc/beads.ts:77-79` | done |
| Preload `claimIssue` | `src/preload/api/beads-api.ts:34` | done |
| RPC `beads.claimIssue` | `src/main/runtime/rpc/methods/beads.ts:59-64` | done |
| Real-`bd` integration test for claim | `src/main/beads/beads-bd-integration.test.ts` | done, opt-in via `ORCA_BEADS_INTEGRATION=1` |
| `bd ready --parent <id>` | `src/main/beads/beads-read-args.ts:88-106` | done (rejects `statuses`/`includeClosed`) |
| Renderer read client | `src/renderer/src/runtime/runtime-beads-client.ts:108-149` | five read functions only — **no write wrapper** |
| Store slice | `src/renderer/src/store/slices/beads-slice-contract.ts:34-45` | five read actions only — **no write actions** |
| `beads.actor` setting | — | **does not exist**, Task 2 builds it |

## File structure

```
src/shared/worktree/types.ts                          + 'beads' in WorkspaceLinkedItem (Task 1)
src/shared/workspace-linked-item.ts                   + beads in normalize (Task 1)
src/shared/workspace-linked-item-source-context.ts    + beads in provider resolution (Task 1)
src/shared/global-settings-types.ts                   + beadsActor (Task 2)
src/shared/default-global-settings.ts                 + beadsActor default (Task 2)
src/renderer/src/components/settings/BeadsActorSetting.tsx   actor field (Task 2)
src/renderer/src/runtime/runtime-beads-client.ts      + beadsClaimIssue (Task 3)
src/renderer/src/store/slices/beads.ts                + claimBeadsIssue action (Task 3)
src/renderer/src/components/task-page/beads/
  beads-start-worktree.ts                             linked item + seed name builder (Task 4)
  BeadsIssueRow.tsx, BeadsDetailSections.tsx          + Start worktree affordance (Task 4)
src/renderer/src/components/use-task-page-composer-actions.ts  + openComposerForBeadsItem (Task 4)
src/renderer/src/lib/linked-work-item-context.ts      + beads prompt branch (Task 5)
src/renderer/src/lib/beads-epic-launch-context.ts     ready-children prompt (Task 6)
src/renderer/src/hooks/composer-state/…               auto-claim after create (Task 7)
src/cli/specs/core.ts, src/cli/handlers/worktree.ts   --beads-issue (Task 8)
src/cli/handlers/worktree-beads-issue-link.ts         flag parsing (Task 8)
src/renderer/src/components/sidebar/
  BeadsWorktreeDisposition.tsx                        close/unclaim/leave prompt (Task 9)
tests/e2e/beads-start-worktree.spec.ts                e2e (Task 10)
```

---

### Task 1: Teach `WorkspaceLinkedItem` about beads

**Do not start until the OPEN DECISION above is settled.** This task is written for Option A.

**Files:**
- Modify: `src/shared/worktree/types.ts` (`WorkspaceLinkedItem`, lines 10-19)
- Modify: `src/shared/workspace-linked-item.ts` (`normalizeWorkspaceLinkedItem`, lines 25-67)
- Modify: `src/shared/workspace-linked-item-source-context.ts` (`resolveLinkedItemProvider`, lines 6-22)
- Modify: `src/shared/new-workspace/workspace-source.ts` if `pnpm tc` reports it
- Test: `src/shared/workspace-linked-item.test.ts` (create if absent), `src/shared/workspace-linked-item-source-context.test.ts` (same)

**Interfaces:**
- Produces: `WorkspaceLinkedItem['provider']` includes `'beads'`; `WorkspaceLinkedItem.beadsIdentifier?: string`; `normalizeWorkspaceLinkedItem` accepts and round-trips a beads item; `isWorkspaceLinkedItemSourceContextMatch` returns `true` for a beads item against a beads `TaskSourceContext`.

**Why this shape:** `normalizeWorkspaceLinkedItem` rejects any item whose `url` is empty (lines 44-47), and it runs at persistence time on every worktree write (`worktree-meta-write-normalization.ts`). A beads item with no URL would be silently dropped on save. The synthetic `bd://<repoId>/<issueId>` satisfies that guard without inventing a fetchable address.

- [ ] **Step 1: Write the failing tests**

`src/shared/workspace-linked-item.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceLinkedItem } from './workspace-linked-item'

describe('normalizeWorkspaceLinkedItem with beads', () => {
  it('round-trips a beads item, keeping the identifier', () => {
    expect(
      normalizeWorkspaceLinkedItem({
        provider: 'beads',
        type: 'issue',
        number: 0,
        title: 'cwf.3 Run the playtest',
        url: 'bd://repo-1/cwf.3',
        beadsIdentifier: 'cwf.3',
        repoId: 'repo-1'
      })
    ).toEqual({
      provider: 'beads',
      type: 'issue',
      number: 0,
      title: 'cwf.3 Run the playtest',
      url: 'bd://repo-1/cwf.3',
      beadsIdentifier: 'cwf.3',
      repoId: 'repo-1'
    })
  })

  it('drops a beads item with no identifier rather than persisting a link it cannot resolve', () => {
    const normalized = normalizeWorkspaceLinkedItem({
      provider: 'beads',
      type: 'issue',
      number: 0,
      title: 'no identifier',
      url: 'bd://repo-1/x'
    })
    expect(normalized?.beadsIdentifier).toBeUndefined()
  })
})
```

`src/shared/workspace-linked-item-source-context.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isWorkspaceLinkedItemSourceContextMatch } from './workspace-linked-item-source-context'
import type { TaskSourceContext } from './task-source-context'
import type { WorkspaceLinkedItem } from './worktree/types'

const BEADS_ITEM: WorkspaceLinkedItem = {
  provider: 'beads',
  type: 'issue',
  number: 0,
  title: 'cwf.3 Run the playtest',
  url: 'bd://repo-1/cwf.3',
  beadsIdentifier: 'cwf.3',
  repoId: 'repo-1'
}

const BEADS_CONTEXT: TaskSourceContext = {
  kind: 'task-source',
  provider: 'beads',
  projectId: 'repo-1',
  hostId: 'local'
}

describe('isWorkspaceLinkedItemSourceContextMatch with beads', () => {
  it('matches a beads item against a beads context', () => {
    expect(isWorkspaceLinkedItemSourceContextMatch(BEADS_ITEM, BEADS_CONTEXT)).toBe(true)
  })

  it('refuses a beads item against another provider, so the context is not persisted', () => {
    expect(
      isWorkspaceLinkedItemSourceContextMatch(BEADS_ITEM, { ...BEADS_CONTEXT, provider: 'jira' })
    ).toBe(false)
  })
})
```

- [ ] **Step 2: Predict the failure**

You cannot run tests. Read the two source files and state in your report which assertion fails first and why — for the first file it should be the provider guard at `workspace-linked-item.ts:30-36` returning `null`, so `toEqual` receives `null`.

- [ ] **Step 3: Extend the type**

`src/shared/worktree/types.ts`:
```ts
export type WorkspaceLinkedItem = {
  provider: 'github' | 'gitlab' | 'linear' | 'jira' | 'beads'
  type: 'issue' | 'pr' | 'mr'
  number: number
  title: string
  url: string
  linearIdentifier?: string
  jiraIdentifier?: string
  /** Bead id, e.g. `cwf.3`. Beads have no number, so `number` is 0 as it is for Jira. */
  beadsIdentifier?: string
  repoId?: string
}
```

- [ ] **Step 4: Extend normalization**

In `normalizeWorkspaceLinkedItem`, add `'beads'` to the provider guard, and carry the identifier through with the same non-empty-string pattern the other two use:
```ts
    ...(typeof raw.beadsIdentifier === 'string' && raw.beadsIdentifier.trim().length > 0
      ? { beadsIdentifier: raw.beadsIdentifier.trim() }
      : {}),
```

- [ ] **Step 5: Fix every compile site**

Run nothing; instead read each file the controller lists after its typecheck. Expect `resolveLinkedItemProvider` (`workspace-linked-item-source-context.ts:6-22`) to need `beadsIdentifier` threading, mirroring `jiraIdentifier`. Note `isWorkspaceLinkedItemSourceContextMatch` needs **no** beads branch: it returns `true` at line 37-40 for every provider except Jira, and that is the behavior we want. Say so explicitly in your report so the reviewer does not look for a missing branch.

- [ ] **Step 6: Commit**

```bash
git add src/shared/worktree/types.ts src/shared/workspace-linked-item.ts src/shared/workspace-linked-item-source-context.ts src/shared/workspace-linked-item.test.ts src/shared/workspace-linked-item-source-context.test.ts
git status --short   # only the files above
git commit -m "feat(beads): allow a worktree to link a bead"
```

---

### Task 2: The `beads.actor` setting

**Files:**
- Modify: `src/shared/global-settings-types.ts` (near `defaultTuiAgent`, line 323)
- Modify: `src/shared/default-global-settings.ts` (near line 183)
- Modify: whichever persistence normalizer handles new string settings — the controller will name it after the typecheck
- Create: `src/renderer/src/components/settings/BeadsActorSetting.tsx`
- Modify: the Tasks settings pane that renders `BeadsSetupSteps` (`TaskSourceSimpleSetup.tsx`), to mount the field
- Test: `src/renderer/src/components/settings/BeadsActorSetting.test.tsx`

**Interfaces:**
- Produces: `GlobalSettings.beadsActor: string | null`; `BeadsActorSetting(): React.JSX.Element`.
- Consumed by Task 3 and Task 7, which pass it as the `actor` argument to `claimIssue`.

**Behavior:** a single-line text field. Empty means `null`, and `null` means bd's own default is used — `actorFlags` (`src/main/beads/beads-write-args.ts:15-17`) already emits nothing for a null actor, so no backend change is needed. Trim on save; a whitespace-only value stores `null`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => {
  const settings: { beadsActor: string | null } = { beadsActor: null }
  return { settings, updateSettings: vi.fn((patch: { beadsActor: string | null }) => patch) }
})

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ settings: mocks.settings, updateSettings: mocks.updateSettings }),
    { getState: () => ({ settings: mocks.settings, updateSettings: mocks.updateSettings }) }
  )
}))

import { BeadsActorSetting } from './BeadsActorSetting'

afterEach(() => {
  cleanup()
  mocks.settings.beadsActor = null
  vi.clearAllMocks()
})

describe('BeadsActorSetting', () => {
  it('stores a trimmed actor', () => {
    render(<BeadsActorSetting />)
    fireEvent.change(screen.getByLabelText('Beads actor'), { target: { value: '  sebastian  ' } })
    fireEvent.blur(screen.getByLabelText('Beads actor'))
    expect(mocks.updateSettings).toHaveBeenCalledWith({ beadsActor: 'sebastian' })
  })

  it('stores null for a whitespace-only actor so bd uses its own default', () => {
    render(<BeadsActorSetting />)
    fireEvent.change(screen.getByLabelText('Beads actor'), { target: { value: '   ' } })
    fireEvent.blur(screen.getByLabelText('Beads actor'))
    expect(mocks.updateSettings).toHaveBeenCalledWith({ beadsActor: null })
  })
})
```

- [ ] **Step 2: Predict the failure** — module not found.

- [ ] **Step 3: Add the setting**

`global-settings-types.ts`, beside `defaultTuiAgent`:
```ts
  /** Actor passed to bd writes as `--actor`. Null means bd's own default. */
  beadsActor: string | null
```
`default-global-settings.ts`: `beadsActor: null,`.

- [ ] **Step 4: Build the field**

Read an existing settings text field first (`src/renderer/src/components/settings/` has several) and follow its markup so the design gate passes. The label text must be `Beads actor` for the test's `getByLabelText` to match; if you deviate, change the test to match the markup and **say so in your report**. Commit on blur, not on every keystroke.

- [ ] **Step 5: Commit**

```bash
git status --short
git commit -m "feat(beads): add the beads actor setting"
```

---

### Task 3: Renderer write client and the claim store action

**Files:**
- Modify: `src/renderer/src/runtime/runtime-beads-client.ts`
- Modify: `src/renderer/src/store/slices/beads-slice-contract.ts`, `src/renderer/src/store/slices/beads.ts`
- Test: `src/renderer/src/runtime/runtime-beads-client.test.ts`, `src/renderer/src/store/slices/beads.test.ts`

**Interfaces:**
- Consumes: `window.api.beads.claimIssue(args: BeadsIssueActorArgs)` and RPC `beads.claimIssue` with `BeadsIssueActorParams = { repo, id, actor }` — both already exist.
- Produces:
  - `beadsClaimIssue(settings, repo, id, actor: string | null): Promise<BeadsResult<BeadsIssueDetails>>` in the client, routed exactly like the read functions (IPC for local/SSH, RPC for runtime-owned, never throws).
  - `claimBeadsIssue(repo, id): Promise<BeadsResult<BeadsIssueDetails>>` on `BeadsSlice`, reading the actor from `settings.beadsActor`.

**Behavior that matters:** the action **returns** its result rather than swallowing it — Task 7 needs to know whether the claim failed so it can warn without blocking. On success it writes the returned details into the `details` cache under the issue id and leaves everything else alone; the next change-token poll reconciles the lists. It does **not** optimistically mutate any list: M1's write service already re-reads the issue, and an optimistic path with no rollback is worse than a 5 s wait.

- [ ] **Step 1: Write the failing tests**

Add to `runtime-beads-client.test.ts`, reusing its existing typed `BeadsRepoRef` fixtures:
```ts
  it('claims through IPC for a local repo and passes the actor', async () => {
    beadsApi.claimIssue.mockResolvedValue({ ok: true, value: DETAILS })
    await beadsClaimIssue(null, LOCAL_REPO, 'cwf.3', 'sebastian')
    expect(beadsApi.claimIssue).toHaveBeenCalledWith({
      repoPath: '/work/app',
      repoId: 'r1',
      id: 'cwf.3',
      actor: 'sebastian'
    })
  })

  it('claims through RPC for a runtime repo', async () => {
    mocks.callRuntimeRpc.mockResolvedValue({ ok: true, value: DETAILS })
    await beadsClaimIssue(null, RUNTIME_REPO, 'cwf.3', null)
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      expect.anything(),
      'beads.claimIssue',
      { repo: 'r2', id: 'cwf.3', actor: null },
      expect.anything()
    )
  })
```
Add to `beads.test.ts`:
```ts
  it('claims with the configured actor and caches the returned details', async () => {
    const store = createTestStore()
    client.beadsClaimIssue.mockResolvedValue({
      ok: true,
      value: { issue: { id: 'cwf.3' }, dependencies: [], dependents: [], comments: [] }
    })
    const result = await store.getState().claimBeadsIssue(REPO, 'cwf.3')
    expect(client.beadsClaimIssue).toHaveBeenCalledWith(expect.anything(), REPO, 'cwf.3', null)
    expect(result.ok).toBe(true)
    expect(selectBeadsRepoState(store.getState(), 'r1').details['cwf.3']?.data?.issue.id).toBe('cwf.3')
  })

  it('returns the failure instead of throwing, so the caller can warn without blocking', async () => {
    const store = createTestStore()
    client.beadsClaimIssue.mockResolvedValue({ ok: false, error: { kind: 'busy', message: 'busy' } })
    const result = await store.getState().claimBeadsIssue(REPO, 'cwf.3')
    expect(result).toEqual({ ok: false, error: { kind: 'busy', message: 'busy' } })
  })
```
Add `beadsClaimIssue: vi.fn()` to that file's hoisted `client` mock.

- [ ] **Step 2: Predict the failures** — both modules lack the export; state that in your report.

- [ ] **Step 3: Implement the client wrapper**

Follow `callBeads` exactly as the read functions do; the only difference is the extra params:
```ts
export function beadsClaimIssue(
  settings: BeadsRuntimeSettings,
  repo: BeadsRepoRef,
  id: string,
  actor: string | null
): Promise<BeadsResult<BeadsIssueDetails>> {
  return callBeads(settings, repo, 'claimIssue', { id, actor }, (args) =>
    window.api.beads.claimIssue({ ...args, id, actor })
  )
}
```

- [ ] **Step 4: Implement the store action**

Add to the contract and the slice. Read the actor from `get().settings?.beadsActor ?? null`. On `result.ok`, write the details entry with the current `changeToken`; on failure, leave the cache untouched and return the result.

- [ ] **Step 5: Commit**

```bash
git status --short
git commit -m "feat(beads): claim a bead from the renderer"
```

---

### Task 4: Start worktree from a bead

**Files:**
- Create: `src/renderer/src/components/task-page/beads/beads-start-worktree.ts`
- Modify: `src/renderer/src/components/use-task-page-composer-actions.ts` (add `openComposerForBeadsItem` beside `openComposerForJiraItem`, lines 190-230)
- Modify: `src/renderer/src/components/task-page/beads/BeadsIssueRow.tsx`, `BeadsDetailSections.tsx`, `BeadsListPane.tsx`, `BeadsDetailPane.tsx`, `BeadsTaskPageBody.tsx` (thread one callback through)
- Test: `src/renderer/src/components/task-page/beads/beads-start-worktree.test.ts`, and extend `BeadsTaskPageBody.test.tsx`

**Interfaces:**
- Consumes: `BeadsIssue` (`src/shared/beads/beads-issue-types.ts`), `WorkspaceLinkedItem` (Task 1), `TaskSourceContext`, `openModal` from the UI slice.
- Produces:
  - `buildBeadsLinkedItem(issue: Pick<BeadsIssue, 'id' | 'title'>, repoId: string): WorkspaceLinkedItem`
  - `buildBeadsWorkspaceSeed(issue: Pick<BeadsIssue, 'id' | 'title'>): string` — `<id>-<title-slug>`, matching the spec's §5.1 naming
  - `buildBeadsTaskSourceContext(repo: BeadsRepoRef): TaskSourceContext`
  - `openComposerForBeadsItem(issue, repo)` on the composer-actions model
  - `onStartWorktree?: (issue: BeadsIssue) => void` threaded to rows and the detail pane

**Why a pure module:** the linked item, the seed name and the context are the parts worth testing exhaustively, and they need no DOM. The components only wire a callback.

- [ ] **Step 1: Write the failing test**

`beads-start-worktree.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildBeadsLinkedItem, buildBeadsWorkspaceSeed } from './beads-start-worktree'

describe('buildBeadsLinkedItem', () => {
  it('builds a linked item a worktree can persist', () => {
    expect(buildBeadsLinkedItem({ id: 'cwf.3', title: 'Run the playtest' }, 'repo-1')).toEqual({
      provider: 'beads',
      type: 'issue',
      number: 0,
      title: 'cwf.3 Run the playtest',
      url: 'bd://repo-1/cwf.3',
      beadsIdentifier: 'cwf.3',
      repoId: 'repo-1'
    })
  })
})

describe('buildBeadsWorkspaceSeed', () => {
  it('slugs the title after the id', () => {
    expect(buildBeadsWorkspaceSeed({ id: 'cwf.3', title: 'Run the playtest' })).toBe(
      'cwf.3-run-the-playtest'
    )
  })

  it('collapses punctuation and whitespace rather than emitting an unusable branch name', () => {
    expect(
      buildBeadsWorkspaceSeed({ id: 'x.1', title: 'Decide: does a "store line" count?' })
    ).toBe('x.1-decide-does-a-store-line-count')
  })

  it('falls back to the id alone when the title slugs to nothing', () => {
    expect(buildBeadsWorkspaceSeed({ id: 'x.1', title: '!!!' })).toBe('x.1')
  })
})
```

- [ ] **Step 2: Predict the failure** — module not found.

- [ ] **Step 3: Implement the pure module**

Before writing the slug, **read `getJiraIssueWorkspaceSeed` (`src/renderer/src/components/task-page-source-context.tsx:55`)** and follow its slugging rules rather than inventing new ones; if its behavior differs from the assertions above, follow it and update the test, saying so in your report.

- [ ] **Step 4: Add the composer action**

Mirror `openComposerForJiraItem` (`use-task-page-composer-actions.ts:190-223`), but note the difference: Jira must resolve a site and **refuses** if it cannot. Beads has no such ambiguity — the repo is the context — so there is no failure path and no toast:
```ts
  const openComposerForBeadsItem = useCallback(
    (issue: BeadsIssue, repo: BeadsRepoRef): void => {
      openModal('new-workspace-composer', {
        linkedWorkItem: buildBeadsLinkedItem(issue, repo.id),
        taskSourceContext: buildBeadsTaskSourceContext(repo),
        prefilledName: buildBeadsWorkspaceSeed(issue),
        initialRepoId: repo.id,
        telemetrySource: 'sidebar'
      })
    },
    [openModal]
  )
```

- [ ] **Step 5: Add the affordance**

A "Start worktree" button in the detail pane header, and on a row only on hover/focus so the dense list stays quiet. Read `BeadsIssueRow.tsx` first: the row is a `role="option"` whose children are presentational, so **the row button must be `aria-hidden` with `tabIndex={-1}`** exactly as the existing chevron is, and it must call `event.stopPropagation()` so starting a worktree does not also change the selection. The detail-pane button is a normal focusable `Button`.

- [ ] **Step 6: Extend the body test**

Add a test asserting that clicking the detail pane's Start worktree button calls `openModal` with `'new-workspace-composer'` and a payload whose `linkedWorkItem.beadsIdentifier` is the selected issue's id. Reuse the existing `installState` helper and typed `REPO` fixture.

- [ ] **Step 7: Commit**

```bash
git status --short
git commit -m "feat(beads): start a worktree from a bead"
```

---

### Task 5: The launch prompt

**Files:**
- Modify: `src/renderer/src/lib/linked-work-item-context.ts` (`getLinkedWorkItemPromptContext`, lines 153-177; `getLaunchableWorkItemDraftContent`, 179-200)
- Test: `src/renderer/src/lib/linked-work-item-context.test.ts` (extend, or create if absent)

**Interfaces:**
- Produces: for a beads linked item, `linkedContextBlocks` carries the spec's §5.1 text and `linkedUrls` is **empty**.

**Why empty URLs:** the synthetic `bd://` URL is not fetchable. Emitting it would put a dead link in the agent's prompt. Beads takes the same shape as Linear — a rendered text block — not the bare-URL fallback the other providers get.

The exact text from spec §5.1, which the test pins verbatim:
```
Linked Beads issue: <id> — <title>
Read it with `bd show <id>` (run `bd prime` for workflow context).
```

- [ ] **Step 1: Write the failing test**

```ts
  it('gives a beads item a readable block and no dead URL', () => {
    expect(
      getLinkedWorkItemPromptContext({
        provider: 'beads',
        url: 'bd://repo-1/cwf.3',
        title: 'cwf.3 Run the playtest',
        beadsIdentifier: 'cwf.3'
      })
    ).toEqual({
      linkedUrls: [],
      linkedContextBlocks: [
        'Linked Beads issue: cwf.3 — cwf.3 Run the playtest\n' +
          'Read it with `bd show cwf.3` (run `bd prime` for workflow context).'
      ]
    })
  })
```
Add a second test asserting a GitHub item still returns `{ linkedUrls: [url], linkedContextBlocks: [] }`, so a regression that routed everything through the beads branch fails.

- [ ] **Step 2: Predict the failure** — today the beads item falls through to the bare-URL path, so `linkedUrls` is `['bd://repo-1/cwf.3']` and `linkedContextBlocks` is `[]`.

- [ ] **Step 3: Implement**

Add a beads branch beside `isLinearWorkItemReference`. Reuse `buildContainedLinkedContextBlock` if the Linear path does — read lines 27-99 first and follow whatever containment/escaping it applies, because the bead's title is user-authored text reaching an agent prompt.

- [ ] **Step 4: Mirror it in the draft content** (`getLaunchableWorkItemDraftContent`) so a direct launch shows the same text, and test that.

- [ ] **Step 5: Commit**

```bash
git status --short
git commit -m "feat(beads): give the agent a readable beads launch prompt"
```

---

### Task 6: Starting on an epic

**Files:**
- Create: `src/renderer/src/lib/beads-epic-launch-context.ts`
- Modify: `src/renderer/src/components/task-page/beads/beads-start-worktree.ts` (call it when the issue is an epic)
- Test: `src/renderer/src/lib/beads-epic-launch-context.test.ts`

**Interfaces:**
- Produces: `buildBeadsEpicPromptBlock(epic, children: readonly Pick<BeadsIssue, 'id' | 'title'>[]): string`

**Spec §5.1 item 5:** starting on an epic creates **one** worktree whose prompt lists the epic's ready child IDs and titles. Splitting an epic across several agents is M7 and explicitly out of scope.

The children come from `bd ready --parent <id>`, which M1 already supports (`beads-read-args.ts:88-106`). **That view rejects `statuses` and `includeClosed`** — do not pass them.

- [ ] **Step 1: Write the failing test**

```ts
  it('lists ready children under the epic', () => {
    expect(
      buildBeadsEpicPromptBlock(
        { id: 'cwf', title: 'Story evaluation kit' },
        [
          { id: 'cwf.1', title: 'Decide the store line' },
          { id: 'cwf.2', title: 'Run the rating run' }
        ]
      )
    ).toBe(
      'Linked Beads epic: cwf — Story evaluation kit\n' +
        'Ready children:\n' +
        '- cwf.1 — Decide the store line\n' +
        '- cwf.2 — Run the rating run\n' +
        'Read any of them with `bd show <id>` (run `bd prime` for workflow context).'
    )
  })

  it('says so plainly when the epic has no ready children', () => {
    expect(buildBeadsEpicPromptBlock({ id: 'cwf', title: 'Story evaluation kit' }, [])).toBe(
      'Linked Beads epic: cwf — Story evaluation kit\n' +
        'No children are ready right now; check with `bd ready --parent cwf`.'
    )
  })
```

- [ ] **Step 2: Predict the failure** — module not found.

- [ ] **Step 3: Implement**, then wire it: when the selected issue's `issueType` is `epic`, the composer action fetches ready children first via the existing list path with `{ view: 'ready', filter: { parent: id }, limit: … }` and passes the epic block. **If that fetch fails, start the worktree anyway with the plain single-issue prompt** — a failed lookup must not block creating the workspace (spec §5.1 item 2: saving never waits on a bd lookup).

- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "feat(beads): list an epic's ready children in the launch prompt"
```

---

### Task 7: Auto-claim after the worktree exists

**Files:**
- Modify: the composer submit path (`src/renderer/src/hooks/composer-state/full-creation-execution.ts` and/or its callers — read them and pick the single place that runs *after* creation succeeds)
- Modify: `src/shared/global-settings-types.ts`, `src/shared/default-global-settings.ts` (add `beadsAutoClaim: boolean`, default `true`)
- Test: wherever the submit path is tested; add a focused test if none exists

**Spec §5.1 items 2-3, and the ordering is the whole point:**
1. The worktree is created. **Creation never waits on bd.**
2. Only if creation succeeded *and* auto-claim is on does `claim` run, with the configured actor.
3. A failed claim shows a **non-blocking warning** and the worktree stays.

- [ ] **Step 1: Write the failing test**

Assert three things: claim runs after a successful create; claim does **not** run when creation fails; a failed claim leaves the worktree and surfaces a warning rather than throwing. The third is the one that matters — a claim failure must never look like a creation failure.

- [ ] **Step 2: Predict the failures** — no claim call exists on that path today.

- [ ] **Step 3: Implement**

Call `claimBeadsIssue` from Task 3 only when the created worktree's `linkedWorkItem.provider === 'beads'`. Use `toast.warning` (or whatever the surrounding code uses for non-blocking notices — read it) with the failure's message. **Do not** await the claim before reporting creation success.

- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "feat(beads): claim a bead when its worktree is created"
```

---

### Task 8: `orca worktree create/set --beads-issue`

**Files:**
- Modify: `src/cli/specs/core.ts` (usage strings at lines 93 and 144)
- Modify: `src/cli/handlers/worktree.ts` (create ~186-228, set ~254-265)
- Create: `src/cli/handlers/worktree-beads-issue-link.ts`
- Test: `src/cli/handlers/worktree-beads-issue-link.test.ts`

**Interfaces:**
- Produces: `getOptionalBeadsIssueFlag(flags, name, options?: { allowNull?: boolean })`, mirroring `getOptionalLinearIssueLinkFlag` in `worktree-linear-issue-link.ts`.

**Behavior:** `--beads-issue <id>` on `create` and `set`; on `set`, the literal `null` clears the link, exactly as `--linear-issue` does. The flag builds the same `linkedWorkItem` Task 4 builds, so a CLI-created worktree and a UI-created one are indistinguishable in the record.

**Read `worktree-linear-issue-link.ts` first** and follow its shape. Validate the id the same way the backend does — reuse the shared bead-id check rather than inventing a regex (`src/shared/beads/beads-issue-id.ts`).

- [ ] **Step 1: Write the failing test** — a valid id builds the expected updates object; `null` with `allowNull` clears; an invalid id is rejected with a message naming the flag.
- [ ] **Step 2: Predict the failure** — module not found.
- [ ] **Step 3: Implement the parser, then wire both handlers and both usage strings.**
- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "feat(beads): link a bead from the CLI"
```

---

### Task 9: The removal-disposition prompt

**Files:**
- Create: `src/renderer/src/components/sidebar/beads-worktree-disposition.ts` (pure decision module)
- Create: `src/renderer/src/components/sidebar/BeadsWorktreeDisposition.tsx`
- Modify: `src/renderer/src/components/sidebar/DeleteWorktreeDialog.tsx`
- Test: `src/renderer/src/components/sidebar/beads-worktree-disposition.test.ts`, `BeadsWorktreeDisposition.test.tsx`

**This is the only genuinely new surface in M3.** There is no multi-choice disposition prompt anywhere in Orca's removal flow for any provider; the nearest structural precedent is the optional "delete all lineage" checkbox inside `DeleteWorktreeDialog.tsx`. Read that dialog fully before designing — the new control lives inside it, not in a second dialog.

**Spec §5.2:** removing or archiving a worktree whose bead is **still open** offers **Close with reason** · **Unclaim (back to open)** · **Leave as is**. Orca never closes a bead without asking.

**The rules that make this safe:**
- The prompt appears **only** when the worktree has a beads `linkedWorkItem` **and** the bead is still open. A closed bead gets no prompt — nothing to decide.
- **`Leave as is` is the default.** Deleting a worktree must never close a bead by inertia.
- Close requires a reason: `bd close` takes one, and the M1 arg builder validates it.
- Every disposition action runs **after** the worktree is removed, and a failure warns without blocking or reverting the removal — same rule as the claim in Task 7.

**Note on scope:** the write client from Task 3 exposes only `claim`, so this task adds two more client wrappers plus their store actions, mirroring Task 3 exactly. Both backends already exist:
- **Close** — `buildCloseArgs` / `closeBeadsIssue`, reachable through the same IPC and RPC surface as claim.
- **Unclaim** — `buildUpdateArgs` (`src/main/beads/beads-write-args.ts:74-111`) emits `--assignee=<value>` whenever `patch.assignee !== undefined`, and its own comment records that **an empty assignee is how the UI unassigns**. So an unclaim is `updateIssue(id, { assignee: '' })`; no new bd command is needed.

- [ ] **Step 1: Write the failing test for the decision module**

```ts
import { describe, expect, it } from 'vitest'
import { beadsDispositionNeeded } from './beads-worktree-disposition'

const OPEN_BEAD_WORKTREE = {
  linkedWorkItem: { provider: 'beads' as const, beadsIdentifier: 'cwf.3' },
  beadStatusCategory: 'active' as const
}

describe('beadsDispositionNeeded', () => {
  it('asks when a beads worktree is removed while its bead is open', () => {
    expect(beadsDispositionNeeded(OPEN_BEAD_WORKTREE)).toBe(true)
  })

  it('stays quiet when the bead is already closed', () => {
    expect(beadsDispositionNeeded({ ...OPEN_BEAD_WORKTREE, beadStatusCategory: 'done' })).toBe(false)
  })

  it('stays quiet for a worktree linked to another provider', () => {
    expect(
      beadsDispositionNeeded({
        linkedWorkItem: { provider: 'jira', jiraIdentifier: 'ORC-1' },
        beadStatusCategory: null
      })
    ).toBe(false)
  })

  it('stays quiet for a worktree with no linked item at all', () => {
    expect(beadsDispositionNeeded({ linkedWorkItem: null, beadStatusCategory: null })).toBe(false)
  })
})
```

- [ ] **Step 2: Predict the failure** — module not found. Also state where `beadStatusCategory` will come from; if the dialog has no access to the bead's current status without a fetch, **say so and stop** — that is a design question for the controller, not something to guess. Options the controller will weigh: read it from the beads store if the tab has it cached, fetch on dialog open, or store the last-known status on the worktree record.

- [ ] **Step 3: Implement the decision module**, then the component: three radio options with `Leave as is` selected, and a reason field enabled only when `Close with reason` is chosen. Follow the dialog's existing control markup; pass layout-only classes to any `components/ui` primitive.

- [ ] **Step 4: Wire it into the dialog** so the chosen disposition runs after a successful removal, and never blocks it.

- [ ] **Step 5: Commit**

```bash
git status --short
git commit -m "feat(beads): ask what to do with a bead when its worktree is removed"
```

---

### Task 10: End-to-end spec

**Files:**
- Create: `tests/e2e/beads-start-worktree.spec.ts`

`tests/e2e/` holds 375 specs; `tasks-page.spec.ts` and the `linear-*` specs are the closest precedents. **Read one of them fully before writing** — follow its fixture setup, its Electron launch helper and its assertion style rather than inventing a shape.

**What the spec must prove**, per the bead's own acceptance criteria (tab → tree → detail → Start worktree, linked item + prompt asserted):
1. The Beads tab lists issues from a fixture repo with a real `.beads` database.
2. Selecting an issue opens the detail pane.
3. Start worktree opens the composer pre-filled with the seed name.
4. Creating the workspace produces a worktree whose `linkedWorkItem` has `provider: 'beads'` and the right `beadsIdentifier`.
5. The agent's prompt contains the §5.1 launch text.

**Fixture note:** the spec needs a repo with a real bd database. Check whether the e2e harness already creates temp git repos; if it does, extend that with a `bd init` plus a couple of `bd create` calls, and **skip the spec when `bd` is not on PATH** rather than failing — CI may not have it. Say in your report which approach the harness supports.

- [ ] **Step 1: Read the precedent spec and report what the harness provides** before writing any test code.
- [ ] **Step 2: Write the spec.**
- [ ] **Step 3: Commit.**

```bash
git status --short
git commit -m "test(beads): cover starting a worktree from a bead end to end"
```

---

### Task 11: Gates, spec, milestone close

**Files:**
- Modify (fork-only, force-added): `docs/superpowers/specs/2026-09-15-beads-task-source-design.md`

**Steps 1 and 2 are the controller's** — it runs the localization syncs, all three typechecks, the full changed-lines gate, the beads suite, and a visual check. Do not run `pnpm`.

- [ ] **Step 1: Update the spec to match what M3 shipped**

Verify each claim against committed source before writing it:
- **§5.1:** record the linked-item representation the reviewer chose (synthetic `bd://` URL plus `beadsIdentifier`, or optional `url`), and note that the `issueCommand` override is **not** available to beads because `canUseIssueCommandForLinkedItemProvider` admits only GitHub and GitLab — that gate excludes Jira and Linear too, so this is a pre-existing limitation, not a beads regression.
- **§5.2:** mark the per-row agent-status badges as deferred, with the reason: no provider has such a badge today, so it is a new surface rather than a beads gap. Record that the removal-disposition prompt shipped.
- **§5.3:** record the `--beads-issue` flag as shipped on `create` and `set`; the `orca-beads` skill guide remains M6.
- **§11:** update the M3 row.

```bash
git add -f docs/superpowers/specs/2026-09-15-beads-task-source-design.md
git commit -m "docs(fork): record M3 scope decisions in the beads design spec"
```

- [ ] **Step 2: Close the milestone**

```bash
bd close orca-q11.4 --reason="Start worktree from a bead: linked item, composer pre-fill, auto-claim, launch prompt, epic children, --beads-issue CLI flag, removal disposition prompt"
bd ready
```
Report what `bd ready` prints.

- [ ] **Step 3: Hand off**

Report commits, what the controller's gates showed, anything parked, and that nothing was pushed. **The upstream PR (spec §11's M3 row) is a separate, outward-facing decision for the human — do not open it.**

---

## Self-review

Run this against the spec before dispatching Task 1.

**Spec coverage:** §5.1 items 1-5 → Tasks 4, 5, 6, 7 (and Task 1 for the link, Task 2 for the actor). §5.2 removal prompt → Task 9; badges → explicitly deferred. §5.3 CLI flag → Task 8; skill guide → M6. E2E → Task 10. Upstream PR → surfaced to the human, not planned as work.

**Placeholder scan:** every task carries either literal code or a named file to read first. Tasks 9 and 10 deliberately ask the implementer to **report before building** where the plan cannot know the answer (where the bead's status comes from; what the e2e harness provides) — those are explicit stop-and-ask points, not placeholders.

**Type consistency:** `buildBeadsLinkedItem` (Task 4) produces exactly the shape Task 1's `normalizeWorkspaceLinkedItem` accepts and Task 5's prompt builder reads. `claimBeadsIssue` (Task 3) is the only write Task 7 calls. `beadsActor` (Task 2) is read in Task 3, not re-read elsewhere.

**Known gap carried deliberately:** Task 9 needs close and unclaim wrappers that Task 3 does not build, because Task 3's scope is the claim path Task 7 needs. Task 9 says so and tells the implementer to check `buildUpdateArgs` for unassign support before designing. If it cannot express it, that is a backend gap for the controller to rule on.
