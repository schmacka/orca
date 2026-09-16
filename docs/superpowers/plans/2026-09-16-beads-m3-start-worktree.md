# Beads M3 — Start worktree from a bead Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start an agent worktree from a bead — linked item, composer pre-fill, auto-claim, a launch prompt the agent can act on, a `--beads-issue` CLI flag, and a prompt on worktree removal so a bead is never left claimed by accident.

**Architecture:** M1 built the whole write backend; `claim`, `close` and `update` all run end to end through IPC and RPC and stop at the renderer boundary. M2 built the read UI. So M3 adds renderer write wrappers plus store actions, widens Orca's `WorkspaceLinkedItem` union to carry a bead, and hangs a Start-worktree affordance off the existing quick-create composer. The only genuinely new surface is the removal-disposition prompt.

**Tech Stack:** React 19, Zustand store slices, Tailwind v4 tokens + shadcn primitives, Vitest + happy-dom + Testing Library, Playwright (Electron) for the end-to-end spec.

**Spec:** `docs/superpowers/specs/2026-09-15-beads-task-source-design.md` §5.1, §5.2, §5.3 (the `--beads-issue` flag only — the `orca-beads` skill guide is M6 per §11).

**Beads issue:** `orca-q11.4` — claim before starting, close in the last task.

**This plan was reviewed before execution and revised.** Twelve blocking defects were found in the first draft, two of which would have shipped a Start-worktree button producing a worktree with no bead identifier and a prompt containing a dead URL. The rulings below are settled; do not re-open them without evidence from the code.

## Settled rulings

1. **Link shape: synthetic URL.** `WorkspaceLinkedItem` gets `beadsIdentifier?: string`, `number: 0` (as Jira does), and `url: 'bd://<issueId>'` — **no repo segment**. The repo is already carried in the item's own `repoId` field, and `areWorkspaceLinkedItemsEqual` compares `repoId` and `beadsIdentifier` separately from `url`, so a repo segment would duplicate queryable data inside an opaque string. It also makes the CLI workable: neither `worktree create --repo <selector>` nor `worktree set --worktree <selector>` reliably has a repo id client-side, and resolving one would cost a round trip for a value nothing reads. `normalizeWorkspaceLinkedItem` rejects an empty `url` and backs both the persistence path *and* the zod params for `worktree.create`/`worktree.set`, so an optional `url` would mean changing that guard plus roughly twenty files across providers this milestone does not otherwise touch. **`beadsIdentifier` is the identity everywhere** — equality, provider resolution, claim, close. The URL is a persistence placeholder and must never reach an agent prompt.
2. **Prompt delivery: draft, not auto-submit.** The quick path sets the draft prompt whenever a linked-context block exists, which is what Linear does. A bead behaves the same: the launch text lands in the composer draft for the user to send.
3. **The composer gets a real `beads` source kind.** `buildWorkspaceSourceSelection` maps every unrecognised provider to `github-issue`; without a new kind a bead renders with a GitHub icon. M3 introduces beads to the composer, so it owns the kind.
4. **Removal scope: the three dialog paths.** Normal delete, force-delete and lineage-delete-all get the disposition, and an open bead forces the dialog even when "don't ask again" is set — the same override `hasLineageChildren` already uses. Batch cleanup, CLI `worktree rm` and archive are **out of scope and get a follow-up bead**, recorded in the last task rather than half-covered.
5. **The CLI does not fetch the title.** `--beads-issue <id>` sets `title: id`. `create` already requires `--name`, the title is cosmetic in the record, and skipping the round-trip keeps the flag offline-safe. Recorded as a limitation.

## Global Constraints

- **Implementers run no `pnpm` commands at all** — no `tc`, no `lint`, no `test`, no localization sync. A parallel typecheck thrashes this 8 GB machine and has killed agent sessions at a 600 s stall watchdog. The controller runs every verification and feeds results back. Write the failing test first, state in your report which failure you expect and why, then implement.
- **Check the real source before trusting this plan.** Eleven defects were found in M2's plan during execution and twelve in this plan's first draft. If the plan and the committed code disagree, **follow the code** and say so in your report.
- **Test fixtures are annotated with their real types**, never cast into place. `as never`, `as Record<string, unknown>` and `as SomeType` on a fixture are defects. `Repo` needs only `id`, `path`, `displayName`, `badgeColor`, `addedAt`.
- **Mocks carry real parameter signatures**, and a mock must be able to express both sides of the branch it tests. A mock pinned to one value hides the branch it was meant to exercise.
- **A mocked module's imported symbol keeps its real type.** Arguments must satisfy the genuine signature.
- Control-flow narrowing only narrows *union* types: `const x: SomeRecord = {}` keeps its type; `const y: A | null = null` narrows to `null`.
- **Design system**, enforced by `pnpm run check:code-quality:changed`: tokens only; `components/ui` primitives take **layout-only** `className`. **Read a primitive's base classes before styling it.** An existing file's classes are evidence of what the gate tolerated when written, not of what it permits now.
- Every user-visible string goes through `translate('auto.components.<area>.<name>', 'English')`, never at module top level. Only `en.json` gets new keys; the controller runs the syncs. **Every new string needs a key** — the actor field, the auto-claim checkbox, three radio labels, the reason field, and every toast.
- `.ts` ≤ 300 lines, `.tsx` ≤ 400 lines (blanks and comments excluded); never a `max-lines` disable.
- Component tests start with `// @vitest-environment happy-dom` and import `'@testing-library/jest-dom/vitest'`.
- Inline `type` imports. **No `as` casts** outside `as const`; an unavoidable one carries its SAFETY comment on **the line holding the cast**.
- No new `@ts-nocheck`. Never hard-code `metaKey`.
- **M3 is the milestone's first renderer write.** Every write follows an explicit user action. No write on render, hover or selection. Every write failure is reported as *itself*, never as a creation or removal failure.
- Commit trailers, exactly:
  ```
  Co-Authored-By: Claude <model> <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016WpdEv8mKGKnbFSPk884i5
  ```

## What already exists — do not rebuild

| Capability | Where |
|---|---|
| `bd update <id> --claim` argv | `src/main/beads/beads-write-args.ts:113-115` |
| `bd update` with assignee/status patches | `beads-write-args.ts:74-111` (empty assignee unassigns) |
| `bd close` argv | `beads-write-args.ts:117-125` |
| Write services with read-back | `src/main/beads/beads-write-service.ts` |
| IPC + preload + RPC for every write | `src/main/ipc/beads.ts:77-79`, `src/preload/api/beads-api.ts:34`, `src/main/runtime/rpc/methods/beads.ts:59-64` |
| Real-`bd` integration test for claim | `beads-bd-integration.test.ts:111-116` — claim sets status **and** assignee |
| `bd ready --parent <id>` | `beads-read-args.ts:88-106` (rejects `statuses`/`includeClosed`) |
| Renderer read client, five functions | `src/renderer/src/runtime/runtime-beads-client.ts:108-149` |

**Missing, and built here:** renderer write wrappers, store write actions, the `beadsActor`/`beadsAutoClaim` settings, and everything that teaches Orca's own surfaces what a bead is.

## The path that actually runs

The Beads tab opens `NewWorkspaceComposerModal`, which sets `createGateMode: 'quick'` (`:146`) and submits through `submitQuick` (`:187`):

```
BeadsTaskPageBody → openModal('new-workspace-composer', …)
  → NewWorkspaceComposerModal (quick gate)
    → submitQuick → quick-creation-execution.ts
      → resolveQuickCreateLinkedWorkItemPrompt   ← the prompt builder that matters
      → buildQuickCreationRequest → runBackgroundWorktreeCreation
        → worktree-creation-flow-execute.ts:129  ← where the worktree exists
```

`full-creation-execution.ts` is the **sidebar** composer and is never reached from the Beads tab. Where a task says "the submit path", it means the quick path above.

## File structure

```
src/shared/worktree/types.ts, workspace-linked-item.ts,
  workspace-linked-item-source-context.ts, workspace-name.ts,
  new-workspace/workspace-source.ts, new-workspace/smart-workspace-command-value.ts   union + copies (Task 1)
src/renderer/src/components/sidebar/folder-workspace-composer-helpers.ts             identifier passthrough (Task 1)
src/renderer/src/store/slices/ui/ui-slice-contract-core.ts,
  hooks/composer-state/derived-model.ts,
  components/new-workspace/use-smart-workspace-name-field-presentation.ts            union copies (Task 1)
src/cli/specs/core.ts, src/cli/handlers/worktree.ts,
  src/cli/handlers/worktree-beads-issue-link.ts                                      --beads-issue (Task 2)
src/shared/global-settings-types.ts, default-global-settings.ts,
  src/shared/rpc-contract/client-settings-params.ts                                  settings (Task 3)
src/renderer/src/components/settings/BeadsWorkflowSettings.tsx                       actor + auto-claim (Task 3)
src/renderer/src/runtime/runtime-beads-client.ts                                     claim/close/update (Task 4)
src/renderer/src/store/slices/beads.ts, beads-slice-contract.ts                      write actions (Task 4)
src/renderer/src/lib/linked-work-item-context.ts                                     3 prompt builders (Task 5)
src/renderer/src/components/task-page/beads/beads-start-worktree.ts                  builders (Task 6)
src/renderer/src/components/task-page/beads/BeadsTaskPageBody.tsx + rows + detail     affordance (Task 6)
src/shared/new-workspace/workspace-source.ts                                         beads source kind (Task 6)
src/renderer/src/lib/beads-epic-launch-context.ts                                    epic block (Task 7)
src/renderer/src/lib/beads-worktree-auto-claim.ts                                    claim after create (Task 8)
src/renderer/src/lib/worktree-creation-flow-execute.ts                               one call site (Task 8)
src/renderer/src/components/sidebar/beads-worktree-disposition.ts                    decision + actions (Task 9)
src/renderer/src/components/sidebar/use-beads-disposition.ts,
  BeadsWorktreeDisposition.tsx                                                       hook + UI (Task 10)
src/renderer/src/components/sidebar/DeleteWorktreeDialog.tsx, delete-worktree-flow.ts wiring (Task 11)
tests/e2e/beads-start-worktree.spec.ts                                               e2e (Task 12)
```

---

### Task 1: Teach every copy of the linked-item union about beads

The union is declared once and **hand-copied in five other places**. Widening only the declaration leaves the branch uncompilable, so this task changes all of them in one commit.

**Files:**
- Modify: `src/shared/worktree/types.ts` (`WorkspaceLinkedItem`, :10-19)
- Modify: `src/shared/workspace-linked-item.ts` (`normalizeWorkspaceLinkedItem` provider guard :30-36, identifier passthrough :56-62; `areWorkspaceLinkedItemsEqual` :19-20)
- Modify: `src/shared/workspace-linked-item-source-context.ts` (`resolveLinkedItemProvider` :18-19 — thread `beadsIdentifier`)
- Modify: `src/renderer/src/components/sidebar/folder-workspace-composer-helpers.ts` (`toFolderWorkspaceLinkedTask` :61-78 — **this whitelist is why the identifier would otherwise be dropped before persistence**)
- Modify: `src/shared/workspace-name.ts` (`WorkspaceIntentWorkItem.provider` :50; `getLinkedWorkItemWorkspaceName` :173-188 — `identifier = linearIdentifier ?? jiraIdentifier` must learn `beadsIdentifier`, or a bead is named "Issue 0")
- Modify: `src/shared/new-workspace/workspace-source.ts` (`toWorkspaceIntentItem` :172), `src/shared/new-workspace/smart-workspace-command-value.ts:16`
- Modify: `src/renderer/src/store/slices/ui/ui-slice-contract-core.ts:81`, `src/renderer/src/hooks/composer-state/derived-model.ts:19`, `src/renderer/src/components/new-workspace/use-smart-workspace-name-field-presentation.ts:183`
- Test: `src/shared/workspace-linked-item.test.ts` (create), `src/shared/workspace-name.test.ts` (extend or create)

**Also:** grep `mobile/` for hand-written copies of the provider union and report what you find, even if nothing.

**Interfaces:**
- Produces: `provider` includes `'beads'`; `WorkspaceLinkedItem.beadsIdentifier?: string`; `WorkspaceIntentWorkItem.beadsIdentifier?: string`; `toFolderWorkspaceLinkedTask` and `normalizeWorkspaceLinkedItem` both carry the identifier through; `getLinkedWorkItemWorkspaceName` names a bead by its id.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeWorkspaceLinkedItem } from './workspace-linked-item'

const BEAD_INPUT = {
  provider: 'beads',
  type: 'issue',
  number: 0,
  title: 'cwf.3 Run the playtest',
  url: 'bd://cwf.3',
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
```
The second test requires a real guard — add `if (raw.provider === 'beads' && !identifier) return null` in Step 3. Without it the assertion is meaningless, which is exactly the defect the first draft of this plan shipped.

Add to `workspace-name.test.ts`:
```ts
  it('names a bead by its identifier, not "Issue 0"', () => {
    expect(
      getLinkedWorkItemWorkspaceName({
        provider: 'beads',
        type: 'issue',
        number: 0,
        title: 'Run the playtest',
        url: 'bd://cwf.3',
        beadsIdentifier: 'cwf.3'
      })
    ).toContain('cwf.3')
  })
```

- [ ] **Step 2: Predict the failures.** For `workspace-linked-item.test.ts` the provider guard at :30-36 returns `null`, so test 1 fails on `toEqual` and test 2 **passes for the wrong reason** — say so in your report, and note it only becomes meaningful once Step 3 adds the identifier guard.

- [ ] **Step 3: Widen the declaration and every copy.** Add the identifier guard described above. Thread `beadsIdentifier` through `normalizeWorkspaceLinkedItem`, `toFolderWorkspaceLinkedTask`, `resolveLinkedItemProvider`, `areWorkspaceLinkedItemsEqual` and `WorkspaceIntentWorkItem`.

- [ ] **Step 4: Note what does *not* change.** `isWorkspaceLinkedItemSourceContextMatch` needs **no** beads branch: it returns `true` at :39-41 for every provider except Jira. State this in your report so the reviewer does not hunt for a missing branch. Note the consequence: any bead matches any beads context regardless of repo, which is safe only because the composer drops the source on repo change (Task 6 tests that).

- [ ] **Step 5: Commit**

```bash
git status --short
git commit -m "feat(beads): allow a worktree to link a bead"
```

---

### Task 2: `orca worktree create/set --beads-issue`

Second on purpose: it exercises the Task 1 normalization and the RPC round-trip without touching the renderer, so a dropped identifier surfaces here rather than three tasks later.

**Files:**
- Create: `src/cli/handlers/worktree-beads-issue-link.ts`
- Modify: `src/cli/specs/core.ts` (usage :92-93 and :144), `src/cli/handlers/worktree.ts` (create :185-249, set :250-265)
- Test: `src/cli/handlers/worktree-beads-issue-link.test.ts`

**Precedent:** `src/cli/handlers/worktree-linear-issue-link.ts`. There is **no** `worktree-linear-issue-link.test.ts`; the nearest test precedent is `linear.test.ts`.

**Per ruling 5:** `title: id`, no details fetch. Validate the id with the shared checker in `src/shared/beads/beads-issue-id.ts` — do not write a regex.

- [ ] **Step 1: Write the failing test** — a valid id produces `{ linkedWorkItem: { provider: 'beads', type: 'issue', number: 0, title: <id>, url: 'bd://<id>', beadsIdentifier: <id> } }`; `null` with `allowNull` clears; an invalid id is rejected with a message naming `--beads-issue`.

  **The URL carries no repo segment** (settled ruling 1), so the flag needs no repo id at all: build `bd://<id>` directly. The item's `repoId` field is populated server-side from the resolved repo; leave it unset in the CLI-built item.

- [ ] **Step 2: Predict the failure** — module not found.
- [ ] **Step 3: Implement the parser; wire both handlers and both usage strings.**
- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "feat(beads): link a bead from the CLI"
```

---

### Task 3: Beads workflow settings

**Files:**
- Modify: `src/shared/global-settings-types.ts` (beside `defaultTuiAgent` :323), `src/shared/default-global-settings.ts` (:183)
- Modify: `src/shared/rpc-contract/client-settings-params.ts` — **this schema is `.strict()` (:122)**, so a new key not added here is rejected at runtime for paired web and mobile clients while typechecking cleanly. Add both keys.
- Create: `src/renderer/src/components/settings/BeadsWorkflowSettings.tsx`
- Modify: the Tasks settings pane that renders `BeadsSetupSteps`
- Test: `src/renderer/src/components/settings/BeadsWorkflowSettings.test.tsx`

**Interfaces:**
- Produces: `GlobalSettings.beadsActor: string | null` (empty → `null`, and `actorFlags` already emits nothing for null, so bd's own default applies) and `GlobalSettings.beadsAutoClaim: boolean` (default `true`).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => {
  const settings: { beadsActor: string | null; beadsAutoClaim: boolean } = {
    beadsActor: null,
    beadsAutoClaim: true
  }
  // Async: call sites do `void updateSettings(...).catch(...)`, so a plain value throws.
  return { settings, updateSettings: vi.fn(async (_patch: Partial<typeof settings>) => {}) }
})

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ settings: mocks.settings, updateSettings: mocks.updateSettings }),
    { getState: () => ({ settings: mocks.settings, updateSettings: mocks.updateSettings }) }
  )
}))

import { BeadsWorkflowSettings } from './BeadsWorkflowSettings'

afterEach(() => {
  cleanup()
  mocks.settings.beadsActor = null
  mocks.settings.beadsAutoClaim = true
  vi.clearAllMocks()
})

describe('BeadsWorkflowSettings', () => {
  it('writes the actor on blur and not on every keystroke', () => {
    render(<BeadsWorkflowSettings />)
    const field = screen.getByLabelText('Beads actor')
    fireEvent.change(field, { target: { value: '  sebastian  ' } })
    // The constraint made testable: typing must not write.
    expect(mocks.updateSettings).not.toHaveBeenCalled()
    fireEvent.blur(field)
    expect(mocks.updateSettings).toHaveBeenCalledWith({ beadsActor: 'sebastian' })
  })

  it('stores null for a whitespace-only actor so bd uses its own default', () => {
    render(<BeadsWorkflowSettings />)
    const field = screen.getByLabelText('Beads actor')
    fireEvent.change(field, { target: { value: '   ' } })
    fireEvent.blur(field)
    expect(mocks.updateSettings).toHaveBeenCalledWith({ beadsActor: null })
  })

  it('toggles auto-claim', () => {
    render(<BeadsWorkflowSettings />)
    fireEvent.click(screen.getByLabelText('Claim a bead when its worktree is created'))
    expect(mocks.updateSettings).toHaveBeenCalledWith({ beadsAutoClaim: false })
  })
})
```

- [ ] **Step 2: Predict the failure** — module not found.
- [ ] **Step 3: Add both settings keys, the `client-settings-params` entries, and the component.** Read an existing settings field first and follow its markup. If your labels differ from the queries above, change the tests and say so.
- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "feat(beads): add the beads actor and auto-claim settings"
```

---

### Task 4: Renderer write client and store actions

All three writes together — they sit on identical scaffolding, and splitting them duplicates the mock setup and makes Task 9 larger.

**Files:**
- Modify: `src/renderer/src/runtime/runtime-beads-client.ts`, `src/renderer/src/store/slices/beads-slice-contract.ts`, `src/renderer/src/store/slices/beads.ts`
- Test: `runtime-beads-client.test.ts`, `beads.test.ts`

**Interfaces:**
- `beadsClaimIssue(settings, repo, id, actor): Promise<BeadsResult<BeadsIssueDetails>>`
- `beadsCloseIssue(settings, repo, id, reason, actor): Promise<BeadsResult<BeadsIssueDetails>>`
- `beadsUpdateIssue(settings, repo, id, patch, actor): Promise<BeadsResult<BeadsIssueDetails>>`
- Store: `claimBeadsIssue(repo, id)`, `closeBeadsIssue(repo, id, reason)`, `unclaimBeadsIssue(repo, id)` — each **returns** its `BeadsResult` so callers can warn without blocking.

**Unclaim is not just an empty assignee.** `--claim` sets `status: in_progress` **and** `assignee` (`beads-bd-integration.test.ts:111-112`). "Back to open" therefore means `updateIssue(id, { assignee: '', status: 'open' })`; both fields are expressible in `buildUpdateArgs` (:83-95).

**After any successful write, call `pollBeadsChangeToken(repo)`** so the lists refresh now instead of within five seconds.

- [ ] **Step 1: Write the failing tests**

In `runtime-beads-client.test.ts`: add `claimIssue`, `closeIssue`, `updateIssue` to the `beadsApi` mock (it has none today), and define a `DETAILS` fixture typed as `BeadsIssueDetails` (the file has none). Pin the RPC assertions the way the existing tests do — the real target `{ kind: 'environment', environmentId: 'env-1' }` and `{ timeoutMs: 45_000 }`, not `expect.anything()`.

In `beads.test.ts`, the existing `createTestStore` pins `settings: null`. Add a variant with `settings: { beadsActor: 'sebastian', beadsAutoClaim: true }` and assert the actor **is** `'sebastian'` — asserting `null` against the existing store cannot distinguish "reads the setting" from "hard-codes null".

- [ ] **Step 2: Predict the failures** and name which are type errors versus runtime failures.
- [ ] **Step 3: Implement**, following `callBeads` exactly as the read wrappers do.
- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "feat(beads): claim, close and unclaim a bead from the renderer"
```

---

### Task 5: The launch prompt — all three builders

**Files:**
- Modify: `src/renderer/src/lib/linked-work-item-context.ts`
- Test: `src/renderer/src/lib/linked-work-item-context.test.ts` (exists)

**There are three builders, and the one the Beads tab actually uses is the third:**

| Builder | Used by | Today, for a bead |
|---|---|---|
| `getLinkedWorkItemPromptContext` (:153-177) | full composer | bare URL |
| `getLaunchableWorkItemDraftContent` (:179-200) | direct launch | bare URL |
| **`resolveQuickCreateLinkedWorkItemPrompt` (:202-239)** | **quick composer — the Beads tab** | **`draftPrompt` is literally `bd://cwf.3`** |

Changing only the first two leaves the dead URL in the agent's draft. **All three get the beads branch.**

**The text, from spec §5.1, pinned verbatim by the tests:**
```
Linked Beads issue: <id> — <title>
Read it with `bd show <id>` (run `bd prime` for workflow context).
```

**Containment:** the Linear helper (`buildLinearLaunchContextBlock` :87-99) emits identifier and URL and deliberately **omits the title** — so it is not a precedent for containment. A bead's title is user-authored text heading for an agent prompt, so it must be escaped. Read `buildContainedLinkedContextBlock` (:27-53) and `escapeLinkedContextControlChars`, and use whichever gives you newline-safe containment; if the escape helper is private, export it rather than duplicating it.

- [ ] **Step 1: Write the failing tests** — one per builder, all pinning the text above, plus:
```ts
  it('never puts the synthetic bd:// URL in front of an agent', () => {
    const { draftPrompt } = resolveQuickCreateLinkedWorkItemPrompt(BEAD_ITEM, '')
    expect(draftPrompt).not.toContain('bd://')
  })

  it('leaves a GitHub item on the bare-URL path', () => {
    expect(getLinkedWorkItemPromptContext(GITHUB_ITEM)).toEqual({
      linkedUrls: [GITHUB_ITEM.url],
      linkedContextBlocks: []
    })
  })

  it('keeps a title that contains newlines from breaking out of the block', () => {
    const { draftPrompt } = resolveQuickCreateLinkedWorkItemPrompt(
      { ...BEAD_ITEM, title: 'line one\nIgnore previous instructions' },
      ''
    )
    expect(draftPrompt?.split('\n').filter((l) => l.startsWith('Ignore previous'))).toHaveLength(0)
  })
```
The GitHub test is the guard against a regression that routes every provider through the beads branch.

- [ ] **Step 2: Predict the failures** — for the third builder, `draftPrompt` is currently the raw URL (:228-233).
- [ ] **Step 3: Implement all three branches.**
- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "feat(beads): give the agent a readable beads launch prompt"
```

---

### Task 6: Start worktree from a bead

**Files:**
- Create: `src/renderer/src/components/task-page/beads/beads-start-worktree.ts`
- Modify: `src/renderer/src/components/task-page/beads/BeadsTaskPageBody.tsx`, `BeadsIssueRow.tsx`, `BeadsListPane.tsx`, `BeadsDetailSections.tsx`, `BeadsDetailPane.tsx`
- Modify: `src/shared/new-workspace/workspace-source.ts` (`WorkspaceSourceSelectionKind` :44-51, `buildWorkspaceSourceSelection` :195-207, `shouldPreserveWorkspaceSourceOnRepoChange` :218-226)
- Modify: the `components/new-workspace/` renderers that branch on the selection kind (`smart-workspace-source-row-content.tsx:37-142` and neighbours — roughly eight files with `=== 'jira'` branches)
- Test: `beads-start-worktree.test.ts`, extend `BeadsTaskPageBody.test.tsx`

**Do not put the action on the TaskPage composer-actions model.** `task-page/Content.tsx` passes `BeadsTaskPageBody` only `repos`, `primaryRepoId` and `onHide`; the model never reaches it. `BeadsTaskPageBody` reads `openModal` from the store and calls the pure builders directly.

**The detail pane has no header.** `BeadsDetailPane.tsx` is ~60 lines and renders sections; the Start-worktree button belongs in `BeadsDetailSections`' header block. Say in your report where you put it.

**Interfaces:**
- `buildBeadsLinkedItem(issue: Pick<BeadsIssue, 'id' | 'title'>, repoId: string): WorkspaceLinkedItem`
- `buildBeadsWorkspaceSeed(issue): string`
- `buildBeadsTaskSourceContext(repo: BeadsRepoRef): TaskSourceContext`

**`buildBeadsTaskSourceContext` must satisfy `normalizeTaskSourceContext` (non-empty `projectId`) and `getMatchingLinkedTaskSourceContext` (`useComposerState.ts:191-196`).** M2 left no beads context builder to copy — model it on `getTaskPageRepoSourceContext` (`task-page-source-context.tsx:66-90`) for `projectId`, `hostId` and `projectHostSetupId`.

- [ ] **Step 1: Write the failing tests**

```ts
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
```
The second test is the regression guard for the defect that nearly shipped: the identifier being whitelisted away before the worktree record is written.

Seed-name cases (verified against `slugifyForWorkspaceName`, `workspace-name.ts:23-39`):
```ts
  expect(buildBeadsWorkspaceSeed({ id: 'cwf.3', title: 'Run the playtest' })).toBe('cwf.3-run-the-playtest')
  expect(buildBeadsWorkspaceSeed({ id: 'x.1', title: 'Decide: does a "store line" count?' })).toBe('x.1-decide-does-a-store-line-count')
  expect(buildBeadsWorkspaceSeed({ id: 'x.1', title: '!!!' })).toBe('x.1')
```

And in `BeadsTaskPageBody.test.tsx` — **its store mock is a bare record with no `openModal`; add one**:
```ts
  it('opens the composer pre-filled with the selected bead', () => {
    installState({ data: READY, error: null, loading: false, token: null }, { [readyKey]: PAGE })
    renderBody()
    fireEvent.click(screen.getByRole('button', { name: 'Start worktree' }))
    expect(mocks.openModal).toHaveBeenCalledWith(
      'new-workspace-composer',
      expect.objectContaining({
        linkedWorkItem: expect.objectContaining({ provider: 'beads', beadsIdentifier: 'e1' }),
        prefilledName: expect.stringContaining('e1')
      })
    )
  })
```

- [ ] **Step 2: Predict the failures.**
- [ ] **Step 3: Implement the pure module.** Read `getJiraIssueWorkspaceSeed` (`task-page-source-context.tsx:55`) and follow its slugging; if it disagrees with the assertions, follow it and update the tests, saying so.
- [ ] **Step 4: Add the `beads` source kind** and give the composer's source row a beads icon and label. Add a test that `shouldPreserveWorkspaceSourceOnRepoChange` returns `false` for beads — switching repo must drop the bead, since a bead id means nothing in another repo.
- [ ] **Step 5: Add the affordance.** Detail-pane button: a normal focusable `Button`. Row button: the row is a `role="option"` whose children are presentational, so it is `aria-hidden` with `tabIndex={-1}` and calls `event.stopPropagation()` — exactly like the existing chevron. Follow that precedent rather than inventing one.
- [ ] **Step 6: Commit**

```bash
git status --short
git commit -m "feat(beads): start a worktree from a bead"
```

---

### Task 7: Starting on an epic

**Files:**
- Create: `src/renderer/src/lib/beads-epic-launch-context.ts`
- Modify: `src/renderer/src/components/task-page/beads/beads-start-worktree.ts` and `BeadsTaskPageBody.tsx`
- Test: `beads-epic-launch-context.test.ts`, extend `BeadsTaskPageBody.test.tsx`

**The composer accepts no prompt.** `NewWorkspaceComposerModal` reads only `prefilledName`, `linkedWorkItem`, `initialGitHubWorkItem`, `taskSourceContext`, `initialRepoId` and `telemetrySource`; `initialPrompt` is hard-coded `''` and commented "intentionally ignored". **The only channel is `LinkedWorkItemSummary.linkedContext`** (`lib/new-workspace.ts:34-40`: `{ provider, version: 1, renderedText }`), which Task 5's builders read. So the epic block travels *inside the linked item*.

**Two consequences to honour:**
- `toFolderWorkspaceLinkedTask` must carry `linkedContext` through, or the block dies at the same whitelist that would have dropped the identifier. Task 1 fixes the identifier; **check `linkedContext` too and fix it here if Task 1 missed it.**
- Children titles are untrusted prose reaching an agent — render through `buildContainedLinkedContextBlock`.

**Do not fetch before opening the modal.** The RPC timeout is 45 s (`BEADS_RPC_TIMEOUT_MS`); a slow fetch would freeze the click. Open the composer immediately with the single-issue prompt, fetch the children alongside, and update the draft when they arrive. **If the fetch fails, the worktree still starts with the plain prompt** — spec §5.1 item 2: saving never waits on bd.

Call `beadsListIssues` from the client directly: `loadBeadsList` returns `void` and caches by key, which is the wrong shape here.

- [ ] **Step 1: Write the failing tests**
```ts
  it('lists ready children under the epic', () => {
    expect(
      buildBeadsEpicPromptBlock({ id: 'cwf', title: 'Story evaluation kit' }, [
        { id: 'cwf.1', title: 'Decide the store line' },
        { id: 'cwf.2', title: 'Run the rating run' }
      ])
    ).toBe(
      'Linked Beads epic: cwf — Story evaluation kit\n' +
        'Ready children:\n' +
        '- cwf.1 — Decide the store line\n' +
        '- cwf.2 — Run the rating run\n' +
        'Read any of them with `bd show <id>` (run `bd prime` for workflow context).'
    )
  })

  it('says so plainly when nothing is ready', () => {
    expect(buildBeadsEpicPromptBlock({ id: 'cwf', title: 'Story evaluation kit' }, [])).toBe(
      'Linked Beads epic: cwf — Story evaluation kit\n' +
        'No children are ready right now; check with `bd ready --parent cwf`.'
    )
  })
```
Plus a body test proving the block **reaches the request**, not merely that the string builder works:
```ts
  it('carries the epic block to the composer as linkedContext', async () => { … })
```
Without that, Task 7's tests are string assertions about a function nothing calls.

- [ ] **Step 2: Predict the failures.**
- [ ] **Step 3: Implement**, using `{ view: 'ready', filter: { parent: id } }` — that view **rejects `statuses` and `includeClosed`**, so do not pass them.
- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "feat(beads): list an epic's ready children in the launch prompt"
```

---

### Task 8: Auto-claim after the worktree exists

**Files:**
- Create: `src/renderer/src/lib/beads-worktree-auto-claim.ts`
- Modify: `src/renderer/src/lib/worktree-creation-flow-execute.ts` (one call site)
- Test: `beads-worktree-auto-claim.test.ts`

**The hook point is `worktree-creation-flow-execute.ts` after `const worktree = result.worktree` (:129) and after the cancellation check (:131-137)** — a cancelled creation must not claim. That file is 322 gross lines, so the logic lives in its own module and the edit there is a few lines.

**Write-safety rules, all load-bearing:**
- **Fire and forget with its own `.catch`.** `startWorktreeCreation` (`worktree-creation-flow.ts:27-40`) catches throws and marks the pending creation `status: 'error'` with a *creation-failed* toast. A claim that throws inside that scope would report a successful creation as a failure.
- **Never inside a retryable step.** `retryStructuredWorktreeLaunch` (:14) re-runs launch; a claim there would claim twice.
- **Build the `BeadsRepoRef` from `state.repos` by `repoId`**, not from the request — the ephemeral-VM path rewrites the host.
- **Respect `beadsAutoClaim`** and skip entirely when the linked item is not a bead.
- On failure: `toast.warning` naming the bead and the error. The worktree stays.
- On success: a brief confirmation ("Claimed cwf.3") so the milestone's first automatic write is visible at the moment it happens.

- [ ] **Step 1: Write the failing tests** — claims after a successful create with the right arguments (repo ref, id from `beadsIdentifier`, actor from settings); does not claim when the item is not a bead; does not claim when `beadsAutoClaim` is false; a claim rejection produces a warning and **does not** throw into the caller. The last one is the point: assert the function resolves.
- [ ] **Step 2: Predict the failures** — module not found.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "feat(beads): claim a bead when its worktree is created"
```

---

### Task 9: The disposition decision and its write actions

Split from the UI on purpose: this half is pure and exhaustively testable.

**Files:**
- Create: `src/renderer/src/components/sidebar/beads-worktree-disposition.ts`
- Test: `beads-worktree-disposition.test.ts`

**Interfaces:**
- `type BeadsDisposition = 'close' | 'unclaim' | 'leave'`
- `beadsDispositionNeeded(input: { linkedWorkItem; beadStatusCategory: BeadsStatusCategory | null }): boolean`
- `runBeadsDisposition(args: { disposition; repo; issueId; reason }): Promise<BeadsResult<…> | null>` — returns `null` for `'leave'`

**The predicate rule, and it is the one the first draft got wrong:** `BeadsStatusCategory` is `'active' | 'wip' | 'frozen' | 'done'` (`src/shared/beads/beads-issue-types.ts:1`). **A claimed bead is `in_progress`, which is `'wip'`** — the case this prompt exists for. So the rule is `category !== 'done'`, never `category === 'active'`. A positive control that only uses `'active'` would pass while never covering a single claimed bead.

- [ ] **Step 1: Write the failing tests**

```ts
const BEAD_WORKTREE = {
  linkedWorkItem: { provider: 'beads' as const, beadsIdentifier: 'cwf.3' },
  beadStatusCategory: 'wip' as const
}

describe('beadsDispositionNeeded', () => {
  // 'wip' is the case that matters: a claimed bead is in_progress.
  it('asks when a claimed bead is removed', () => {
    expect(beadsDispositionNeeded(BEAD_WORKTREE)).toBe(true)
  })

  it('asks for an open bead', () => {
    expect(beadsDispositionNeeded({ ...BEAD_WORKTREE, beadStatusCategory: 'active' })).toBe(true)
  })

  it('asks for a deferred bead', () => {
    expect(beadsDispositionNeeded({ ...BEAD_WORKTREE, beadStatusCategory: 'frozen' })).toBe(true)
  })

  it('stays quiet when the bead is already closed', () => {
    expect(beadsDispositionNeeded({ ...BEAD_WORKTREE, beadStatusCategory: 'done' })).toBe(false)
  })

  it('stays quiet for another provider', () => {
    expect(
      beadsDispositionNeeded({
        linkedWorkItem: { provider: 'jira', jiraIdentifier: 'ORC-1' },
        beadStatusCategory: null
      })
    ).toBe(false)
  })

  it('stays quiet with no linked item', () => {
    expect(beadsDispositionNeeded({ linkedWorkItem: null, beadStatusCategory: null })).toBe(false)
  })

  it('stays quiet when the status is unknown, rather than prompting about a bead it cannot describe', () => {
    expect(beadsDispositionNeeded({ ...BEAD_WORKTREE, beadStatusCategory: null })).toBe(false)
  })
})
```

For `runBeadsDisposition`: `'leave'` calls nothing and returns `null`; `'unclaim'` calls the store's `unclaimBeadsIssue`; `'close'` calls `closeBeadsIssue` with the reason and **refuses an empty reason** (`bd close` requires one and `requireText` validates it).

- [ ] **Step 2: Predict the failures** — module not found.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "feat(beads): decide what happens to a bead when its worktree goes"
```

---

### Task 10: The disposition hook and control

**Files:**
- Create: `src/renderer/src/components/sidebar/use-beads-disposition.ts`, `BeadsWorktreeDisposition.tsx`
- Test: `BeadsWorktreeDisposition.test.tsx`

**`DeleteWorktreeDialog.tsx` is 427 gross lines** — anything beyond a conditional mount breaches the 400-line net cap. The state, the status fetch and the post-delete execution live here; Task 11's edit to the dialog is roughly fifteen lines.

**Where the bead's status comes from:** the dialog already hydrates async state on open — `useDeleteWorktreeStatusHydration` (`DeleteWorktreeDialog.tsx:173-178`) does exactly this for git status. Follow it and call `loadBeadsDetails` (a read, allowed on open). While it is loading, show nothing rather than a half-populated prompt; `beadsDispositionNeeded` already returns `false` for an unknown status.

**The control:** three radios — **Close with reason** · **Unclaim (back to open)** · **Leave as is** — with **`Leave as is` selected by default**. Deleting a worktree must never close a bead by inertia. The reason field is enabled only for `Close`. Follow the dialog's existing control markup; layout-only classes on any `components/ui` primitive.

- [ ] **Step 1: Write the failing tests** — default selection is `leave`; choosing `close` enables the reason field and a submit with an empty reason is refused; the hook reports the chosen disposition to its caller. Include a test that the control renders **nothing** when `beadsDispositionNeeded` is false, so a non-beads delete is untouched.
- [ ] **Step 2: Predict the failures.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "feat(beads): offer close, unclaim or leave when removing a worktree"
```

---

### Task 11: Wire the disposition into the removal paths

**Files:**
- Modify: `src/renderer/src/components/sidebar/DeleteWorktreeDialog.tsx`, `delete-worktree-flow.ts`
- Test: extend the delete-flow tests

**The three paths in scope** (ruling 4): the normal dialog delete, `runDialogForceDelete` (`delete-worktree-flow.ts:275`), and `runLineageDeleteAll` (:317). Each ends in a `.then(deletedTargets)` — run the disposition from each, **only for targets actually deleted**.

**Skip-confirm must not skip an open bead.** `skipDeleteWorktreeConfirm` (:107-111) calls `runWorktreeDeleteWithToast` with no dialog at all. An open bead forces the dialog anyway, exactly as `hasLineageChildren` (:108) already does. Without this the setting silently disables the whole feature.

**Capture before closing.** The worktree record is gone after deletion, so read `linkedWorkItem`, `repoId` and the host **before** `closeModal()` and pass them to the disposition.

**Failure never blocks.** A failed close or unclaim warns; the worktree stays deleted. Deletion is the user's action and it has already succeeded.

- [ ] **Step 1: Write the failing tests** — the disposition runs after a successful delete for a beads worktree; it does **not** run for a delete that failed; it runs for force and lineage deletes too; an open bead forces the dialog under skip-confirm.
- [ ] **Step 2: Predict the failures.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "feat(beads): run the bead disposition after a worktree is removed"
```

---

### Task 12: End-to-end spec

**Files:**
- Create: `tests/e2e/beads-start-worktree.spec.ts`

`tests/e2e/` holds ~470 specs; `tasks-page.spec.ts` and the `linear-*` specs are the closest precedents. **Read one fully before writing** and follow its fixture setup and launch helper.

**What it must prove** (the bead's own acceptance criteria): the Beads tab lists issues from a fixture repo → selecting one opens the detail → Start worktree opens the composer pre-filled → creating produces a worktree whose `linkedWorkItem` has `provider: 'beads'` and the right `beadsIdentifier` → the draft prompt contains the §5.1 text and **not** `bd://`.

**Fixture:** the spec needs a real bd database. Report first what the harness provides — whether it already creates temp git repos it can `bd init` — and **skip the spec when `bd` is absent** rather than failing, since CI may not have it.

- [ ] **Step 1: Read the precedent and report what the harness provides** before writing test code.
- [ ] **Step 2: Write the spec.**
- [ ] **Step 3: Commit**

```bash
git status --short
git commit -m "test(beads): cover starting a worktree from a bead end to end"
```

---

### Task 13: Gates, spec, follow-ups, milestone close

Steps 1 and 2 (localization syncs, three typechecks, the changed-lines gate, the beads suite, a visual check) are **the controller's**. Do not run `pnpm`.

- [ ] **Step 1: Update the spec** — verify each claim against committed source first.
  - §5.1: record the link shape (synthetic `bd://` URL plus `beadsIdentifier`, identifier is the identity), that the prompt is delivered as a **draft**, and that the `issueCommand` override is **not** available to beads because `canUseIssueCommandForLinkedItemProvider` (`new-workspace.ts:42-46`) admits only GitHub and GitLab — that gate excludes Jira and Linear too, so it is a pre-existing limitation, not a beads regression.
  - §5.2: record the removal prompt as shipped for the three dialog paths, and mark the per-row agent-status badges deferred with the reason (no provider has one, so it is a new surface).
  - §5.3: `--beads-issue` shipped on `create` and `set`, with `title: id` and no lookup; the `orca-beads` skill guide remains M6.
  - §11: update the M3 row.

- [ ] **Step 2: File the follow-ups as beads** under `orca-q11`, each with the reason it was deferred:
  - Disposition for batch cleanup, CLI `worktree rm`, and archive (spec §5.2 says "removing **or** archiving").
  - Per-row agent-status badges.
  - `--beads-issue` does not resolve the title.

- [ ] **Step 3: Close the milestone**

```bash
bd close orca-q11.4 --reason="Start worktree from a bead: linked item, composer pre-fill, auto-claim, launch prompt, epic children, --beads-issue, removal disposition"
bd ready
```
Report what `bd ready` prints.

- [ ] **Step 4: Hand off.** Report commits, gate results, anything parked, and that nothing was pushed. **The upstream PR (spec §11's M3 row) is an outward-facing decision for the human — do not open it.**

---

## Self-review

**Spec coverage.** §5.1 items 1-5 → Tasks 1, 3, 4, 5, 6, 7, 8. §5.2 removal prompt → Tasks 9-11; badges → deferred with a bead. §5.3 CLI flag → Task 2; skill guide → M6. E2E → Task 12. Upstream PR → surfaced to the human, not planned as work.

**Placeholder scan.** Every task carries literal code or a named file to read first. Three tasks deliberately **stop and report** where the plan cannot know the answer: Task 2 (is a repo id reachable in the CLI create handler?), Task 12 (what does the e2e harness provide?), and Task 10's status source is answered by citing the existing hydration hook rather than hand-waving.

**Type consistency.** `buildBeadsLinkedItem` (Task 6) produces exactly what Task 1's `normalizeWorkspaceLinkedItem` accepts, what `toFolderWorkspaceLinkedTask` must carry through, and what Task 5's three builders read. `beadsIdentifier` is the identity in Tasks 8, 9 and 11. `beadsActor`/`beadsAutoClaim` (Task 3) are read in Tasks 4 and 8 only.

**Tests that could pass for the wrong reason — checked and fixed.** Task 1's "drops an item with no identifier" now requires a real guard and asserts `toBeNull()`. Task 3 asserts nothing is written on keystroke. Task 4 asserts a **non-null** actor so the test can tell "reads the setting" from "hard-codes null". Task 5 asserts a GitHub item still takes the bare-URL path. Task 6 asserts the identifier survives both normalization and the composer whitelist. Task 7 asserts the epic block reaches the request, not merely that a string builder works. Task 9's positive control is `'wip'`, the claimed case.

**Ordering.** Task 2 comes early to exercise normalization and the RPC round-trip without the renderer. Task 5 precedes Task 6 so no commit ships a Start-worktree button whose prompt is a dead URL. Tasks 9-11 split the only new UI surface into a pure decision, a control, and its wiring.
