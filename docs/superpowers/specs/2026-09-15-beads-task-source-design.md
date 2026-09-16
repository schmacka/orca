# Beads as a task source for Orca — design

- **Date:** 2026-09-15
- **Status:** Approved 2026-09-15
- **Owner:** schmacka
- **Reviewers:** Claude (Opus 5), with an independent design review by Claude Fable 5.1
- **Mockups:** `docs/superpowers/specs/mockups/list-layout.html`, `docs/superpowers/specs/mockups/detail-layout.html` (option B chosen in both)

## 1. Goal

Make beads (`bd`, a local issue tracker built on git and Dolt) a first-class task source in the Orca IDE. You should be able to browse, triage, edit and structure beads issues inside Orca, and start an agent worktree from any bead, without mirroring issues to GitHub, Linear or Jira.

**Scope:** core tracking, structure and dependencies, and the agent workflow.
**Deferred:** power features (molecules and formulas, state dimensions, memories/kv, federation), mobile, and splitting an epic across several agents.

## 2. Context and decisions

| Decision | Choice | Why |
|---|---|---|
| Deliverable | **Our fork first.** One complete PR offered upstream | About 12 task-provider PRs from outside contributors are open at stablyai/orca and none have been merged; every merged provider came from the core team. PR #14013 (beads) has no core-team response. |
| Starting point | **Reimplement on current `main`**, reusing the backend of #14013 (ajchemist) with co-author credit | `main` is about 2.2k commits past the PR's base. About 60% of the PR's changed lines are in files that were since deleted or shrunk by more than 90% (TaskPage split into `task-page/`, orca-runtime split into command classes, preload split). |
| Upstream PR shape | **One vertical slice (M1–M3)**, not a series of small PRs | The Plane author tried "contracts, then provider, then UI, then linking" and abandoned it: "changes no behaviour, so there is nothing for a maintainer to evaluate". |
| Provider abstraction | **Follow the Jira pattern**; no registry refactor | `TaskProvider` is still a closed union. A registry PR would compete with in-flight core work (#20685) and has no visible behaviour. |
| Data access | **Approach A:** every read and write is a `bd … --json` call on the host that owns the repo | bd owns its storage (embedded or server Dolt, redirects, worktrees). Reading `.beads/issues.jsonl` risks stale data, since it's only an export. Reading the Dolt schema directly would couple us to internals. A managed SQL server brings lifecycle and coupling problems. |
| Change detection | **Poll `bd vc status --json` for the commit hash** | Watching `.beads/` with a file watcher triggers on Orca's own reads: `bd list` rewrites `noms/manifest`, `journal.idx` and `repo_state.json`. The hash costs about 0.02 s and works the same locally, over SSH and on remote runtimes. It sometimes signals a change when nothing visible changed, but never misses one. |
| List UI | **Tree** (epics with their children) by default; flat list and board as toggles | Chosen from the mockups. |
| Detail UI | **Persistent split pane** (list on the left, detail on the right); becomes a drawer on narrow windows | Chosen from the mockups. |
| Orca CLI | `--beads-issue` on `orca worktree create/set` only; **no `orca beads` command group** | Agents already run in the repo with `bd` available, so a wrapper would only duplicate it. |
| Prompt content | **Only the issue ID and title**, plus a pointer to `bd show` / `bd prime` | Issue notes are often written by agents and are the most likely place for a prompt injection. |
| Minimum bd version | **1.2.0** | We rely on `ready -n/-a`, `vc status --json` and `context --json`. |

**Measured with bd 1.2.2 on baumoscan (24 issues, embedded Dolt):**
- `list` 0.02–0.12 s; `ready`, `show`, `status`, `statuses`, `types`, `count` and `vc status` about 0.02 s each.
- Six parallel `bd list` calls took 3.6 s in total. All succeeded: they wait on the embedded lock rather than fail.
- Performance at 1–5k issues is **not measured yet**; see §9.

## 3. Architecture

```
Renderer
  task-page/beads/*            tree | flat | board list, split detail, dialogs
                                (M2: Content.tsx is a self-contained tab body — the
                                Beads tab doesn't add stages to the task-page hook chain)
  store/slices/beads.ts, beads-slice-contract.ts, beads-load-state.ts
                                per-database state, list and detail caches, optimistic writes
  runtime/runtime-beads-client.ts   routes to IPC (local or SSH repo) or RPC (remote Orca runtime)
        │
Main process: src/main/beads/
  runtime-beads-commands.ts    command surface (same shape as runtime-jira-commands.ts)
  command-table.ts             allowlisted operations → argv builders
  executor.ts                  local: resolveCommand('bd') (+WSL); SSH: agent.execNonInteractive
  db-queue.ts                  one serial queue per beads_dir; reads coalesced, writes ordered
  context.ts                   `bd context --json` per repo → beads_dir, project_id, is_worktree
  schema.ts                    `bd statuses/types --json` per database → status categories, types
  read service getChangeToken  `bd vc status --json` commit hash; renderer polls it (M2)
  errors.ts                    BeadsError classification
IPC: src/main/ipc/beads.ts · RPC: src/main/runtime/rpc/methods/beads.ts + shared/rpc-contract/beads-params.ts
Preload: src/preload/api/beads-api.ts, beads-bridge.ts
Shared: shared/beads/{types,query,linked-item}.ts
```

**Changes to Orca's own files, kept minimal to limit rebase conflicts:**
- **Task source plumbing:** `task-providers.ts` (union and availability), `task-provider-identity.ts`, `task-source-context.ts` and its Zod mirror in `rpc-contract/automation-params.ts`.
- **Linking and new workspaces:** `workspace-linked-item*.ts`, `new-workspace/workspace-source.ts`, `linked-work-item-context.ts` (the beads launch block).
- **Wiring:** `methods/index.ts`, `register-core-handlers.ts`, `preload/index.ts`, `web-preload-api.ts`, `protocol-version.ts` (capability `beads-task-source.v1`).
- **Task page:** `task-page/{Content,ProviderFilters,SourceBar}.tsx`, source option and availability hooks.
- **Settings:** settings cards and readiness, `prepare-loaded-profile-settings.ts` (visibility default).
- **Sidebar:** card badge and nav, `worktree-meta-updates.ts`.
- **Other:** CLI worktree specs and handlers, and i18n keys in all 6 locales.

### 3.1 Executing `bd`
- **Where bd runs:** on the host that owns the repo.
  - **Local:** `resolveCommand('bd')`, including WSL routing on Windows.
  - **SSH:** `getSshGitProvider(connectionId).execNonInteractive('bd', argv, repoPath)`, the existing relay path (`src/relay/agent-exec-handler.ts`).
  - **Remote Orca runtime:** RPC to that runtime's main-process client.
- **How it runs:** argv only, never through a shell, with `--json` always set.
- **Actor:** `--actor <actor>` on writes. The actor comes from the setting `beads.actor`; when that's empty, bd's own default is used.
- **Timeouts:** 15 s for reads, 30 s for writes. On timeout, Orca kills the whole process tree.
- **Response parsing:** unwrap bd's JSON envelope. Exit code 0 with an `{"error":…}` body counts as a failure.

### 3.2 Command table (the complete allowlist)
Each entry has a typed input, an argv builder and an output parser. Nothing else can be run.

- **Read:**
  - `context`, `statuses`, `types`, `vcStatus`, `version`
  - `list` with filters: status, type, label, parent, priority, assignee, limit, all
  - `ready`, `blocked`, `search`, `count`
  - `show` with dependents and comments
- **Write:**
  - `create`, `update` (fields and text sections), `claim`
  - `close` (with reason), `reopen`, `defer`, `undefer`, `delete`
  - `comment`, `labelAdd`, `labelRemove`

Dependencies and the full graph: M5 plan. Gates and the merge-slot holder: M4 plan — `BeadsIssueDetails` from M1 carries `blockedBy` and dependency edges only, with no gate or merge-slot data in the contract, so exposing them needs new bd commands and contract fields first.

**Input rules:**
- IDs must match `^[A-Za-z0-9][A-Za-z0-9._-]*$` and are never matched by prefix.
- Every user-supplied value is passed as `--flag=value`.
- Types and statuses are checked against the per-database schema (§3.4). Dependency types are checked against bd 1.2.2's enum: blocks, tracks, related, parent-child, discovered-from, until, caused-by, validates, relates-to, supersedes.

### 3.3 Queue and caching
- **Queue:** one `BeadsDbQueue` per `beads_dir`. Orca-issued calls to a database run one at a time; identical in-flight reads are shared.
- **Cache keys:** `(beads_dir, operation, normalized input)`. Worktrees resolve to the main repo's `beads_dir` via `bd context`, so they share caches.
- **Change token:** The renderer polls `getChangeToken` every 5 s while a beads view is visible and every 60 s otherwise; main invalidates its schema cache when the token changes.
- **Writes:** update the UI immediately and roll back if bd fails. After a successful write the renderer polls the change token at once.

### 3.4 Schema
- `bd statuses --json` provides statuses with a category. The categories are `active` (open), `wip` (in_progress, blocked, hooked), `frozen` (deferred, pinned) and `done` (closed). `bd types --json` provides `core_types`, plus any custom types.
- Both are loaded once per database and reloaded when the hash changes after a config edit.
- **UI mapping is by category:** board columns, colours and preset membership.
- An unknown status maps to its category's default. It is never silently turned into `open`.

## 4. UI

### 4.1 Tasks page
- **Beads source tab:** shown for repos that have `.beads/`. When requirements aren't met, a setup card explains what's missing (§6).
- **Presets:**

  | Preset | bd call |
  |---|---|
  | Ready | `ready` |
  | In progress | `list --status in_progress` |
  | Blocked | `blocked` |
  | All open | `list` |
  | Closed | `list --status closed` |

  Each preset shows a count. **M2 renders the preset buttons without counts; counts land in M4** alongside the board's per-column counts, both from one count-only backend call.
- **Filters:** type, label, epic (`--parent`), priority, assignee (including "me") and text (`bd search`). All filtering happens in bd. Assignee **"me" arrives with the actor setting in M3** — M2's assignee filter takes free text only.

  M2 restricts which filters apply per view, per `SUPPORTED_FILTERS` in
  `src/renderer/src/components/task-page/beads/beads-list-request.ts`; the filters bar
  (`BeadsFiltersBar.tsx`) disables a control the current view can't apply:

  | View | Type | Labels | Parent (epic) | Priority | Assignee |
  |---|---|---|---|---|---|
  | List (`list`) | yes | yes | yes | yes | yes |
  | Ready (`ready`) | yes | yes | yes | yes | yes |
  | Blocked (`blocked`) | — | — | yes | — | — |
  | Search (`search`) | yes | yes | — | yes | yes |

- **List modes** (remembered per repo):
  - **Tree (default):** epics can be collapsed and show progress (closed children / total). An epic that doesn't match the preset still appears as a greyed context header when any of its children match.
  - **Flat:** chips show the parent and open blockers.
  - **Board: M4 (needs drag-to-change-status).** One column per status category, ordered by the schema. Dragging a card will run `update --status`, with an optimistic update.
- **Pagination:** 200 rows, then "Load more". Lists are never silently truncated.
- **Keyboard:**

  | Key | Action |
  |---|---|
  | ↑ / ↓ | Move selection |
  | ← / → | Collapse / expand |
  | Enter | Focus detail |
  | `s` | Start worktree |
  | `c` | Claim |
  | `n` | New issue |

### 4.2 Detail pane (split pane; drawer below a width breakpoint)
- **Header:** ID (click to copy), type, priority, status and labels. **M2 renders these read-only; inline editing is M3/M4.**
- **Actions (M3/M4):** ▶ Start worktree · Claim · Status · Priority · Close… (reason required) · ⋯ (defer/undefer, reopen, delete with confirmation, copy ID, open full graph). M2 has no actions row.
  - bd refuses to close an issue with open blockers (`cannot close …: blocked by open issues`). The M4 plan adds `force` to close so the UI can offer 'Close anyway' (`--force`).
- **Blocked callout:** M2 lists each open blocker (from the grouped relations below) with only an Open button.
  - "Start blocker" is M3 (needs Start worktree).
  - **Gates and the merge-slot holder are M4 — needs bd commands and contract fields M1 does not have.** Listing open gates (for example "Waiting on gate: human") with a Resolve button for `human` gates, and showing the merge-slot holder read-only, are not implemented in M2.
- **Mini dependency graph:** **M2 renders this as grouped relation lists, not a graph** — Parent, Blocked by, Blocks, Children, Related (`beads-detail-relations.ts`'s `groupBeadsRelations`), each row opening that issue on click. The visual node graph with one level each way is a later milestone.
- **Text sections:** description, design, acceptance criteria and notes. Rendered as markdown, collapsible. **M2 is read-only; editing and saving through `update` is M3/M4.**
- **Relations panel:** add or remove any dependency type (§3.2), with ID autocomplete, and "Mark as duplicate of…" via `bd duplicate`, are **M5** (§11) — M2 only displays the grouped relation lists above.
- **Comments:** **M2 shows the list only; the composer (adding a comment) is M4.**
- **Linked worktrees (M3):** each with its agent status badge. Not shown in M2.

### 4.3 Dialogs and views
- **New issue:** title, type, priority, parent, labels, description, and optional blocked-by. Saved with one `bd create` call (it accepts parent, labels and dependencies directly).
- **Full dependency graph:** from `bd graph --json`, opened in a modal.
- **Settings card:** M2 ships install/initialize guidance (`BeadsSetupSteps` in `TaskSourceSimpleSetup.tsx`) plus the show-in-Tasks toggle. Not in M2, and not planned before the milestone noted:
  - the actor setting — **M3**
  - auto-claim on start — **M3** (needs Start worktree, §5.1)
  - poll intervals — **fixed at 5 s visible / 60 s hidden in M2** (`VISIBLE_POLL_MS` / `HIDDEN_POLL_MS` in `use-beads-page-state.ts`), not user-configurable
  - bd version/status and per-repo beads availability are **not in the global settings card** at all; M2 surfaces them in the per-repo setup card on the Beads tab itself (`BeadsSetupCard.tsx`)

## 5. Agent workflow

> **M2 note:** IPC clients should always send `repoId`; without it the backend matches by path only.

### 5.1 Start worktree from a bead
1. **Composer:** opens the existing new-workspace composer, pre-filled with:
   - the name `<id>-<title-slug>`
   - your default agent and base branch
   - a `WorkspaceLinkedItem` (`buildBeadsLinkedItem`, `task-page/beads/beads-start-worktree.ts`): `{provider:'beads', type:'issue', number:0, title:'<id> <title>', url:'bd://<id>', beadsIdentifier:'<id>', repoId}`. **Link shape:** the `url` is a synthetic `bd://<id>` with **no repo segment**; `beadsIdentifier` is the identity a linked bead is matched on everywhere (disposition, auto-claim, CLI), and `repoId` is a separate first-class field on the record, not encoded in the URL.
2. **Create:** the worktree is created. Saving never waits on a bd lookup (fixes #14013's review finding 1).
3. **Claim:** only if creation succeeded and auto-claim is on (`beadsAutoClaim`, default true — §4.3 settings), `claim` runs with the configured actor (`beadsActor`). The Orca board status becomes in-progress. A failed claim shows a non-blocking warning, and the worktree stays — a failed claim never undoes a successful create (`beads-worktree-auto-claim.ts`).
4. **Prompt:** the launch block from `linked-work-item-context.ts` / `beads-launch-context.ts`:
   ```
   Linked Beads issue: <id> — <title>
   Read it with `bd show <id>` (run `bd prime` for workflow context).
   ```
   It is delivered to the agent as a **draft** (bracketed-paste into the terminal's input buffer, not auto-submitted) via the same generic provider-draft path Linear uses (`getLaunchableWorkItemDraftContent` / `resolveQuickCreateLinkedWorkItemPrompt`, `linked-work-item-context.ts`).
   The `issueCommand` override (`orca.yaml` / `.orca/issue-command`, placeholder `{{issue}}`) is **not available for beads**: `canUseIssueCommandForLinkedItemProvider` (`new-workspace.ts:43-47`) admits only `'github'` and `'gitlab'`. That gate excludes Jira and Linear the same way, so this is a pre-existing limitation of the gate, not a beads-specific regression.
5. **Starting on an epic:** creates one worktree whose prompt lists the epic's ready child IDs and titles, fetched after the composer is already open (`useBeadsEpicContextAugmentation` → `fetchBeadsEpicLinkedContext`, `beads-epic-launch-context.ts`) so opening the composer never waits on bd; a failed or empty fetch leaves the plain single-issue prompt in place.

### 5.2 Lifecycle
- **Status badges:** the tree, list and detail views show linked worktrees and the agent state (running, waiting, done). **Deferred** (orca-q11.12): no existing task-source row (Linear, Jira, GitHub) renders a per-row agent-status badge today, so this is a new UI surface for Orca generally, not beads-specific parity work.
- **Removing a worktree whose bead is still open** opens a prompt (`BeadsWorktreeDisposition.tsx` / `use-beads-disposition.ts`): **Close with reason** · **Unclaim (back to open)** · **Leave as is** (default). It is wired into the three interactive delete-dialog paths — normal delete, force delete, and lineage delete-all (`DeleteWorktreeDialog.tsx`, `delete-worktree-dialog-force-delete.ts`, `delete-worktree-lineage-delete-all.ts`) — and `skipDeleteWorktreeConfirm` is overridden (the dialog always opens) whenever the worktree has a linked bead (`hasLinkedBeadsWorkItem`, `delete-worktree-flow.ts`).
  - **Not covered by those three paths:** sidebar batch cleanup, the CLI `orca worktree rm`, and archiving — tracked as orca-q11.11. Two gaps found in review of the three shipped paths are tracked separately: the force-delete **toast** retry path can leave a bead open (orca-7aj), and forgetting a disconnected SSH workspace skips disposition entirely (orca-hfw).
- Orca never closes a bead without asking.

### 5.3 CLI and skill
- **`orca worktree create/set --beads-issue <id|null>`** shipped on both subcommands (`getOptionalBeadsIssueLinkFlag`, `worktree-beads-issue-link.ts`; wired in `worktree.ts`). It mirrors `--linear-issue`'s flag shape, and `null` clears the link on `set`. It builds the same link shape as §5.1 (`bd://<id>`, `beadsIdentifier`) but sets `title: id` **with no `bd` lookup** — the CLI never fetches the bead's title, so the id stands in for it. **Deferred** (orca-q11.13): resolving the real title would need a synchronous `bd show` round trip inside the CLI create/set handler, adding latency and a new failure mode to a command path that otherwise never touches bd.
- **Bundled `orca-beads` skill guide** (`skill-guides/orca-beads.md` plus a stub) covers:
  - linking a worktree
  - spinning off discovered work (`bd create --deps discovered-from:<id>` + `orca worktree create --beads-issue`)
  - handing work off to another agent
  - claim and close etiquette

### 5.4 Automations
- **"Work beads ready queue" template:** cron schedule, a new worktree each run, optional epic/label/priority filter.
- **Precheck:** a built-in `ready` query with those filters, using the automation's `TaskSourceContext {provider:'beads'}`. If nothing is ready, the run is skipped.
- **Each run:** takes the top ready issue, claims it with the automation's actor, and launches the §5.1 prompt.

## 6. Error handling

| `BeadsError.kind` | Detection | UI |
|---|---|---|
| `bd-missing` | ENOENT when resolving or running bd, once the repo path is confirmed to exist (Node reports the same spawn ENOENT for a missing cwd; local: `access` check; WSL: in-distro probe). A missing repo path is reported as `failed` "Repository path not found" | Setup card with install instructions; re-checked when the window regains focus |
| `bd-outdated` | `version` below 1.2.0 | "Upgrade bd" message showing the version found |
| `not-initialized` | bd's specific "not initialized" output only, or `no .beads directory found` (the `bd context` wording) | "Initialize beads" hint with `bd init` (Orca never runs it) |
| `ambiguous-id` / `not-found` | `ambiguous ID` on stderr (bd prints the not-found JSON for both); `not-found` from bd's "no issues found" error | Inline message; no guessing |
| `busy` | Timeout while the database lock is held | "Beads busy, another process is writing" plus Retry |
| `host-offline` | Existing SSH or runtime state | Cached data shown read-only |
| `invalid-input` | argv validation or unregistered repo | Inline message |
| `failed` | Anything else | bd's stderr (trimmed) plus Retry. Never reported as `not-initialized` (fixes #14013's review finding 3) |

- **Provider-keyed failure state:** a failed issue lookup is remembered together with its provider, so switching provider clears it (fixes #14013's review finding 2).

## 7. Security
- **Allowlist:** the command table is the only way to run bd. There's no generic execution over IPC, RPC or SSH.
- **Arguments:** argv only, validated IDs, and `--flag=value` for all user text, so a leading `-` can never become an option.
- **Prompt injection:** prompts carry only the ID and title. The body reaches the agent as `bd` tool output.
- **Credentials and access:** no stored credentials and no new relay capabilities.

## 8. Testing
- **Unit tests (Vitest):**
  - argv builders, including hostile input: a leading `-`, shell metacharacters, newlines
  - parsers, against JSON fixtures captured from real bd 1.2.2 by `scripts/capture-beads-fixtures.mjs` (runs `bd init` in a temporary directory, creates sample data, dumps every read operation)
  - error classification
  - queue ordering and coalescing, and change-watcher intervals (fake timers)
  - schema mapping by category
  - store slices, and tree and board mapping
  - linked-item normalization
- **Integration:** real `bd` in a temporary repo for create, claim, add dependency, close, and comment. Skipped when bd isn't on PATH.
- **End-to-end (Playwright):** Beads tab on a fixture repo, then tree, split detail, then Start worktree, checking the linked item and prompt.
- **Manual:** baumoscan with 3 parallel agent worktrees writing beads; an SSH repo; a Windows/WSL smoke test before the upstream PR.
- **Build gates:** `pnpm tc`, `pnpm lint` (including the localization and bundled-skill checks) and `pnpm test` stay green.

## 9. Risks and open points
- **Performance at scale** (1–5k issues; beads #6065/#5397 report multi-second embedded-mode latency): measure during M1 on a generated 3k-issue database. If list calls take more than 1 s, add narrower list fields or longer poll intervals before M2. Measured numbers: [`2026-09-15-beads-performance.md`](2026-09-15-beads-performance.md).
- **Frequent change signals:** the commit hash also changes on bd housekeeping commits. This is acceptable because reloads are coalesced and cheap.
- **bd JSON changing between versions:** parsers tolerate unknown fields and keep fixtures per bd version. The `bd-outdated` gate is raised only deliberately.
- **Rebase burden:** keep beads code in its own files, rebase weekly, and run fork CI on every rebase.
- **Upstream acceptance** is not expected. The fork stays usable on its own.

## 10. Fork and packaging
- **Repo:** `schmacka/orca`. Branch `beads` is rebased weekly onto upstream `main`.
- **Fork-only packaging commit (never proposed upstream):**
  - `appId: dev.porcus3d.orca-beads` and `productName: "Orca Beads"`, which gives separate userData
  - updater feed pointed at `schmacka/orca` releases, or disabled
  - `ORCA_SKILLS_REPOSITORY_URL` pointed at the fork
  - ad-hoc signed macOS build
- **Credit:** ajchemist's reused modules keep a `Co-authored-by` trailer. The upstream PR description links #14013 and #7268.

## 11. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Fork setup | Fork builds in dev; packaging commit produces "Orca Beads" next to official Orca; fork CI green |
| M1 | Backend | §3 modules with unit and integration tests; local, SSH and runtime paths work; 3k-issue performance measured |
| M2 | Read UI | Source tab, presets, filters, tree and flat list, split detail, mini graph, settings card |
| M3 | Start worktree | §5.1, §5.2 and `--beads-issue` shipped and gate-clean; end-to-end test green (`tests/e2e/beads-start-worktree.spec.ts`). Deferred and filed as beads: batch/CLI-rm/archive disposition (orca-q11.11), per-row agent-status badges (orca-q11.12), `--beads-issue` title resolution (orca-q11.13); known gaps orca-7aj, orca-hfw, orca-7h0, orca-ztv, orca-3sg, orca-ar9, orca-h17. **Upstream PR opened (M1–M3)** is still outstanding — an outward-facing decision left to a human, not planned as bead work |
| M4 | Editing | Create dialog, inline fields, text sections, comments, close/defer/reopen/delete, board drag, preset/board counts, gates and merge-slot |
| M5 | Structure | Add/remove dependencies, full graph |
| M6 | Automations | Ready-queue template, `orca-beads` skill |
| M7 | Later | Epic across agents (orchestration), power features, mobile |
