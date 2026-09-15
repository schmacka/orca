# Beads M1 — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tested main-process beads backend: every allowlisted `bd --json` operation callable from the renderer over IPC (local, WSL and SSH repos) and from remote Orca runtimes over RPC, with typed results and classified errors. No UI.

**Architecture:** Pure argv builders produce the only commands that can run. An executor runs `bd` on the repo's host (local `commandExecFileAsync`, SSH `execNonInteractive`). A per-database queue serializes calls and shares identical in-flight reads. Read and write services combine version gate, `bd context` resolution, parsing and normalization; IPC handlers and a runtime command class wrap them in `BeadsResult<T>`.

**Tech Stack:** TypeScript, Electron IPC, zod RPC params, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-beads-task-source-design.md` (§3, §6, §7, §8, §11 M1)

**Beads issue:** `orca-q11.2` — claim before starting, close at the end of Task 16.

## Global Constraints

- Minimum bd version **1.2.0**; fixtures and integration tests target bd **1.2.2**.
- Timeouts: reads **15 s**, writes **30 s**.
- List page size **200**; maximum list limit **2000** (Load more re-requests with a larger limit; bd has no offset).
- Issue IDs must match `^[A-Za-z0-9][A-Za-z0-9._-]*$` (max 128 chars) and are never prefix-matched.
- User text is passed as `--flag=value`. The only positional free text is the comment body, placed after `--`, with `--json` and `--actor` before `--`.
- No generic "run bd" path anywhere (IPC, RPC, SSH).
- Never import `node:child_process` in non-test files (ratchet test `child-process-import-boundary.test.ts`). Use `commandExecFileAsync` from `src/main/git/runner`.
- Lint rules that bite new files: `.ts` max 300 lines (tests 800), no `helpers/utils/common/misc` names, `type` not `interface`, `import type` for types, braces on every `if`, exhaustive `switch` without `default`, no `// @ts-nocheck`. Any `as` assertion needs `// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: <reason>`.
- Mobile RPC allowlist is **not** extended (Jira precedent).
- Files ported from PR #14013 get this commit trailer in addition to Claude's: `Co-authored-by: ajchemist <1694505+aJchemist@users.noreply.github.com>`.
- Every commit ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## Deviations from the spec (found while planning, against real bd 1.2.2)

1. **Create is one `bd create` call, not `bd batch`.** `bd batch update` only accepts `status, priority, title, assignee`; `bd create` accepts every field plus `--parent`, `--labels`, `--deps` directly.
2. **Change detection token is served, not pushed.** Main exposes `getChangeToken` (`bd vc status --json` → `commit`); the renderer polls it (M2). Main uses the same token to invalidate its schema cache. This works identically over IPC and runtime RPC, which has no server push for beads.
3. **Dependencies, graph and gates move to the M5 plan.** Their JSON needs fixtures from real gates/graphs; M1 covers everything M2–M4 need.
4. **Ambiguous IDs are detected from stderr.** bd prints the same `{"error":"no issues found…"}` JSON for ambiguous and unknown IDs.
5. **"Not initialized" also matches `no .beads directory found`** (the `bd context` wording).
6. Update these points into the spec in Task 16.

## File structure

```
src/shared/beads/
  beads-issue-types.ts        domain types (issue, relation, comment, details, schema, workspace status)
  beads-contract.ts           request/response/result types shared by IPC, preload, RPC
  beads-json-value.ts         tiny readers for untyped JSON (record check, string, number, string list)
  beads-issue-id.ts           issue id validation
  beads-schema.ts             bd statuses/types normalization + fallback schema + status category
  beads-issue-normalize.ts    bd issue/relation/comment/details normalization
src/main/beads/
  beads-error.ts              BeadsError, failure classification, result capture
  bd-json.ts                  envelope unwrap + JSON parsing of bd stdout
  beads-executor.ts           runBd on local/WSL/SSH host
  beads-db-queue.ts           per-database serial queue with shared reads
  beads-version.ts            bd version gate (cached per host)
  beads-context.ts            bd context resolution (cached per host+repo)
  beads-arg-validation.ts     input validators used by argv builders
  beads-read-args.ts          argv builders for reads
  beads-write-args.ts         argv builders for writes
  beads-invocation.ts         version gate + context + queue + classification around runBd
  beads-read-service.ts       status, schema, change token, list, count, details
  beads-write-service.ts      create, update, claim, close, reopen, defer, undefer, delete, comment
  beads-repo-target.ts        registered-repo check + execution target
  __fixtures__/bd-1.2.2/*.json  recorded bd output (Task 13)
  beads-fake-bd.test-support.ts shared fake bd for service tests (Task 8)
src/main/ipc/beads.ts                                   IPC handlers
src/preload/api/beads-api.ts, beads-bridge.ts           preload types + bridge
src/main/runtime/runtime-beads-commands.ts              runtime command class
src/main/runtime/runtime-beads-command-surface.ts       installs beads* methods on the runtime
src/shared/rpc-contract/beads-params.ts                 zod params
src/main/runtime/rpc/methods/beads.ts                   RPC methods
config/scripts/capture-beads-fixtures.mjs               fixture recorder
config/scripts/measure-beads-performance.mjs            3k-issue timing script
```

---

### Task 1: Shared domain and contract types

**Files:**
- Create: `src/shared/beads/beads-issue-types.ts`
- Create: `src/shared/beads/beads-contract.ts`
- Create: `src/shared/beads/beads-json-value.ts`
- Create: `src/shared/beads/beads-issue-id.ts`
- Test: `src/shared/beads/beads-issue-id.test.ts`, `src/shared/beads/beads-json-value.test.ts`

**Interfaces:**
- Produces (used by every later task): all types below, `isJsonRecord`, `readOptionalString`, `readFiniteNumber`, `readStringList`, `isBeadsIssueId`, `BEADS_LIST_PAGE_SIZE`, `BEADS_LIST_MAX_LIMIT`.

- [ ] **Step 1: Write the failing tests**

`src/shared/beads/beads-issue-id.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isBeadsIssueId } from './beads-issue-id'

describe('isBeadsIssueId', () => {
  it('accepts hash ids and dotted child ids', () => {
    expect(isBeadsIssueId('baumoscan-cwf')).toBe(true)
    expect(isBeadsIssueId('baumoscan-cwf.3')).toBe(true)
    expect(isBeadsIssueId('probe_1')).toBe(true)
  })

  it('rejects values bd could parse as flags or that contain separators', () => {
    expect(isBeadsIssueId('-x')).toBe(false)
    expect(isBeadsIssueId('--json')).toBe(false)
    expect(isBeadsIssueId('a b')).toBe(false)
    expect(isBeadsIssueId('a,b')).toBe(false)
    expect(isBeadsIssueId('')).toBe(false)
    expect(isBeadsIssueId(`a${'b'.repeat(128)}`)).toBe(false)
  })
})
```

`src/shared/beads/beads-json-value.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isJsonRecord, readFiniteNumber, readOptionalString, readStringList } from './beads-json-value'

describe('beads JSON value readers', () => {
  it('recognizes plain objects only', () => {
    expect(isJsonRecord({ a: 1 })).toBe(true)
    expect(isJsonRecord([])).toBe(false)
    expect(isJsonRecord(null)).toBe(false)
  })

  it('reads non-empty strings, finite numbers and string lists', () => {
    expect(readOptionalString('x')).toBe('x')
    expect(readOptionalString('')).toBeUndefined()
    expect(readOptionalString(3)).toBeUndefined()
    expect(readFiniteNumber(2)).toBe(2)
    expect(readFiniteNumber(Number.NaN)).toBeUndefined()
    expect(readStringList(['a', 1, 'b'])).toEqual(['a', 'b'])
    expect(readStringList('a')).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/shared/beads`
Expected: FAIL — cannot resolve `./beads-issue-id` / `./beads-json-value`.

- [ ] **Step 3: Implement the files**

`src/shared/beads/beads-json-value.ts`:
```ts
export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((entry): entry is string => typeof entry === 'string')
}
```

`src/shared/beads/beads-issue-id.ts`:
```ts
const BEADS_ISSUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const BEADS_ISSUE_ID_MAX_LENGTH = 128

// Why: ids are placed in argv; a leading '-' or a separator would let a value
// become a bd flag or a second argument.
export function isBeadsIssueId(value: string): boolean {
  return value.length <= BEADS_ISSUE_ID_MAX_LENGTH && BEADS_ISSUE_ID_PATTERN.test(value)
}
```

`src/shared/beads/beads-issue-types.ts`:
```ts
export type BeadsStatusCategory = 'active' | 'wip' | 'frozen' | 'done'

export type BeadsStatusDefinition = {
  name: string
  category: BeadsStatusCategory
  description: string
  icon: string
}

export type BeadsTypeDefinition = {
  name: string
  description: string
}

export type BeadsSchema = {
  statuses: BeadsStatusDefinition[]
  types: BeadsTypeDefinition[]
}

export type BeadsDependencyEdge = {
  dependsOnId: string
  dependencyType: string
}

export type BeadsIssue = {
  id: string
  title: string
  description?: string
  design?: string
  acceptanceCriteria?: string
  notes?: string
  status: string
  priority: number
  issueType: string
  assignee?: string
  owner?: string
  createdBy?: string
  labels: string[]
  parent?: string
  createdAt: string
  updatedAt: string
  closedAt?: string
  closeReason?: string
  deferUntil?: string
  dependencyCount: number
  dependentCount: number
  commentCount: number
  blockedBy: string[]
  dependencyEdges: BeadsDependencyEdge[]
}

export type BeadsIssueRelation = {
  id: string
  title: string
  status: string
  priority: number
  issueType: string
  dependencyType: string
}

export type BeadsIssueComment = {
  id: string
  author: string
  text: string
  createdAt: string
}

export type BeadsIssueDetails = {
  issue: BeadsIssue
  dependencies: BeadsIssueRelation[]
  dependents: BeadsIssueRelation[]
  comments: BeadsIssueComment[]
}

export type BeadsWorkspaceStatus = {
  bdInstalled: boolean
  bdVersion: string | null
  versionSupported: boolean
  initialized: boolean
  beadsDir: string | null
  isWorktree: boolean
}
```

`src/shared/beads/beads-contract.ts`:
```ts
import type { BeadsIssue } from './beads-issue-types'

export const BEADS_LIST_PAGE_SIZE = 200
export const BEADS_LIST_MAX_LIMIT = 2000

export type BeadsErrorKind =
  | 'bd-missing'
  | 'bd-outdated'
  | 'not-initialized'
  | 'ambiguous-id'
  | 'not-found'
  | 'busy'
  | 'host-offline'
  | 'invalid-input'
  | 'failed'

export type BeadsFailure = {
  kind: BeadsErrorKind
  message: string
}

export type BeadsResult<T> = { ok: true; value: T } | { ok: false; error: BeadsFailure }

export type BeadsListView = 'list' | 'ready' | 'blocked' | 'search'

export type BeadsListFilter = {
  statuses?: string[]
  type?: string
  labels?: string[]
  parent?: string
  priority?: number
  assignee?: string
  unassigned?: boolean
  includeClosed?: boolean
}

export type BeadsListRequest = {
  view: BeadsListView
  filter: BeadsListFilter
  text?: string
  limit: number
}

export type BeadsIssuePage = {
  issues: BeadsIssue[]
  hasMore: boolean
}

export type BeadsCreateInput = {
  title: string
  issueType?: string
  priority?: number
  description?: string
  design?: string
  acceptanceCriteria?: string
  notes?: string
  labels?: string[]
  parent?: string
  assignee?: string
}

export type BeadsIssuePatch = {
  title?: string
  description?: string
  design?: string
  acceptanceCriteria?: string
  notes?: string
  status?: string
  priority?: number
  issueType?: string
  assignee?: string
  parent?: string
  addLabels?: string[]
  removeLabels?: string[]
}

export type BeadsDeleteOutcome = {
  deleted: string
}

export type BeadsRepoArgs = { repoPath: string; repoId?: string | null }
export type BeadsReadIssueArgs = BeadsRepoArgs & { id: string }
export type BeadsListArgs = BeadsRepoArgs & { request: BeadsListRequest }
export type BeadsCountArgs = BeadsRepoArgs & { filter: BeadsListFilter }
export type BeadsIssueActorArgs = BeadsRepoArgs & { id: string; actor: string | null }
export type BeadsCreateArgs = BeadsRepoArgs & { input: BeadsCreateInput; actor: string | null }
export type BeadsUpdateArgs = BeadsIssueActorArgs & { patch: BeadsIssuePatch }
export type BeadsCloseArgs = BeadsIssueActorArgs & { reason: string }
export type BeadsReopenArgs = BeadsIssueActorArgs & { reason: string | null }
export type BeadsDeferArgs = BeadsIssueActorArgs & { until: string | null }
export type BeadsCommentArgs = BeadsIssueActorArgs & { text: string }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test src/shared/beads`
Expected: PASS (2 files).

- [ ] **Step 5: Commit**

```bash
git add src/shared/beads
git commit -m "feat(beads): add shared beads domain and contract types

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Schema normalization (statuses, types, categories)

**Files:**
- Create: `src/shared/beads/beads-schema.ts`
- Test: `src/shared/beads/beads-schema.test.ts`

**Interfaces:**
- Consumes: `BeadsSchema`, `BeadsStatusCategory`, `BeadsStatusDefinition`, `BeadsTypeDefinition` (Task 1); `isJsonRecord`, `readOptionalString` (Task 1).
- Produces: `FALLBACK_BEADS_SCHEMA: BeadsSchema`, `normalizeBeadsStatuses(raw: unknown): BeadsStatusDefinition[]`, `normalizeBeadsTypes(raw: unknown): BeadsTypeDefinition[]`, `beadsStatusCategory(schema: BeadsSchema, status: string): BeadsStatusCategory`.

- [ ] **Step 1: Write the failing test**

`src/shared/beads/beads-schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  FALLBACK_BEADS_SCHEMA,
  beadsStatusCategory,
  normalizeBeadsStatuses,
  normalizeBeadsTypes
} from './beads-schema'

describe('normalizeBeadsStatuses', () => {
  it('reads built-in and custom status arrays from bd statuses --json', () => {
    const raw = {
      schema_version: 1,
      built_in_statuses: [
        { name: 'open', category: 'active', description: 'Available to work (default)', icon: '○' },
        { name: 'hooked', category: 'wip', description: 'Hooked', icon: '⚓' }
      ],
      custom_statuses: [{ name: 'review', category: 'wip' }]
    }
    expect(normalizeBeadsStatuses(raw)).toEqual([
      { name: 'open', category: 'active', description: 'Available to work (default)', icon: '○' },
      { name: 'hooked', category: 'wip', description: 'Hooked', icon: '⚓' },
      { name: 'review', category: 'wip', description: '', icon: '' }
    ])
  })

  it('drops unnamed entries, unknown categories and duplicates', () => {
    const raw = {
      built_in_statuses: [
        { category: 'wip' },
        { name: 'x', category: 'weird' },
        { name: 'open', category: 'active' },
        { name: 'open', category: 'done' }
      ]
    }
    expect(normalizeBeadsStatuses(raw)).toEqual([
      { name: 'open', category: 'active', description: '', icon: '' }
    ])
  })

  it('returns an empty list for non-object payloads', () => {
    expect(normalizeBeadsStatuses(null)).toEqual([])
    expect(normalizeBeadsStatuses([])).toEqual([])
  })
})

describe('normalizeBeadsTypes', () => {
  it('reads object and string entries from core and custom type arrays', () => {
    const raw = {
      core_types: [{ name: 'task', description: 'General work item (default)' }, 'bug'],
      custom_types: [{ name: 'adr' }]
    }
    expect(normalizeBeadsTypes(raw)).toEqual([
      { name: 'task', description: 'General work item (default)' },
      { name: 'bug', description: '' },
      { name: 'adr', description: '' }
    ])
  })
})

describe('beadsStatusCategory', () => {
  it('maps known statuses and keeps unknown ones visible as active', () => {
    expect(beadsStatusCategory(FALLBACK_BEADS_SCHEMA, 'closed')).toBe('done')
    expect(beadsStatusCategory(FALLBACK_BEADS_SCHEMA, 'deferred')).toBe('frozen')
    expect(beadsStatusCategory(FALLBACK_BEADS_SCHEMA, 'something-new')).toBe('active')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/shared/beads/beads-schema.test.ts`
Expected: FAIL — cannot resolve `./beads-schema`.

- [ ] **Step 3: Implement**

`src/shared/beads/beads-schema.ts`:
```ts
import type {
  BeadsSchema,
  BeadsStatusCategory,
  BeadsStatusDefinition,
  BeadsTypeDefinition
} from './beads-issue-types'
import { isJsonRecord, readOptionalString } from './beads-json-value'

const STATUS_CATEGORIES: readonly BeadsStatusCategory[] = ['active', 'wip', 'frozen', 'done']

const FALLBACK_TYPE_NAMES = [
  'task',
  'bug',
  'feature',
  'chore',
  'epic',
  'decision',
  'spike',
  'story',
  'milestone'
]

// Why: bd 1.2.2 built-ins. Used only when `bd statuses`/`bd types` return nothing
// usable, so the UI still groups the stored statuses instead of showing no columns.
export const FALLBACK_BEADS_SCHEMA: BeadsSchema = {
  statuses: [
    { name: 'open', category: 'active', description: 'Available to work (default)', icon: '○' },
    { name: 'in_progress', category: 'wip', description: 'Actively being worked on', icon: '◐' },
    { name: 'blocked', category: 'wip', description: 'Blocked by a dependency', icon: '●' },
    {
      name: 'deferred',
      category: 'frozen',
      description: 'Deliberately put on ice for later',
      icon: '❄'
    },
    { name: 'closed', category: 'done', description: 'Completed', icon: '✓' }
  ],
  types: FALLBACK_TYPE_NAMES.map((name) => ({ name, description: '' }))
}

function toStatusCategory(value: unknown): BeadsStatusCategory | null {
  return STATUS_CATEGORIES.find((category) => category === value) ?? null
}

// Why: bd names its arrays built_in_statuses / core_types today and documents
// custom ones; reading every array with the suffix keeps custom entries without
// hardcoding key names that may change between bd versions.
function collectEntries(raw: unknown, keySuffix: string): unknown[] {
  if (!isJsonRecord(raw)) {
    return []
  }
  const entries: unknown[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (key.endsWith(keySuffix) && Array.isArray(value)) {
      entries.push(...value)
    }
  }
  return entries
}

export function normalizeBeadsStatuses(raw: unknown): BeadsStatusDefinition[] {
  const seen = new Set<string>()
  const statuses: BeadsStatusDefinition[] = []
  for (const entry of collectEntries(raw, '_statuses')) {
    if (!isJsonRecord(entry)) {
      continue
    }
    const name = readOptionalString(entry.name)
    const category = toStatusCategory(entry.category)
    if (!name || !category || seen.has(name)) {
      continue
    }
    seen.add(name)
    statuses.push({
      name,
      category,
      description: readOptionalString(entry.description) ?? '',
      icon: readOptionalString(entry.icon) ?? ''
    })
  }
  return statuses
}

function readTypeName(entry: unknown): string | undefined {
  if (typeof entry === 'string') {
    return readOptionalString(entry)
  }
  return isJsonRecord(entry) ? readOptionalString(entry.name) : undefined
}

export function normalizeBeadsTypes(raw: unknown): BeadsTypeDefinition[] {
  const seen = new Set<string>()
  const types: BeadsTypeDefinition[] = []
  for (const entry of collectEntries(raw, '_types')) {
    const name = readTypeName(entry)
    if (!name || seen.has(name)) {
      continue
    }
    seen.add(name)
    const description = isJsonRecord(entry) ? readOptionalString(entry.description) : undefined
    types.push({ name, description: description ?? '' })
  }
  return types
}

export function beadsStatusCategory(schema: BeadsSchema, status: string): BeadsStatusCategory {
  // Why: an unknown status is still real work; 'active' keeps it visible in open
  // presets instead of hiding it, and the raw status name is never rewritten.
  return schema.statuses.find((definition) => definition.name === status)?.category ?? 'active'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/shared/beads/beads-schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/beads/beads-schema.ts src/shared/beads/beads-schema.test.ts
git commit -m "feat(beads): normalize bd statuses and types into a schema

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Issue, relation, comment and details normalization

**Files:**
- Create: `src/shared/beads/beads-issue-normalize.ts`
- Test: `src/shared/beads/beads-issue-normalize.test.ts`

**Interfaces:**
- Consumes: types and JSON readers from Task 1.
- Produces: `normalizeBeadsIssue(raw: unknown): BeadsIssue | null`, `normalizeBeadsRelation(raw: unknown): BeadsIssueRelation | null`, `normalizeBeadsComment(raw: unknown): BeadsIssueComment | null`, `normalizeBeadsIssueDetails(raw: unknown): BeadsIssueDetails | null`.

- [ ] **Step 1: Write the failing test**

The samples below are verbatim bd 1.2.2 output (trimmed to the fields that matter).

`src/shared/beads/beads-issue-normalize.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  normalizeBeadsComment,
  normalizeBeadsIssue,
  normalizeBeadsIssueDetails,
  normalizeBeadsRelation
} from './beads-issue-normalize'

// `bd list --json`: dependencies are raw edge records.
const LIST_ROW = {
  id: 'baumoscan-cwf.1',
  title: 'Decide: does a store line citing playtest results count as publication?',
  description: 'Playtest protocol rule E8…',
  acceptance_criteria: 'The answer is recorded…',
  notes: 'Source: notion',
  status: 'open',
  priority: 1,
  issue_type: 'task',
  owner: 'owner@example.com',
  created_at: '2026-09-11T09:29:07Z',
  created_by: 'schmacka',
  updated_at: '2026-09-11T09:29:07Z',
  dependencies: [
    {
      issue_id: 'baumoscan-cwf.1',
      depends_on_id: 'baumoscan-cwf',
      type: 'parent-child',
      created_at: '2026-09-11T11:29:07Z',
      created_by: 'schmacka',
      metadata: '{}'
    }
  ],
  dependency_count: 0,
  dependent_count: 1,
  comment_count: 0,
  parent: 'baumoscan-cwf'
}

// `bd show --json --include-dependents --include-comments`
const SHOW_ROW = {
  id: 'probe-3os.1',
  title: 'Renamed',
  description: 'desc',
  design: 'd',
  acceptance_criteria: 'acc',
  notes: 'n',
  status: 'in_progress',
  priority: 0,
  issue_type: 'task',
  assignee: 'schmacka',
  owner: 'owner@example.com',
  created_at: '2026-09-15T12:55:58Z',
  created_by: 'schmacka',
  updated_at: '2026-09-15T12:55:59Z',
  labels: ['backend', 'ui'],
  dependencies: [
    {
      id: 'probe-3os',
      title: 'Epic one',
      status: 'open',
      priority: 1,
      issue_type: 'epic',
      created_at: '2026-09-15T12:55:57Z',
      updated_at: '2026-09-15T12:55:57Z',
      dependency_type: 'parent-child'
    }
  ],
  dependents: [
    {
      id: 'probe-9zz',
      title: 'Follow-up',
      status: 'open',
      priority: 3,
      issue_type: 'task',
      created_at: '0001-01-01T00:00:00Z',
      updated_at: '0001-01-01T00:00:00Z',
      dependency_type: 'blocks'
    }
  ],
  comments: [
    {
      id: '01a0a523-74db-7e5f-8143-6c2b279f2fee',
      issue_id: 'probe-3os.1',
      author: 'schmacka',
      text: '-hello comment',
      created_at: '2026-09-15T12:55:59Z'
    }
  ],
  parent: 'probe-3os',
  dependent_count: 1,
  dependency_count: 1,
  comment_count: 1
}

describe('normalizeBeadsIssue', () => {
  it('maps a bd list row including edge records', () => {
    expect(normalizeBeadsIssue(LIST_ROW)).toEqual({
      id: 'baumoscan-cwf.1',
      title: 'Decide: does a store line citing playtest results count as publication?',
      description: 'Playtest protocol rule E8…',
      acceptanceCriteria: 'The answer is recorded…',
      notes: 'Source: notion',
      status: 'open',
      priority: 1,
      issueType: 'task',
      owner: 'owner@example.com',
      createdBy: 'schmacka',
      labels: [],
      parent: 'baumoscan-cwf',
      createdAt: '2026-09-11T09:29:07Z',
      updatedAt: '2026-09-11T09:29:07Z',
      dependencyCount: 0,
      dependentCount: 1,
      commentCount: 0,
      blockedBy: [],
      dependencyEdges: [{ dependsOnId: 'baumoscan-cwf', dependencyType: 'parent-child' }]
    })
  })

  it('reads bd blocked rows and close/defer metadata', () => {
    const issue = normalizeBeadsIssue({
      id: 'b-1',
      title: 'Blocked thing',
      status: 'closed',
      blocked_by: ['b-2', 'b-3'],
      blocked_by_count: 2,
      close_reason: 'done it',
      closed_at: '2026-09-15T12:56:00Z',
      defer_until: '2026-09-16T14:56:01Z'
    })
    expect(issue?.blockedBy).toEqual(['b-2', 'b-3'])
    expect(issue?.closeReason).toBe('done it')
    expect(issue?.deferUntil).toBe('2026-09-16T14:56:01Z')
  })

  it('keeps custom statuses verbatim and defaults missing fields', () => {
    const issue = normalizeBeadsIssue({ id: 'x-1', title: 'T', status: 'hooked' })
    expect(issue).toMatchObject({
      status: 'hooked',
      priority: 2,
      issueType: 'task',
      createdAt: '',
      updatedAt: ''
    })
  })

  it('rejects rows without id or title', () => {
    expect(normalizeBeadsIssue({ title: 'no id' })).toBeNull()
    expect(normalizeBeadsIssue({ id: 'x-1' })).toBeNull()
    expect(normalizeBeadsIssue('x-1')).toBeNull()
  })
})

describe('normalizeBeadsRelation', () => {
  it('maps show relations and drops raw edge records', () => {
    expect(normalizeBeadsRelation(SHOW_ROW.dependencies[0])).toEqual({
      id: 'probe-3os',
      title: 'Epic one',
      status: 'open',
      priority: 1,
      issueType: 'epic',
      dependencyType: 'parent-child'
    })
    expect(normalizeBeadsRelation(LIST_ROW.dependencies[0])).toBeNull()
  })
})

describe('normalizeBeadsComment', () => {
  it('keeps leading-dash text and string ids', () => {
    expect(normalizeBeadsComment(SHOW_ROW.comments[0])).toEqual({
      id: '01a0a523-74db-7e5f-8143-6c2b279f2fee',
      author: 'schmacka',
      text: '-hello comment',
      createdAt: '2026-09-15T12:55:59Z'
    })
  })

  it('accepts numeric ids and rejects comments without text', () => {
    expect(normalizeBeadsComment({ id: 7, text: 'a', created_at: 'x' })?.id).toBe('7')
    expect(normalizeBeadsComment({ id: 'c', created_at: 'x' })).toBeNull()
  })
})

describe('normalizeBeadsIssueDetails', () => {
  it('splits dependencies, dependents and comments', () => {
    const details = normalizeBeadsIssueDetails(SHOW_ROW)
    expect(details?.issue.id).toBe('probe-3os.1')
    expect(details?.issue.dependencyEdges).toEqual([
      { dependsOnId: 'probe-3os', dependencyType: 'parent-child' }
    ])
    expect(details?.dependencies.map((relation) => relation.id)).toEqual(['probe-3os'])
    expect(details?.dependents.map((relation) => relation.dependencyType)).toEqual(['blocks'])
    expect(details?.comments).toHaveLength(1)
  })

  it('treats a missing comments key as no comments', () => {
    expect(normalizeBeadsIssueDetails({ ...SHOW_ROW, comments: undefined })?.comments).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/shared/beads/beads-issue-normalize.test.ts`
Expected: FAIL — cannot resolve `./beads-issue-normalize`.

- [ ] **Step 3: Implement**

`src/shared/beads/beads-issue-normalize.ts`:
```ts
import type {
  BeadsDependencyEdge,
  BeadsIssue,
  BeadsIssueComment,
  BeadsIssueDetails,
  BeadsIssueRelation
} from './beads-issue-types'
import {
  isJsonRecord,
  readFiniteNumber,
  readOptionalString,
  readStringList
} from './beads-json-value'

// Ported from stablyai/orca#14013 (ajchemist) and adapted to bd 1.2.2 output:
// statuses stay free strings (custom statuses exist), `bd list` edge records and
// `bd show` relation objects are both understood, and a missing timestamp no
// longer drops the whole issue.

const DEFAULT_PRIORITY = 2

function readDependencyEdges(value: unknown): BeadsDependencyEdge[] {
  if (!Array.isArray(value)) {
    return []
  }
  const edges: BeadsDependencyEdge[] = []
  for (const entry of value) {
    if (!isJsonRecord(entry)) {
      continue
    }
    // `bd list` emits {depends_on_id, type}; `bd show` emits the related issue plus dependency_type.
    const dependsOnId = readOptionalString(entry.depends_on_id) ?? readOptionalString(entry.id)
    const dependencyType =
      readOptionalString(entry.type) ?? readOptionalString(entry.dependency_type)
    if (dependsOnId && dependencyType) {
      edges.push({ dependsOnId, dependencyType })
    }
  }
  return edges
}

export function normalizeBeadsIssue(raw: unknown): BeadsIssue | null {
  if (!isJsonRecord(raw)) {
    return null
  }
  const id = readOptionalString(raw.id)
  if (!id || typeof raw.title !== 'string') {
    return null
  }
  return {
    id,
    title: raw.title,
    description: readOptionalString(raw.description),
    design: readOptionalString(raw.design),
    acceptanceCriteria: readOptionalString(raw.acceptance_criteria),
    notes: readOptionalString(raw.notes),
    status: readOptionalString(raw.status) ?? 'open',
    priority: readFiniteNumber(raw.priority) ?? DEFAULT_PRIORITY,
    issueType: readOptionalString(raw.issue_type) ?? 'task',
    // Why: `owner` is the creator's account, never the assignee.
    assignee: readOptionalString(raw.assignee),
    owner: readOptionalString(raw.owner),
    createdBy: readOptionalString(raw.created_by),
    labels: readStringList(raw.labels),
    parent: readOptionalString(raw.parent),
    createdAt: readOptionalString(raw.created_at) ?? '',
    updatedAt: readOptionalString(raw.updated_at) ?? '',
    closedAt: readOptionalString(raw.closed_at),
    closeReason: readOptionalString(raw.close_reason),
    deferUntil: readOptionalString(raw.defer_until),
    dependencyCount: readFiniteNumber(raw.dependency_count) ?? 0,
    dependentCount: readFiniteNumber(raw.dependent_count) ?? 0,
    commentCount: readFiniteNumber(raw.comment_count) ?? 0,
    blockedBy: readStringList(raw.blocked_by),
    dependencyEdges: readDependencyEdges(raw.dependencies)
  }
}

export function normalizeBeadsRelation(raw: unknown): BeadsIssueRelation | null {
  if (!isJsonRecord(raw)) {
    return null
  }
  const id = readOptionalString(raw.id)
  if (!id || typeof raw.title !== 'string') {
    return null
  }
  return {
    id,
    title: raw.title,
    status: readOptionalString(raw.status) ?? 'open',
    priority: readFiniteNumber(raw.priority) ?? DEFAULT_PRIORITY,
    issueType: readOptionalString(raw.issue_type) ?? 'task',
    dependencyType: readOptionalString(raw.dependency_type) ?? 'blocks'
  }
}

function readRelations(value: unknown): BeadsIssueRelation[] {
  if (!Array.isArray(value)) {
    return []
  }
  const relations: BeadsIssueRelation[] = []
  for (const entry of value) {
    const relation = normalizeBeadsRelation(entry)
    if (relation) {
      relations.push(relation)
    }
  }
  return relations
}

export function normalizeBeadsComment(raw: unknown): BeadsIssueComment | null {
  if (!isJsonRecord(raw)) {
    return null
  }
  const numericId = readFiniteNumber(raw.id)
  const id = readOptionalString(raw.id) ?? (numericId === undefined ? undefined : String(numericId))
  const createdAt = readOptionalString(raw.created_at)
  if (!id || typeof raw.text !== 'string' || !createdAt) {
    return null
  }
  return { id, author: readOptionalString(raw.author) ?? '', text: raw.text, createdAt }
}

function readComments(value: unknown): BeadsIssueComment[] {
  if (!Array.isArray(value)) {
    return []
  }
  const comments: BeadsIssueComment[] = []
  for (const entry of value) {
    const comment = normalizeBeadsComment(entry)
    if (comment) {
      comments.push(comment)
    }
  }
  return comments
}

export function normalizeBeadsIssueDetails(raw: unknown): BeadsIssueDetails | null {
  const issue = normalizeBeadsIssue(raw)
  if (!issue || !isJsonRecord(raw)) {
    return null
  }
  return {
    issue,
    dependencies: readRelations(raw.dependencies),
    dependents: readRelations(raw.dependents),
    comments: readComments(raw.comments)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/shared/beads/beads-issue-normalize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/beads/beads-issue-normalize.ts src/shared/beads/beads-issue-normalize.test.ts
git commit -m "feat(beads): normalize bd issues, relations, comments and details

Ported from stablyai/orca#14013 and adapted to bd 1.2.2 output.

Co-authored-by: ajchemist <1694505+aJchemist@users.noreply.github.com>
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Executor, error classification and bd JSON parsing

These three files reference each other's types, so they land together.

**Files:**
- Create: `src/main/beads/beads-executor.ts`
- Create: `src/main/beads/beads-error.ts`
- Create: `src/main/beads/bd-json.ts`
- Test: `src/main/beads/beads-executor.test.ts`, `src/main/beads/beads-error.test.ts`, `src/main/beads/bd-json.test.ts`

**Interfaces:**
- Consumes: `commandExecFileAsync(command, args, options): Promise<{stdout, stderr}>` and `extractExecError(err): {stderr, stdout}` from `src/main/git/runner`; `isMissingCommandBinaryError(err): boolean` from `src/main/git/exec-error`; `getSshGitProvider(connectionId)`, `getSshGitProviderGeneration(connectionId)` from `src/main/providers/ssh-git-dispatch` (provider has `execNonInteractive(binary, args, cwd, timeoutMs): Promise<{stdout, stderr, exitCode: number | null, timedOut: boolean, canceled?: boolean, spawnError?: string}>`); `BeadsErrorKind`, `BeadsFailure`, `BeadsResult` (Task 1); `isJsonRecord` (Task 1).
- Produces:
  - `type BeadsExecutionTarget = { repoPath: string; connectionId: string | null; wslDistro?: string }`
  - `type BdExecResult = { stdout: string; stderr: string; exitCode: number | null; spawnFailed: boolean; hostOffline: boolean; timedOut: boolean }`
  - `BD_READ_TIMEOUT_MS = 15_000`, `BD_WRITE_TIMEOUT_MS = 30_000`
  - `beadsHostKey(target: BeadsExecutionTarget): string`
  - `runBd(target: BeadsExecutionTarget, args: readonly string[], timeoutMs: number): Promise<BdExecResult>`
  - `class BeadsError extends Error { readonly kind: BeadsErrorKind }`
  - `isBdNotInitializedOutput(output: string): boolean`
  - `classifyBdFailure(result: BdExecResult): BeadsError`
  - `toBeadsFailure(error: unknown): BeadsFailure`
  - `captureBeadsResult<T>(run: () => Promise<T>): Promise<BeadsResult<T>>`
  - `unwrapBdJsonEnvelope(parsed: unknown): unknown`, `parseBdJson(stdout: string): unknown`, `parseBdJsonList(stdout: string): unknown[]`, `parseBdJsonRecord(stdout: string): Record<string, unknown>`

- [ ] **Step 1: Write the failing tests**

`src/main/beads/beads-executor.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { commandExecFileAsyncMock, getSshGitProviderMock } = vi.hoisted(() => ({
  commandExecFileAsyncMock: vi.fn(),
  getSshGitProviderMock: vi.fn()
}))

vi.mock('../git/runner', () => ({
  commandExecFileAsync: commandExecFileAsyncMock,
  extractExecError: (err: { stderr?: string; stdout?: string; message?: string }) => ({
    stderr: err.stderr ?? err.message ?? '',
    stdout: err.stdout ?? ''
  })
}))

vi.mock('../providers/ssh-git-dispatch', () => ({
  getSshGitProvider: getSshGitProviderMock,
  getSshGitProviderGeneration: vi.fn(() => 3)
}))

import { beadsHostKey, runBd } from './beads-executor'

const LOCAL = { repoPath: '/repo', connectionId: null }

beforeEach(() => {
  commandExecFileAsyncMock.mockReset()
  getSshGitProviderMock.mockReset()
})

describe('beadsHostKey', () => {
  it('distinguishes local, WSL and SSH hosts including the SSH generation', () => {
    expect(beadsHostKey(LOCAL)).toBe('local')
    expect(beadsHostKey({ ...LOCAL, wslDistro: 'Ubuntu' })).toBe('wsl:ubuntu')
    expect(beadsHostKey({ repoPath: '/r', connectionId: 'c1' })).toBe('ssh:c1:3')
  })
})

describe('runBd locally', () => {
  it('passes argv without a shell and returns stdout', async () => {
    commandExecFileAsyncMock.mockResolvedValueOnce({ stdout: '[]', stderr: '' })
    const result = await runBd({ ...LOCAL, wslDistro: 'Ubuntu' }, ['list', '--json'], 15_000)
    expect(commandExecFileAsyncMock).toHaveBeenCalledWith('bd', ['list', '--json'], {
      cwd: '/repo',
      timeout: 15_000,
      wslDistro: 'Ubuntu'
    })
    expect(result).toEqual({
      stdout: '[]',
      stderr: '',
      exitCode: 0,
      spawnFailed: false,
      hostOffline: false,
      timedOut: false
    })
  })

  it('reports a missing binary', async () => {
    commandExecFileAsyncMock.mockRejectedValueOnce({
      code: 'ENOENT',
      syscall: 'spawn bd',
      message: 'spawn bd ENOENT'
    })
    const result = await runBd(LOCAL, ['version'], 15_000)
    expect(result.spawnFailed).toBe(true)
    expect(result.exitCode).toBeNull()
  })

  it('keeps stdout/stderr and the exit code of a failed command', async () => {
    commandExecFileAsyncMock.mockRejectedValueOnce({
      code: 1,
      stderr: 'Error fetching x: no issue found matching "x"',
      stdout: '{"error":"no issues found matching the provided IDs"}',
      message: 'bd exited'
    })
    const result = await runBd(LOCAL, ['show', 'x', '--json'], 15_000)
    expect(result).toMatchObject({ exitCode: 1, spawnFailed: false, timedOut: false })
    expect(result.stderr).toContain('no issue found')
  })

  it('flags timeouts', async () => {
    commandExecFileAsyncMock.mockRejectedValueOnce(new Error('bd timed out.'))
    expect((await runBd(LOCAL, ['list', '--json'], 10)).timedOut).toBe(true)
  })
})

describe('runBd over SSH', () => {
  it('runs bd on the remote host in the repo directory', async () => {
    const execNonInteractive = vi
      .fn()
      .mockResolvedValue({ stdout: '[]', stderr: '', exitCode: 0, timedOut: false })
    getSshGitProviderMock.mockReturnValue({ execNonInteractive })
    const result = await runBd({ repoPath: '/srv/repo', connectionId: 'c1' }, ['ready', '--json'], 15_000)
    expect(execNonInteractive).toHaveBeenCalledWith('bd', ['ready', '--json'], '/srv/repo', 15_000)
    expect(result.exitCode).toBe(0)
  })

  it('reports an unavailable connection as host offline', async () => {
    getSshGitProviderMock.mockReturnValue(undefined)
    const result = await runBd({ repoPath: '/srv/repo', connectionId: 'c1' }, ['version'], 15_000)
    expect(result.hostOffline).toBe(true)
  })

  it('reports a remote spawn error as a missing binary', async () => {
    getSshGitProviderMock.mockReturnValue({
      execNonInteractive: vi.fn().mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: null,
        timedOut: false,
        spawnError: 'spawn bd ENOENT'
      })
    })
    const result = await runBd({ repoPath: '/srv/repo', connectionId: 'c1' }, ['version'], 15_000)
    expect(result.spawnFailed).toBe(true)
    expect(result.stderr).toContain('ENOENT')
  })
})
```

`src/main/beads/beads-error.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  BeadsError,
  captureBeadsResult,
  classifyBdFailure,
  isBdNotInitializedOutput,
  toBeadsFailure
} from './beads-error'
import type { BdExecResult } from './beads-executor'

function failed(overrides: Partial<BdExecResult>): BdExecResult {
  return {
    stdout: '',
    stderr: '',
    exitCode: 1,
    spawnFailed: false,
    hostOffline: false,
    timedOut: false,
    ...overrides
  }
}

describe('classifyBdFailure', () => {
  it('orders transport problems before output matching', () => {
    expect(classifyBdFailure(failed({ hostOffline: true })).kind).toBe('host-offline')
    expect(classifyBdFailure(failed({ spawnFailed: true })).kind).toBe('bd-missing')
    expect(classifyBdFailure(failed({ timedOut: true })).kind).toBe('busy')
  })

  it('detects ambiguous ids from stderr even though stdout says not found (bd 1.2.2)', () => {
    const error = classifyBdFailure(
      failed({
        stderr:
          'Error fetching baumoscan-1: ambiguous ID "baumoscan-1" matches 2 issues: [a b]\nUse more characters to disambiguate',
        stdout: '{"error": "no issues found matching the provided IDs", "schema_version": 1}'
      })
    )
    expect(error.kind).toBe('ambiguous-id')
    expect(error.message).toContain('ambiguous ID')
  })

  it('detects unknown ids', () => {
    const error = classifyBdFailure(
      failed({
        stderr: 'Error fetching nope-zzz: no issue found matching "nope-zzz"',
        stdout: '{"error": "no issues found matching the provided IDs"}'
      })
    )
    expect(error.kind).toBe('not-found')
  })

  it('detects uninitialized workspaces from bd list and bd context wording', () => {
    expect(
      classifyBdFailure(failed({ stderr: 'Error: no beads database found\nHint: run bd init' })).kind
    ).toBe('not-initialized')
    expect(
      classifyBdFailure(
        failed({ stdout: '{"error": "cannot resolve repo context: no .beads directory found"}' })
      ).kind
    ).toBe('not-initialized')
  })

  it('never reports other failures as not initialized', () => {
    const error = classifyBdFailure(failed({ stderr: 'database is corrupt', exitCode: 2 }))
    expect(error.kind).toBe('failed')
    expect(error.message).toBe('database is corrupt')
    expect(classifyBdFailure(failed({ exitCode: 3 })).message).toBe('bd exited with code 3')
  })
})

describe('isBdNotInitializedOutput', () => {
  it('does not match unrelated text', () => {
    expect(isBdNotInitializedOutput('permission denied')).toBe(false)
  })
})

describe('toBeadsFailure and captureBeadsResult', () => {
  it('keeps the kind of BeadsError and maps other errors to failed', async () => {
    expect(toBeadsFailure(new BeadsError('busy', 'b'))).toEqual({ kind: 'busy', message: 'b' })
    expect(toBeadsFailure(new Error('boom'))).toEqual({ kind: 'failed', message: 'boom' })
    expect(await captureBeadsResult(async () => 3)).toEqual({ ok: true, value: 3 })
    expect(
      await captureBeadsResult(async () => {
        throw new BeadsError('not-found', 'nope')
      })
    ).toEqual({ ok: false, error: { kind: 'not-found', message: 'nope' } })
  })
})
```

`src/main/beads/bd-json.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { parseBdJson, parseBdJsonList, parseBdJsonRecord, unwrapBdJsonEnvelope } from './bd-json'

describe('bd JSON parsing', () => {
  it('unwraps the BD_JSON_ENVELOPE format but not plain objects with schema_version', () => {
    expect(unwrapBdJsonEnvelope({ schema_version: 1, data: [1] })).toEqual([1])
    expect(unwrapBdJsonEnvelope({ schema_version: 1, count: 2 })).toEqual({
      schema_version: 1,
      count: 2
    })
  })

  it('parses lists, treating empty stdout and null as empty', () => {
    expect(parseBdJsonList('[{"id":"a"}]')).toEqual([{ id: 'a' }])
    expect(parseBdJsonList('{"schema_version":1,"data":[]}')).toEqual([])
    expect(parseBdJsonList('')).toEqual([])
    expect(parseBdJsonList('null')).toEqual([])
  })

  it('throws on unparseable output, error payloads and wrong top-level types', () => {
    expect(() => parseBdJson('not json')).toThrow(/unparseable JSON/)
    expect(() => parseBdJson('{"error":"boom"}')).toThrow(/bd reported an error: boom/)
    expect(() => parseBdJson('{"schema_version":1,"data":{"error":"boom"}}')).toThrow(/boom/)
    expect(() => parseBdJsonList('{"count":1}')).toThrow(/non-list/)
    expect(() => parseBdJsonRecord('[]')).toThrow(/non-object/)
  })

  it('parses records', () => {
    expect(parseBdJsonRecord('{"count":24,"schema_version":1}')).toEqual({
      count: 24,
      schema_version: 1
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/main/beads`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the executor**

`src/main/beads/beads-executor.ts`:
```ts
import { isMissingCommandBinaryError } from '../git/exec-error'
import { commandExecFileAsync, extractExecError } from '../git/runner'
import { getSshGitProvider, getSshGitProviderGeneration } from '../providers/ssh-git-dispatch'

export const BD_READ_TIMEOUT_MS = 15_000
export const BD_WRITE_TIMEOUT_MS = 30_000

export type BeadsExecutionTarget = {
  repoPath: string
  /** null = the repo lives on this machine (or its WSL distro). */
  connectionId: string | null
  wslDistro?: string
}

export type BdExecResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  spawnFailed: boolean
  hostOffline: boolean
  timedOut: boolean
}

export function beadsHostKey(target: BeadsExecutionTarget): string {
  if (target.connectionId) {
    // Why: the generation changes on reconnect, so host-scoped caches reset with it.
    return `ssh:${target.connectionId}:${getSshGitProviderGeneration(target.connectionId)}`
  }
  return target.wslDistro ? `wsl:${target.wslDistro.toLowerCase()}` : 'local'
}

function readErrorCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function offlineResult(message: string): BdExecResult {
  return {
    stdout: '',
    stderr: message,
    exitCode: null,
    spawnFailed: false,
    hostOffline: true,
    timedOut: false
  }
}

async function runBdOverSsh(
  connectionId: string,
  repoPath: string,
  args: readonly string[],
  timeoutMs: number
): Promise<BdExecResult> {
  const provider = getSshGitProvider(connectionId)
  if (!provider) {
    return offlineResult('SSH connection unavailable')
  }
  try {
    // Why: bd must run where .beads/ lives, so SSH repos run it on the remote host.
    const result = await provider.execNonInteractive('bd', [...args], repoPath, timeoutMs)
    return {
      stdout: result.stdout,
      stderr: result.spawnError ? `${result.spawnError}\n${result.stderr}` : result.stderr,
      exitCode: result.exitCode,
      spawnFailed: Boolean(result.spawnError),
      hostOffline: false,
      timedOut: result.timedOut
    }
  } catch (error) {
    return offlineResult(errorMessage(error))
  }
}

async function runBdLocally(
  target: BeadsExecutionTarget,
  args: readonly string[],
  timeoutMs: number
): Promise<BdExecResult> {
  try {
    const { stdout, stderr } = await commandExecFileAsync('bd', [...args], {
      cwd: target.repoPath,
      timeout: timeoutMs,
      wslDistro: target.wslDistro
    })
    return { stdout, stderr, exitCode: 0, spawnFailed: false, hostOffline: false, timedOut: false }
  } catch (error) {
    const { stdout, stderr } = extractExecError(error)
    const code = readErrorCode(error)
    return {
      stdout,
      stderr,
      exitCode: typeof code === 'number' ? code : null,
      spawnFailed: isMissingCommandBinaryError(error),
      hostOffline: false,
      timedOut: /timed out/i.test(errorMessage(error))
    }
  }
}

export async function runBd(
  target: BeadsExecutionTarget,
  args: readonly string[],
  timeoutMs: number
): Promise<BdExecResult> {
  return target.connectionId
    ? runBdOverSsh(target.connectionId, target.repoPath, args, timeoutMs)
    : runBdLocally(target, args, timeoutMs)
}
```

Note: the local test's `toHaveBeenCalledWith(..., { cwd, timeout, wslDistro })` passes `wslDistro: undefined` for non-WSL calls; that is fine for `commandExecFileAsync`.

- [ ] **Step 4: Implement errors and JSON parsing**

`src/main/beads/beads-error.ts`:
```ts
import type { BeadsErrorKind, BeadsFailure, BeadsResult } from '../../shared/beads/beads-contract'
import type { BdExecResult } from './beads-executor'

const MAX_MESSAGE_LENGTH = 500

export class BeadsError extends Error {
  readonly kind: BeadsErrorKind

  constructor(kind: BeadsErrorKind, message: string) {
    super(message)
    this.name = 'BeadsError'
    this.kind = kind
  }
}

function truncateMessage(text: string): string {
  return text.length > MAX_MESSAGE_LENGTH ? `${text.slice(0, MAX_MESSAGE_LENGTH)}…` : text
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? ''
}

export function isBdNotInitializedOutput(output: string): boolean {
  return /no beads (?:database|workspace) found|not a beads (?:database|workspace)|no \.beads directory found/i.test(
    output
  )
}

export function classifyBdFailure(result: BdExecResult): BeadsError {
  if (result.hostOffline) {
    return new BeadsError('host-offline', 'The remote host is not connected.')
  }
  if (result.spawnFailed) {
    return new BeadsError('bd-missing', 'bd is not installed on this host.')
  }
  if (result.timedOut) {
    return new BeadsError('busy', 'Beads is busy (another process may be writing). Try again.')
  }
  // Why: bd 1.2.2 prints the same "no issues found" JSON for ambiguous and unknown
  // ids; only stderr says "ambiguous", so it must be checked first.
  if (/ambiguous ID/i.test(result.stderr)) {
    return new BeadsError('ambiguous-id', truncateMessage(firstLine(result.stderr)))
  }
  const output = `${result.stderr}\n${result.stdout}`
  if (/no issues? found matching/i.test(output)) {
    return new BeadsError('not-found', truncateMessage(firstLine(result.stderr) || 'Issue not found.'))
  }
  if (isBdNotInitializedOutput(output)) {
    return new BeadsError(
      'not-initialized',
      'Beads is not initialized in this repository. Run `bd init`.'
    )
  }
  const detail = result.stderr.trim() || result.stdout.trim()
  return new BeadsError(
    'failed',
    truncateMessage(detail || `bd exited with code ${result.exitCode ?? 'unknown'}`)
  )
}

export function toBeadsFailure(error: unknown): BeadsFailure {
  if (error instanceof BeadsError) {
    return { kind: error.kind, message: error.message }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { kind: 'failed', message: truncateMessage(message) }
}

export async function captureBeadsResult<T>(run: () => Promise<T>): Promise<BeadsResult<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    return { ok: false, error: toBeadsFailure(error) }
  }
}
```

`src/main/beads/bd-json.ts`:
```ts
import { isJsonRecord } from '../../shared/beads/beads-json-value'
import { BeadsError } from './beads-error'

function preview(text: string): string {
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

// Why: under BD_JSON_ENVELOPE=1 (announced default for bd 2.0) payloads arrive as
// {"schema_version":1,"data":…}. Plain objects such as `bd count` also carry
// schema_version, so both keys are required before unwrapping.
export function unwrapBdJsonEnvelope(parsed: unknown): unknown {
  return isJsonRecord(parsed) && 'schema_version' in parsed && 'data' in parsed
    ? parsed.data
    : parsed
}

export function parseBdJson(stdout: string): unknown {
  const trimmed = stdout.trim()
  if (trimmed === '') {
    return null
  }
  let parsed: unknown
  try {
    parsed = unwrapBdJsonEnvelope(JSON.parse(trimmed))
  } catch {
    throw new BeadsError('failed', `bd returned unparseable JSON: ${preview(trimmed)}`)
  }
  // Why: bd can exit 0 while printing {"error": …}; treating it as data hides the failure.
  if (isJsonRecord(parsed) && typeof parsed.error === 'string') {
    throw new BeadsError('failed', `bd reported an error: ${parsed.error}`)
  }
  return parsed
}

export function parseBdJsonList(stdout: string): unknown[] {
  const parsed = parseBdJson(stdout)
  // Why: some list commands (e.g. `bd gate list --json`) print `null` for "none".
  if (parsed === null) {
    return []
  }
  if (!Array.isArray(parsed)) {
    throw new BeadsError('failed', `bd returned a non-list JSON payload: ${preview(stdout.trim())}`)
  }
  return parsed
}

export function parseBdJsonRecord(stdout: string): Record<string, unknown> {
  const parsed = parseBdJson(stdout)
  if (!isJsonRecord(parsed)) {
    throw new BeadsError('failed', `bd returned a non-object JSON payload: ${preview(stdout.trim())}`)
  }
  return parsed
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/main/beads`
Expected: PASS (3 files).

- [ ] **Step 6: Commit**

```bash
git add src/main/beads/beads-executor.ts src/main/beads/beads-error.ts src/main/beads/bd-json.ts src/main/beads/*.test.ts
git commit -m "feat(beads): run bd on the repo host and classify its failures

Local and WSL repos use commandExecFileAsync; SSH repos run bd on the remote
host through execNonInteractive. Ambiguous ids are detected from stderr before
the shared not-found JSON; any other failure stays 'failed', never
'not-initialized'. Envelope handling ported from stablyai/orca#14013.

Co-authored-by: ajchemist <1694505+aJchemist@users.noreply.github.com>
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Per-database queue

**Files:**
- Create: `src/main/beads/beads-db-queue.ts`
- Test: `src/main/beads/beads-db-queue.test.ts`

**Interfaces:**
- Produces: `class BeadsDbQueue { run<T>(key: string, task: () => Promise<T>): Promise<T>; runShared<T>(key: string, shareKey: string, task: () => Promise<T>): Promise<T> }`

- [ ] **Step 1: Write the failing test**

`src/main/beads/beads-db-queue.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { BeadsDbQueue } from './beads-db-queue'

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void }

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve()
  }
}

describe('BeadsDbQueue', () => {
  it('runs tasks for the same database one at a time, in order', async () => {
    const queue = new BeadsDbQueue()
    const first = deferred<string>()
    const started: string[] = []
    const a = queue.run('db', async () => {
      started.push('a')
      return first.promise
    })
    const b = queue.run('db', async () => {
      started.push('b')
      return 'b'
    })
    await flush()
    expect(started).toEqual(['a'])
    first.resolve('a')
    expect(await a).toBe('a')
    expect(await b).toBe('b')
    expect(started).toEqual(['a', 'b'])
  })

  it('runs different databases concurrently', async () => {
    const queue = new BeadsDbQueue()
    const blocker = deferred<string>()
    const started: string[] = []
    void queue.run('db-1', async () => {
      started.push('db-1')
      return blocker.promise
    })
    void queue.run('db-2', async () => {
      started.push('db-2')
      return 'x'
    })
    await flush()
    expect(started).toEqual(['db-1', 'db-2'])
    blocker.resolve('done')
  })

  it('continues after a failed task', async () => {
    const queue = new BeadsDbQueue()
    const failing = queue.run('db', async () => {
      throw new Error('boom')
    })
    const next = queue.run('db', async () => 'ok')
    await expect(failing).rejects.toThrow('boom')
    expect(await next).toBe('ok')
  })

  it('shares an identical in-flight read and runs it again once settled', async () => {
    const queue = new BeadsDbQueue()
    let runs = 0
    const gate = deferred<number>()
    const task = async () => {
      runs += 1
      return gate.promise
    }
    const first = queue.runShared('db', 'list', task)
    const second = queue.runShared('db', 'list', task)
    expect(second).toBe(first)
    gate.resolve(7)
    expect(await second).toBe(7)
    await flush()
    await queue.runShared('db', 'list', async () => {
      runs += 1
      return 8
    })
    expect(runs).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/beads/beads-db-queue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/main/beads/beads-db-queue.ts`:
```ts
// Why: embedded Dolt serializes writers on a file lock; several Orca calls racing
// for it just wait in bd and eat into their timeouts. Queueing Orca's own calls
// per database keeps UI reads from timing out behind each other.
export class BeadsDbQueue {
  private readonly tails = new Map<string, Promise<void>>()
  private readonly shared = new Map<string, Promise<unknown>>()

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve()
    const result = previous.then(() => task())
    const tail = result.then(
      () => undefined,
      () => undefined
    )
    this.tails.set(key, tail)
    void tail.then(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key)
      }
    })
    return result
  }

  runShared<T>(key: string, shareKey: string, task: () => Promise<T>): Promise<T> {
    const id = `${key}\n${shareKey}`
    const existing = this.shared.get(id)
    if (existing) {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: entries under this id are only created below by runShared<T> with the same shareKey, and a shareKey is the exact bd argv, which fixes the result type.
      return existing as Promise<T>
    }
    const result = this.run(key, task)
    this.shared.set(id, result)
    const clear = (): void => {
      if (this.shared.get(id) === result) {
        this.shared.delete(id)
      }
    }
    result.then(clear, clear)
    return result
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/beads/beads-db-queue.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/beads/beads-db-queue.ts src/main/beads/beads-db-queue.test.ts
git commit -m "feat(beads): serialize bd calls per database and share identical reads

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Version gate and repo context

**Files:**
- Create: `src/main/beads/beads-version.ts`
- Create: `src/main/beads/beads-context.ts`
- Test: `src/main/beads/beads-version.test.ts`, `src/main/beads/beads-context.test.ts`

**Interfaces:**
- Consumes: `runBd`, `beadsHostKey`, `BD_READ_TIMEOUT_MS`, `BeadsExecutionTarget` (Task 4); `BeadsError`, `classifyBdFailure` (Task 4); `parseBdJsonRecord` (Task 4); `readOptionalString` (Task 1).
- Produces:
  - `BD_MIN_VERSION: readonly [number, number, number]` (= `[1, 2, 0]`)
  - `type BdVersionInfo = { installed: boolean; version: string | null; supported: boolean; hostOffline: boolean }`
  - `parseBdVersion(output: string): string | null`, `isSupportedBdVersion(version: string): boolean`
  - `getBdVersionInfo(target): Promise<BdVersionInfo>`, `requireSupportedBd(target): Promise<string>`, `resetBdVersionCacheForTests(): void`
  - `type BeadsRepoContext = { beadsDir: string; projectId: string | null; database: string | null; isWorktree: boolean }`
  - `normalizeBeadsContext(raw: Record<string, unknown>): BeadsRepoContext | null`
  - `resolveBeadsContext(target): Promise<BeadsRepoContext>`, `resetBeadsContextCacheForTests(): void`

- [ ] **Step 1: Write the failing tests**

`src/main/beads/beads-version.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runBdMock } = vi.hoisted(() => ({ runBdMock: vi.fn() }))

vi.mock('./beads-executor', () => ({
  BD_READ_TIMEOUT_MS: 15_000,
  beadsHostKey: () => 'local',
  runBd: runBdMock
}))

import {
  getBdVersionInfo,
  isSupportedBdVersion,
  parseBdVersion,
  requireSupportedBd,
  resetBdVersionCacheForTests
} from './beads-version'

const TARGET = { repoPath: '/repo', connectionId: null }

function reply(stdout: string, overrides: Record<string, unknown> = {}) {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    spawnFailed: false,
    hostOffline: false,
    timedOut: false,
    ...overrides
  }
}

beforeEach(() => {
  runBdMock.mockReset()
  resetBdVersionCacheForTests()
})

describe('bd version parsing', () => {
  it('parses the version line and gates on 1.2.0', () => {
    expect(parseBdVersion('bd version 1.2.2 (Homebrew)\n')).toBe('1.2.2')
    expect(parseBdVersion('garbage')).toBeNull()
    expect(isSupportedBdVersion('1.2.0')).toBe(true)
    expect(isSupportedBdVersion('1.10.0')).toBe(true)
    expect(isSupportedBdVersion('2.0.0')).toBe(true)
    expect(isSupportedBdVersion('1.1.9')).toBe(false)
    expect(isSupportedBdVersion('1.2')).toBe(false)
  })
})

describe('getBdVersionInfo', () => {
  it('caches a supported version per host and dedupes concurrent probes', async () => {
    runBdMock.mockResolvedValue(reply('bd version 1.2.2 (Homebrew)'))
    const [a, b] = await Promise.all([getBdVersionInfo(TARGET), getBdVersionInfo(TARGET)])
    await getBdVersionInfo(TARGET)
    expect(a).toEqual({ installed: true, version: '1.2.2', supported: true, hostOffline: false })
    expect(b).toEqual(a)
    expect(runBdMock).toHaveBeenCalledTimes(1)
    expect(runBdMock).toHaveBeenCalledWith(TARGET, ['version'], 15_000)
  })

  it('does not cache an offline host', async () => {
    runBdMock.mockResolvedValueOnce(reply('', { hostOffline: true, exitCode: null }))
    runBdMock.mockResolvedValueOnce(reply('bd version 1.2.2'))
    expect((await getBdVersionInfo(TARGET)).hostOffline).toBe(true)
    expect((await getBdVersionInfo(TARGET)).supported).toBe(true)
  })
})

describe('requireSupportedBd', () => {
  it('throws typed errors for offline, missing and outdated bd', async () => {
    runBdMock.mockResolvedValueOnce(reply('', { hostOffline: true, exitCode: null }))
    await expect(requireSupportedBd(TARGET)).rejects.toMatchObject({ kind: 'host-offline' })

    runBdMock.mockResolvedValueOnce(reply('', { spawnFailed: true, exitCode: null }))
    await expect(requireSupportedBd(TARGET)).rejects.toMatchObject({ kind: 'bd-missing' })

    resetBdVersionCacheForTests()
    runBdMock.mockResolvedValueOnce(reply('bd version 1.1.2'))
    await expect(requireSupportedBd(TARGET)).rejects.toMatchObject({ kind: 'bd-outdated' })
  })

  it('returns the version when supported', async () => {
    runBdMock.mockResolvedValueOnce(reply('bd version 1.2.2'))
    await expect(requireSupportedBd(TARGET)).resolves.toBe('1.2.2')
  })
})
```

`src/main/beads/beads-context.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runBdMock } = vi.hoisted(() => ({ runBdMock: vi.fn() }))

vi.mock('./beads-executor', () => ({
  BD_READ_TIMEOUT_MS: 15_000,
  beadsHostKey: () => 'local',
  runBd: runBdMock
}))

import { resetBeadsContextCacheForTests, resolveBeadsContext } from './beads-context'

const TARGET = { repoPath: '/repo-worktree', connectionId: null }

// Verbatim bd 1.2.2 `bd context --json` from a git worktree of baumoscan (trimmed).
const WORKTREE_CONTEXT = {
  backend: 'dolt',
  bd_version: '1.2.2',
  beads_dir: '/Users/me/Developer/baumoscan/.beads',
  database: 'baumoscan',
  dolt_mode: 'embedded',
  is_redirected: false,
  is_worktree: true,
  project_id: 'ed2543a6-80f4-4884-a227-8e8306d2b4d3',
  schema_version: 1
}

function reply(stdout: string, exitCode: number) {
  return { stdout, stderr: '', exitCode, spawnFailed: false, hostOffline: false, timedOut: false }
}

beforeEach(() => {
  runBdMock.mockReset()
  resetBeadsContextCacheForTests()
})

describe('resolveBeadsContext', () => {
  it('resolves a worktree to the main repo beads dir and caches it', async () => {
    runBdMock.mockResolvedValue(reply(JSON.stringify(WORKTREE_CONTEXT), 0))
    const context = await resolveBeadsContext(TARGET)
    await resolveBeadsContext(TARGET)
    expect(context).toEqual({
      beadsDir: '/Users/me/Developer/baumoscan/.beads',
      projectId: 'ed2543a6-80f4-4884-a227-8e8306d2b4d3',
      database: 'baumoscan',
      isWorktree: true
    })
    expect(runBdMock).toHaveBeenCalledTimes(1)
    expect(runBdMock).toHaveBeenCalledWith(TARGET, ['context', '--json'], 15_000)
  })

  it('reports an uninitialized repo', async () => {
    runBdMock.mockResolvedValue(
      reply(
        '{"error": "cannot resolve repo context: no .beads directory found", "schema_version": 1}',
        1
      )
    )
    await expect(resolveBeadsContext(TARGET)).rejects.toMatchObject({ kind: 'not-initialized' })
  })

  it('does not cache failures', async () => {
    runBdMock.mockResolvedValueOnce(reply('', 2))
    runBdMock.mockResolvedValueOnce(reply(JSON.stringify(WORKTREE_CONTEXT), 0))
    await expect(resolveBeadsContext(TARGET)).rejects.toMatchObject({ kind: 'failed' })
    await expect(resolveBeadsContext(TARGET)).resolves.toMatchObject({ isWorktree: true })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/main/beads/beads-version.test.ts src/main/beads/beads-context.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the version gate**

`src/main/beads/beads-version.ts`:
```ts
import { BeadsError } from './beads-error'
import { BD_READ_TIMEOUT_MS, beadsHostKey, runBd } from './beads-executor'
import type { BeadsExecutionTarget } from './beads-executor'

// Why 1.2.0: Orca relies on `ready --limit`, `vc status --json` and `context --json`.
export const BD_MIN_VERSION: readonly [number, number, number] = [1, 2, 0]

const VERSION_CACHE_TTL_MS = 5 * 60 * 1000
// Why: short TTL so installing or upgrading bd mid-session is picked up without a relaunch.
const VERSION_FAILURE_CACHE_TTL_MS = 30_000

export type BdVersionInfo = {
  installed: boolean
  version: string | null
  supported: boolean
  hostOffline: boolean
}

type CachedVersion = { info: BdVersionInfo; expiresAt: number }

const versionCache = new Map<string, CachedVersion>()
const versionProbes = new Map<string, Promise<BdVersionInfo>>()

export function parseBdVersion(output: string): string | null {
  const match = output.match(/(\d+)\.(\d+)\.(\d+)/)
  return match ? `${match[1]}.${match[2]}.${match[3]}` : null
}

export function isSupportedBdVersion(version: string): boolean {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10))
  for (let index = 0; index < BD_MIN_VERSION.length; index += 1) {
    const part = parts[index]
    const minimum = BD_MIN_VERSION[index]
    if (part === undefined || !Number.isFinite(part)) {
      return false
    }
    if (part !== minimum) {
      return part > minimum
    }
  }
  return true
}

async function probeBdVersion(target: BeadsExecutionTarget): Promise<BdVersionInfo> {
  const result = await runBd(target, ['version'], BD_READ_TIMEOUT_MS)
  const version = result.exitCode === 0 ? parseBdVersion(result.stdout) : null
  return {
    installed: result.exitCode === 0 && !result.spawnFailed,
    version,
    supported: version !== null && isSupportedBdVersion(version),
    hostOffline: result.hostOffline
  }
}

export async function getBdVersionInfo(target: BeadsExecutionTarget): Promise<BdVersionInfo> {
  const key = beadsHostKey(target)
  const cached = versionCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.info
  }
  const inflight = versionProbes.get(key)
  if (inflight) {
    return inflight
  }
  const probe = probeBdVersion(target)
    .then((info) => {
      // Why: an offline host says nothing about bd; caching it would hide bd after reconnect.
      if (!info.hostOffline) {
        const ttl = info.supported ? VERSION_CACHE_TTL_MS : VERSION_FAILURE_CACHE_TTL_MS
        versionCache.set(key, { info, expiresAt: Date.now() + ttl })
      }
      return info
    })
    .finally(() => {
      versionProbes.delete(key)
    })
  versionProbes.set(key, probe)
  return probe
}

export async function requireSupportedBd(target: BeadsExecutionTarget): Promise<string> {
  const info = await getBdVersionInfo(target)
  if (info.hostOffline) {
    throw new BeadsError('host-offline', 'The remote host is not connected.')
  }
  if (!info.installed || info.version === null) {
    throw new BeadsError('bd-missing', 'bd is not installed on this host.')
  }
  if (!info.supported) {
    throw new BeadsError(
      'bd-outdated',
      `bd ${info.version} is too old; Orca needs bd ${BD_MIN_VERSION.join('.')} or newer.`
    )
  }
  return info.version
}

export function resetBdVersionCacheForTests(): void {
  versionCache.clear()
  versionProbes.clear()
}
```

Note on the test "throws typed errors": the `bd-missing` probe result (`spawnFailed`, not supported) is cached for 30 s, so the test resets the cache before the outdated case. That is intended.

- [ ] **Step 4: Implement context resolution**

`src/main/beads/beads-context.ts`:
```ts
import { readOptionalString } from '../../shared/beads/beads-json-value'
import { parseBdJsonRecord } from './bd-json'
import { BeadsError, classifyBdFailure } from './beads-error'
import { BD_READ_TIMEOUT_MS, beadsHostKey, runBd } from './beads-executor'
import type { BeadsExecutionTarget } from './beads-executor'

const CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000

export type BeadsRepoContext = {
  beadsDir: string
  projectId: string | null
  database: string | null
  isWorktree: boolean
}

type CachedContext = { context: BeadsRepoContext; expiresAt: number }

const contextCache = new Map<string, CachedContext>()

export function normalizeBeadsContext(raw: Record<string, unknown>): BeadsRepoContext | null {
  const beadsDir = readOptionalString(raw.beads_dir)
  if (!beadsDir) {
    return null
  }
  return {
    beadsDir,
    projectId: readOptionalString(raw.project_id) ?? null,
    database: readOptionalString(raw.database) ?? null,
    isWorktree: raw.is_worktree === true
  }
}

// Why: Orca worktrees share the main checkout's database. Keying queues and caches
// by beads_dir (not by worktree path) makes every worktree see the same data.
export async function resolveBeadsContext(target: BeadsExecutionTarget): Promise<BeadsRepoContext> {
  const key = `${beadsHostKey(target)}\n${target.repoPath}`
  const cached = contextCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.context
  }
  const result = await runBd(target, ['context', '--json'], BD_READ_TIMEOUT_MS)
  if (result.exitCode !== 0) {
    throw classifyBdFailure(result)
  }
  const context = normalizeBeadsContext(parseBdJsonRecord(result.stdout))
  if (!context) {
    throw new BeadsError(
      'not-initialized',
      'Beads is not initialized in this repository. Run `bd init`.'
    )
  }
  contextCache.set(key, { context, expiresAt: Date.now() + CONTEXT_CACHE_TTL_MS })
  return context
}

export function resetBeadsContextCacheForTests(): void {
  contextCache.clear()
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test src/main/beads/beads-version.test.ts src/main/beads/beads-context.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/beads/beads-version.ts src/main/beads/beads-context.ts src/main/beads/beads-version.test.ts src/main/beads/beads-context.test.ts
git commit -m "feat(beads): gate on bd 1.2.0 and resolve the repo's beads database

Version cache and probe dedupe ported from stablyai/orca#14013.

Co-authored-by: ajchemist <1694505+aJchemist@users.noreply.github.com>
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Argv builders (validation, reads, writes)

**Files:**
- Create: `src/main/beads/beads-arg-validation.ts`
- Create: `src/main/beads/beads-read-args.ts`
- Create: `src/main/beads/beads-write-args.ts`
- Test: `src/main/beads/beads-read-args.test.ts`, `src/main/beads/beads-write-args.test.ts`

**Interfaces:**
- Consumes: `BeadsListFilter`, `BeadsCreateInput`, `BeadsIssuePatch`, `BEADS_LIST_MAX_LIMIT` (Task 1); `isBeadsIssueId` (Task 1); `BeadsError` (Task 4).
- Produces:
  - validation: `requireIssueId(id: string): string`, `requireToken(value: string, field: string): string`, `requireSingleLine(value: string, field: string): string`, `requireText(value: string, field: string): string`, `requireLabel(label: string): string`, `requirePriority(priority: number): number`, `requireFetchLimit(limit: number): number`, `requirePageLimit(limit: number): number`
  - reads: `buildListArgs(filter, limit)`, `buildReadyArgs(filter, limit)`, `buildBlockedArgs(filter)`, `buildSearchArgs(text, filter, limit)`, `buildCountArgs(filter)`, `buildShowArgs(id)`, `VC_STATUS_ARGS`, `STATUSES_ARGS`, `TYPES_ARGS` — all return `string[]` / `readonly string[]`
  - writes: `buildCreateArgs(input, actor)`, `buildUpdateArgs(id, patch, actor)`, `buildClaimArgs(id, actor)`, `buildCloseArgs(id, reason, actor)`, `buildReopenArgs(id, reason, actor)`, `buildDeferArgs(id, until, actor)`, `buildUndeferArgs(id, actor)`, `buildDeleteArgs(id, actor)`, `buildCommentArgs(id, text, actor)` — `actor: string | null`, `reason`/`until` for reopen/defer are `string | null`

bd 1.2.2 flag facts these builders rely on (verified with `--help`):
- `list`: `--status` comma-separated (repeating overwrites), `--all`, `--parent`, `--no-assignee`, `--type`, `--label` (repeatable, AND), `--priority`, `--assignee`, `--limit`.
- `ready`: `--parent`, `--unassigned`, `--type`, `--label`, `--priority`, `--assignee`, `--limit`.
- `blocked`: only `--parent`.
- `search`: `--query`, `--status` (single value or `all`), `--no-assignee`, `--type`, `--label`, `--priority-min/--priority-max` (no `--priority`, no `--parent`), `--assignee`, `--limit`.
- `count`: `--status` (single), `--type`, `--label`, `--priority`, `--assignee`, `--no-assignee` (no `--parent`).
- `create`: `--title`, `--type`, `--priority`, `--parent`, `--assignee`, `--labels` (repeatable), `--description`, `--design`, `--acceptance`, `--notes`.
- `update`: `--title`, `--status`, `--priority`, `--type`, `--assignee`, `--parent`, `--add-label`, `--remove-label`, `--description` (+ `--allow-empty-description` to clear), `--design`, `--acceptance`, `--notes`, `--claim`.
- `close --reason`, `reopen --reason`, `defer --until`, `delete --force`; `comment <id> [--json --actor=…] -- <text>` (anything after `--`, including `--json`, becomes comment text).

- [ ] **Step 1: Write the failing tests**

`src/main/beads/beads-read-args.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  buildBlockedArgs,
  buildCountArgs,
  buildListArgs,
  buildReadyArgs,
  buildSearchArgs,
  buildShowArgs
} from './beads-read-args'

describe('read argv builders', () => {
  it('builds bd list with comma-joined statuses and filter flags', () => {
    expect(
      buildListArgs(
        {
          statuses: ['open', 'in_progress'],
          type: 'task',
          labels: ['ui', 'backend'],
          parent: 'baumoscan-cwf',
          priority: 1,
          assignee: 'Ada Lovelace',
          unassigned: false
        },
        201
      )
    ).toEqual([
      'list',
      '--json',
      '--limit=201',
      '--status=open,in_progress',
      '--parent=baumoscan-cwf',
      '--type=task',
      '--label=ui',
      '--label=backend',
      '--priority=1',
      '--assignee=Ada Lovelace'
    ])
  })

  it('uses --all only when closed issues are requested without explicit statuses', () => {
    expect(buildListArgs({ includeClosed: true }, 10)).toEqual([
      'list',
      '--json',
      '--limit=10',
      '--all'
    ])
    expect(buildListArgs({ includeClosed: true, statuses: ['closed'] }, 10)).toContain(
      '--status=closed'
    )
    expect(buildListArgs({ unassigned: true }, 10)).toContain('--no-assignee')
  })

  it('builds ready, blocked and show', () => {
    expect(buildReadyArgs({ parent: 'e-1', unassigned: true, type: 'bug' }, 51)).toEqual([
      'ready',
      '--json',
      '--limit=51',
      '--parent=e-1',
      '--unassigned',
      '--type=bug'
    ])
    expect(buildBlockedArgs({ parent: 'e-1' })).toEqual(['blocked', '--json', '--parent=e-1'])
    expect(buildShowArgs('baumoscan-cwf.3')).toEqual([
      'show',
      'baumoscan-cwf.3',
      '--json',
      '--include-dependents',
      '--include-comments'
    ])
  })

  it('builds search with --query and priority bounds', () => {
    expect(
      buildSearchArgs('-playtest', { priority: 2, includeClosed: true, unassigned: true }, 21)
    ).toEqual([
      'search',
      '--json',
      '--query=-playtest',
      '--limit=21',
      '--status=all',
      '--no-assignee',
      '--priority-min=2',
      '--priority-max=2'
    ])
  })

  it('builds count without parent support', () => {
    expect(buildCountArgs({ statuses: ['open'], labels: ['ui'] })).toEqual([
      'count',
      '--json',
      '--status=open',
      '--label=ui'
    ])
    expect(() => buildCountArgs({ parent: 'e-1' })).toThrow(/count cannot filter by parent/)
    expect(() => buildCountArgs({ statuses: ['open', 'closed'] })).toThrow(/one status/)
  })

  it('rejects hostile or malformed input before anything runs', () => {
    expect(() => buildShowArgs('--help')).toThrow(/Invalid beads issue id/)
    expect(() => buildListArgs({ statuses: ['open;rm'] }, 10)).toThrow(/status/)
    expect(() => buildListArgs({ labels: ['a,b'] }, 10)).toThrow(/label/)
    expect(() => buildListArgs({ priority: 7 }, 10)).toThrow(/Priority/)
    expect(() => buildListArgs({}, 0)).toThrow(/limit/)
    expect(() => buildListArgs({ assignee: 'a\nb' }, 10)).toThrow(/assignee/)
    expect(() => buildSearchArgs('  ', {}, 10)).toThrow(/search text/)
    expect(() => buildSearchArgs('x', { parent: 'e-1' }, 10)).toThrow(/search cannot filter by parent/)
  })
})
```

`src/main/beads/beads-write-args.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  buildClaimArgs,
  buildCloseArgs,
  buildCommentArgs,
  buildCreateArgs,
  buildDeferArgs,
  buildDeleteArgs,
  buildReopenArgs,
  buildUndeferArgs,
  buildUpdateArgs
} from './beads-write-args'

describe('write argv builders', () => {
  it('builds create with every field as --flag=value, so a leading dash stays text', () => {
    expect(
      buildCreateArgs(
        {
          title: '-dash title',
          issueType: 'task',
          priority: 1,
          parent: 'probe-3os',
          assignee: 'ada',
          labels: ['ui', 'backend'],
          description: 'line one\nline two',
          design: 'd',
          acceptanceCriteria: 'acc',
          notes: 'n'
        },
        'orca-user'
      )
    ).toEqual([
      'create',
      '--json',
      '--title=-dash title',
      '--type=task',
      '--priority=1',
      '--parent=probe-3os',
      '--assignee=ada',
      '--labels=ui',
      '--labels=backend',
      '--description=line one\nline two',
      '--design=d',
      '--acceptance=acc',
      '--notes=n',
      '--actor=orca-user'
    ])
  })

  it('builds update only with provided fields and clears a description explicitly', () => {
    expect(
      buildUpdateArgs(
        'probe-3os.1',
        { title: 'Renamed', priority: 0, addLabels: ['backend'], removeLabels: ['ui'], description: '' },
        null
      )
    ).toEqual([
      'update',
      'probe-3os.1',
      '--json',
      '--title=Renamed',
      '--priority=0',
      '--add-label=backend',
      '--remove-label=ui',
      '--description=',
      '--allow-empty-description'
    ])
    expect(buildUpdateArgs('p-1', { assignee: '' }, null)).toEqual([
      'update',
      'p-1',
      '--json',
      '--assignee='
    ])
    expect(() => buildUpdateArgs('p-1', {}, null)).toThrow(/Nothing to update/)
  })

  it('builds claim, close, reopen, defer, undefer and delete', () => {
    expect(buildClaimArgs('p-1', 'me')).toEqual(['update', 'p-1', '--json', '--claim', '--actor=me'])
    expect(buildCloseArgs('p-1', 'done it', null)).toEqual([
      'close',
      'p-1',
      '--json',
      '--reason=done it'
    ])
    expect(() => buildCloseArgs('p-1', '  ', null)).toThrow(/reason/)
    expect(buildReopenArgs('p-1', null, null)).toEqual(['reopen', 'p-1', '--json'])
    expect(buildReopenArgs('p-1', 'again', null)).toEqual(['reopen', 'p-1', '--json', '--reason=again'])
    expect(buildDeferArgs('p-1', 'tomorrow', null)).toEqual(['defer', 'p-1', '--json', '--until=tomorrow'])
    expect(buildUndeferArgs('p-1', null)).toEqual(['undefer', 'p-1', '--json'])
    expect(buildDeleteArgs('p-1', null)).toEqual(['delete', 'p-1', '--json', '--force'])
  })

  it('puts comment text after -- with all flags before it', () => {
    expect(buildCommentArgs('p-1', '  -hello --json \n', 'me')).toEqual([
      'comment',
      'p-1',
      '--json',
      '--actor=me',
      '--',
      '-hello --json'
    ])
    expect(() => buildCommentArgs('p-1', '   ', null)).toThrow(/comment/)
  })

  it('rejects hostile ids, multi-line titles and actors', () => {
    expect(() => buildClaimArgs('-rf', null)).toThrow(/Invalid beads issue id/)
    expect(() => buildCreateArgs({ title: 'a\nb' }, null)).toThrow(/title/)
    expect(() => buildCreateArgs({ title: 'a' }, 'x\ny')).toThrow(/actor/)
    expect(() => buildUpdateArgs('p-1', { status: 'open,closed' }, null)).toThrow(/status/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test src/main/beads/beads-read-args.test.ts src/main/beads/beads-write-args.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement validation**

`src/main/beads/beads-arg-validation.ts`:
```ts
import { BEADS_LIST_MAX_LIMIT } from '../../shared/beads/beads-contract'
import { isBeadsIssueId } from '../../shared/beads/beads-issue-id'
import { BeadsError } from './beads-error'

// Why: statuses, types and similar values become flag values that bd splits on
// commas or matches exactly; restricting them to word characters keeps one value
// from turning into several.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

function invalidInput(message: string): BeadsError {
  return new BeadsError('invalid-input', message)
}

export function requireIssueId(id: string): string {
  if (!isBeadsIssueId(id)) {
    throw invalidInput(`Invalid beads issue id: ${JSON.stringify(id)}`)
  }
  return id
}

export function requireToken(value: string, field: string): string {
  if (!TOKEN_PATTERN.test(value)) {
    throw invalidInput(`Invalid ${field}: ${JSON.stringify(value)}`)
  }
  return value
}

export function requireSingleLine(value: string, field: string): string {
  if (value.trim() === '' || /[\r\n]/.test(value)) {
    throw invalidInput(`The ${field} must be a single non-empty line.`)
  }
  return value
}

export function requireText(value: string, field: string): string {
  const trimmed = value.trim()
  if (trimmed === '') {
    throw invalidInput(`The ${field} must not be empty.`)
  }
  return trimmed
}

export function requireLabel(label: string): string {
  if (label.trim() === '' || /[,\r\n]/.test(label)) {
    throw invalidInput(`Invalid label: ${JSON.stringify(label)}`)
  }
  return label
}

export function requirePriority(priority: number): number {
  if (!Number.isInteger(priority) || priority < 0 || priority > 4) {
    throw invalidInput('Priority must be an integer from 0 to 4.')
  }
  return priority
}

/** Limit passed to bd: one above the page limit so callers can detect "more". */
export function requireFetchLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > BEADS_LIST_MAX_LIMIT + 1) {
    throw invalidInput(`Invalid list limit: ${limit}`)
  }
  return limit
}

export function requirePageLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > BEADS_LIST_MAX_LIMIT) {
    throw invalidInput(`Invalid list limit: ${limit}`)
  }
  return limit
}
```

- [ ] **Step 4: Implement read builders**

`src/main/beads/beads-read-args.ts`:
```ts
import type { BeadsListFilter } from '../../shared/beads/beads-contract'
import { BeadsError } from './beads-error'
import {
  requireFetchLimit,
  requireIssueId,
  requireLabel,
  requirePriority,
  requireSingleLine,
  requireToken
} from './beads-arg-validation'

export const VC_STATUS_ARGS: readonly string[] = ['vc', 'status', '--json']
export const STATUSES_ARGS: readonly string[] = ['statuses', '--json']
export const TYPES_ARGS: readonly string[] = ['types', '--json']

function typeAndLabelFlags(filter: BeadsListFilter): string[] {
  const flags: string[] = []
  if (filter.type) {
    flags.push(`--type=${requireToken(filter.type, 'type')}`)
  }
  for (const label of filter.labels ?? []) {
    flags.push(`--label=${requireLabel(label)}`)
  }
  return flags
}

function assigneeFlags(filter: BeadsListFilter): string[] {
  return filter.assignee ? [`--assignee=${requireSingleLine(filter.assignee, 'assignee')}`] : []
}

function statusTokens(filter: BeadsListFilter): string[] {
  return (filter.statuses ?? []).map((status) => requireToken(status, 'status'))
}

function singleStatus(filter: BeadsListFilter, command: string): string | null {
  const statuses = statusTokens(filter)
  if (statuses.length > 1) {
    throw new BeadsError('invalid-input', `bd ${command} accepts only one status filter.`)
  }
  return statuses[0] ?? null
}

function rejectParent(filter: BeadsListFilter, command: string): void {
  if (filter.parent) {
    throw new BeadsError('invalid-input', `bd ${command} cannot filter by parent.`)
  }
}

export function buildListArgs(filter: BeadsListFilter, limit: number): string[] {
  const args = ['list', '--json', `--limit=${requireFetchLimit(limit)}`]
  const statuses = statusTokens(filter)
  if (statuses.length > 0) {
    args.push(`--status=${statuses.join(',')}`)
  } else if (filter.includeClosed) {
    args.push('--all')
  }
  if (filter.parent) {
    args.push(`--parent=${requireIssueId(filter.parent)}`)
  }
  if (filter.unassigned) {
    args.push('--no-assignee')
  }
  args.push(...typeAndLabelFlags(filter))
  if (filter.priority !== undefined) {
    args.push(`--priority=${requirePriority(filter.priority)}`)
  }
  args.push(...assigneeFlags(filter))
  return args
}

export function buildReadyArgs(filter: BeadsListFilter, limit: number): string[] {
  const args = ['ready', '--json', `--limit=${requireFetchLimit(limit)}`]
  if (filter.parent) {
    args.push(`--parent=${requireIssueId(filter.parent)}`)
  }
  if (filter.unassigned) {
    args.push('--unassigned')
  }
  args.push(...typeAndLabelFlags(filter))
  if (filter.priority !== undefined) {
    args.push(`--priority=${requirePriority(filter.priority)}`)
  }
  args.push(...assigneeFlags(filter))
  return args
}

export function buildBlockedArgs(filter: BeadsListFilter): string[] {
  const args = ['blocked', '--json']
  if (filter.parent) {
    args.push(`--parent=${requireIssueId(filter.parent)}`)
  }
  return args
}

export function buildSearchArgs(text: string, filter: BeadsListFilter, limit: number): string[] {
  rejectParent(filter, 'search')
  const query = requireSingleLine(text, 'search text')
  const args = ['search', '--json', `--query=${query}`, `--limit=${requireFetchLimit(limit)}`]
  const status = singleStatus(filter, 'search')
  if (status) {
    args.push(`--status=${status}`)
  } else if (filter.includeClosed) {
    args.push('--status=all')
  }
  if (filter.unassigned) {
    args.push('--no-assignee')
  }
  args.push(...typeAndLabelFlags(filter))
  if (filter.priority !== undefined) {
    const priority = requirePriority(filter.priority)
    args.push(`--priority-min=${priority}`, `--priority-max=${priority}`)
  }
  args.push(...assigneeFlags(filter))
  return args
}

export function buildCountArgs(filter: BeadsListFilter): string[] {
  rejectParent(filter, 'count')
  const args = ['count', '--json']
  const status = singleStatus(filter, 'count')
  if (status) {
    args.push(`--status=${status}`)
  }
  if (filter.unassigned) {
    args.push('--no-assignee')
  }
  args.push(...typeAndLabelFlags(filter))
  if (filter.priority !== undefined) {
    args.push(`--priority=${requirePriority(filter.priority)}`)
  }
  args.push(...assigneeFlags(filter))
  return args
}

export function buildShowArgs(id: string): string[] {
  return ['show', requireIssueId(id), '--json', '--include-dependents', '--include-comments']
}
```

Check the count test expectation against this order: `['count','--json','--status=open','--label=ui']` — no `unassigned`, no type, labels, no priority, no assignee. Matches.

- [ ] **Step 5: Implement write builders**

`src/main/beads/beads-write-args.ts`:
```ts
import type { BeadsCreateInput, BeadsIssuePatch } from '../../shared/beads/beads-contract'
import { BeadsError } from './beads-error'
import {
  requireIssueId,
  requireLabel,
  requirePriority,
  requireSingleLine,
  requireText,
  requireToken
} from './beads-arg-validation'

type TextFields = Pick<BeadsIssuePatch, 'description' | 'design' | 'acceptanceCriteria' | 'notes'>

function actorFlags(actor: string | null): string[] {
  return actor === null ? [] : [`--actor=${requireSingleLine(actor, 'actor')}`]
}

function noNewline(value: string, field: string): string {
  if (/[\r\n]/.test(value)) {
    throw new BeadsError('invalid-input', `The ${field} must not contain line breaks.`)
  }
  return value
}

// Why: every value uses --flag=value, so text that starts with '-' can never be
// read as another flag. Multi-line markdown is fine inside a single argv entry.
function textFlags(fields: TextFields): string[] {
  const flags: string[] = []
  if (fields.description !== undefined) {
    flags.push(`--description=${fields.description}`)
    if (fields.description === '') {
      flags.push('--allow-empty-description')
    }
  }
  if (fields.design !== undefined) {
    flags.push(`--design=${fields.design}`)
  }
  if (fields.acceptanceCriteria !== undefined) {
    flags.push(`--acceptance=${fields.acceptanceCriteria}`)
  }
  if (fields.notes !== undefined) {
    flags.push(`--notes=${fields.notes}`)
  }
  return flags
}

export function buildCreateArgs(input: BeadsCreateInput, actor: string | null): string[] {
  const args = ['create', '--json', `--title=${requireSingleLine(input.title, 'title')}`]
  if (input.issueType) {
    args.push(`--type=${requireToken(input.issueType, 'type')}`)
  }
  if (input.priority !== undefined) {
    args.push(`--priority=${requirePriority(input.priority)}`)
  }
  if (input.parent) {
    args.push(`--parent=${requireIssueId(input.parent)}`)
  }
  if (input.assignee) {
    args.push(`--assignee=${requireSingleLine(input.assignee, 'assignee')}`)
  }
  for (const label of input.labels ?? []) {
    args.push(`--labels=${requireLabel(label)}`)
  }
  args.push(...textFlags(input), ...actorFlags(actor))
  return args
}

export function buildUpdateArgs(id: string, patch: BeadsIssuePatch, actor: string | null): string[] {
  const args = ['update', requireIssueId(id), '--json']
  if (patch.title !== undefined) {
    args.push(`--title=${requireSingleLine(patch.title, 'title')}`)
  }
  if (patch.status !== undefined) {
    args.push(`--status=${requireToken(patch.status, 'status')}`)
  }
  if (patch.priority !== undefined) {
    args.push(`--priority=${requirePriority(patch.priority)}`)
  }
  if (patch.issueType !== undefined) {
    args.push(`--type=${requireToken(patch.issueType, 'type')}`)
  }
  if (patch.assignee !== undefined) {
    // Why: an empty assignee is how the UI unassigns.
    args.push(`--assignee=${noNewline(patch.assignee, 'assignee')}`)
  }
  if (patch.parent !== undefined) {
    args.push(`--parent=${requireIssueId(patch.parent)}`)
  }
  for (const label of patch.addLabels ?? []) {
    args.push(`--add-label=${requireLabel(label)}`)
  }
  for (const label of patch.removeLabels ?? []) {
    args.push(`--remove-label=${requireLabel(label)}`)
  }
  args.push(...textFlags(patch))
  if (args.length === 3) {
    throw new BeadsError('invalid-input', 'Nothing to update.')
  }
  args.push(...actorFlags(actor))
  return args
}

export function buildClaimArgs(id: string, actor: string | null): string[] {
  return ['update', requireIssueId(id), '--json', '--claim', ...actorFlags(actor)]
}

export function buildCloseArgs(id: string, reason: string, actor: string | null): string[] {
  return [
    'close',
    requireIssueId(id),
    '--json',
    `--reason=${requireText(reason, 'close reason')}`,
    ...actorFlags(actor)
  ]
}

export function buildReopenArgs(id: string, reason: string | null, actor: string | null): string[] {
  const args = ['reopen', requireIssueId(id), '--json']
  if (reason !== null && reason.trim() !== '') {
    args.push(`--reason=${reason.trim()}`)
  }
  args.push(...actorFlags(actor))
  return args
}

export function buildDeferArgs(id: string, until: string | null, actor: string | null): string[] {
  const args = ['defer', requireIssueId(id), '--json']
  if (until !== null) {
    args.push(`--until=${requireSingleLine(until, 'defer date')}`)
  }
  args.push(...actorFlags(actor))
  return args
}

export function buildUndeferArgs(id: string, actor: string | null): string[] {
  return ['undefer', requireIssueId(id), '--json', ...actorFlags(actor)]
}

export function buildDeleteArgs(id: string, actor: string | null): string[] {
  return ['delete', requireIssueId(id), '--json', '--force', ...actorFlags(actor)]
}

export function buildCommentArgs(id: string, text: string, actor: string | null): string[] {
  // Why: bd takes the comment body positionally; `--` ends flag parsing, so every
  // flag (including --json) must come before it or it becomes part of the text.
  return ['comment', requireIssueId(id), '--json', ...actorFlags(actor), '--', requireText(text, 'comment')]
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test src/main/beads/beads-read-args.test.ts src/main/beads/beads-write-args.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/beads/beads-arg-validation.ts src/main/beads/beads-read-args.ts src/main/beads/beads-write-args.ts src/main/beads/beads-read-args.test.ts src/main/beads/beads-write-args.test.ts
git commit -m "feat(beads): add the allowlisted bd argv builders

Every operation Orca can run is a typed builder; ids are validated, values
use --flag=value, and comment text follows '--' after all flags.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Invocation and read service

**Files:**
- Create: `src/main/beads/beads-invocation.ts`
- Create: `src/main/beads/beads-read-service.ts`
- Create (test support): `src/main/beads/beads-fake-bd.test-support.ts`
- Test: `src/main/beads/beads-read-service.test.ts`

**Interfaces:**
- Consumes: Tasks 1–7 (`runBd`, `beadsHostKey`, timeouts, `classifyBdFailure`, `BeadsError`, `requireSupportedBd`, `getBdVersionInfo`, `resolveBeadsContext`, `BeadsDbQueue`, parsers, normalizers, schema functions, read builders, `requirePageLimit`).
- Produces:
  - `invokeBd(target: BeadsExecutionTarget, args: readonly string[], mode: 'read' | 'write'): Promise<string>`
  - `resolveBeadsScope(target: BeadsExecutionTarget): Promise<string>` (host key + beads dir)
  - `getBeadsWorkspaceStatus(target): Promise<BeadsWorkspaceStatus>`
  - `getBeadsChangeToken(target): Promise<string>`
  - `getBeadsSchema(target): Promise<BeadsSchema>`
  - `listBeadsIssues(target, request: BeadsListRequest): Promise<BeadsIssuePage>`
  - `countBeadsIssues(target, filter: BeadsListFilter): Promise<number>`
  - `getBeadsIssueDetails(target, id: string): Promise<BeadsIssueDetails>`
  - `resetBeadsReadCachesForTests(): void`
  - test support: `installFakeBd(runBdMock, replies)`, `bdReply(stdout, overrides?)`, `BASE_FAKE_BD_REPLIES`

- [ ] **Step 1: Add the fake bd test support**

The file name ends in `.test-support.ts`, so Vitest (which collects `*.test.ts`) does not run it as a test. It contains no `vi.mock`; callers do the mocking.

`src/main/beads/beads-fake-bd.test-support.ts`:
```ts
import type { Mock } from 'vitest'
import type { BdExecResult } from './beads-executor'

export type FakeBdReply = Partial<BdExecResult>

export function bdReply(stdout: string, overrides: FakeBdReply = {}): BdExecResult {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    spawnFailed: false,
    hostOffline: false,
    timedOut: false,
    ...overrides
  }
}

export const BASE_FAKE_BD_REPLIES: Record<string, BdExecResult> = {
  version: bdReply('bd version 1.2.2 (Homebrew)\n'),
  context: bdReply(
    JSON.stringify({ beads_dir: '/repo/.beads', project_id: 'p-1', database: 'repo', is_worktree: false })
  ),
  'vc status': bdReply(JSON.stringify({ branch: 'main', commit: 'hash-1', schema_version: 1 }))
}

/**
 * Answers runBd calls by the longest matching argv prefix among the reply keys
 * ("vc status" beats "vc"). Unknown commands fail the test loudly.
 */
export function installFakeBd(runBdMock: Mock, replies: Record<string, BdExecResult>): void {
  const table = { ...BASE_FAKE_BD_REPLIES, ...replies }
  runBdMock.mockImplementation(async (_target: unknown, args: readonly string[]) => {
    for (let length = args.length; length > 0; length -= 1) {
      const reply = table[args.slice(0, length).join(' ')]
      if (reply) {
        return reply
      }
    }
    throw new Error(`unexpected bd call: ${args.join(' ')}`)
  })
}
```

- [ ] **Step 2: Write the failing test**

`src/main/beads/beads-read-service.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runBdMock } = vi.hoisted(() => ({ runBdMock: vi.fn() }))

vi.mock('./beads-executor', () => ({
  BD_READ_TIMEOUT_MS: 15_000,
  BD_WRITE_TIMEOUT_MS: 30_000,
  beadsHostKey: () => 'local',
  runBd: runBdMock
}))

import { bdReply, installFakeBd } from './beads-fake-bd.test-support'
import { resetBeadsContextCacheForTests } from './beads-context'
import { resetBdVersionCacheForTests } from './beads-version'
import {
  countBeadsIssues,
  getBeadsChangeToken,
  getBeadsIssueDetails,
  getBeadsSchema,
  getBeadsWorkspaceStatus,
  listBeadsIssues,
  resetBeadsReadCachesForTests
} from './beads-read-service'

const TARGET = { repoPath: '/repo', connectionId: null }

function row(id: string) {
  return { id, title: `Title ${id}`, status: 'open', priority: 2, issue_type: 'task' }
}

beforeEach(() => {
  runBdMock.mockReset()
  resetBdVersionCacheForTests()
  resetBeadsContextCacheForTests()
  resetBeadsReadCachesForTests()
})

describe('getBeadsWorkspaceStatus', () => {
  it('reports an initialized workspace with its beads dir', async () => {
    installFakeBd(runBdMock, {})
    await expect(getBeadsWorkspaceStatus(TARGET)).resolves.toEqual({
      bdInstalled: true,
      bdVersion: '1.2.2',
      versionSupported: true,
      initialized: true,
      beadsDir: '/repo/.beads',
      isWorktree: false
    })
  })

  it('reports an uninitialized repo without throwing', async () => {
    installFakeBd(runBdMock, {
      context: bdReply('{"error":"cannot resolve repo context: no .beads directory found"}', {
        exitCode: 1
      })
    })
    await expect(getBeadsWorkspaceStatus(TARGET)).resolves.toMatchObject({
      initialized: false,
      beadsDir: null
    })
  })

  it('reports missing and outdated bd without throwing', async () => {
    installFakeBd(runBdMock, { version: bdReply('', { spawnFailed: true, exitCode: null }) })
    await expect(getBeadsWorkspaceStatus(TARGET)).resolves.toMatchObject({
      bdInstalled: false,
      initialized: false
    })
    resetBdVersionCacheForTests()
    installFakeBd(runBdMock, { version: bdReply('bd version 1.1.2') })
    await expect(getBeadsWorkspaceStatus(TARGET)).resolves.toMatchObject({
      bdInstalled: true,
      versionSupported: false
    })
  })

  it('throws for an offline host', async () => {
    installFakeBd(runBdMock, { version: bdReply('', { hostOffline: true, exitCode: null }) })
    await expect(getBeadsWorkspaceStatus(TARGET)).rejects.toMatchObject({ kind: 'host-offline' })
  })
})

describe('getBeadsSchema and getBeadsChangeToken', () => {
  it('loads the schema once per change token', async () => {
    installFakeBd(runBdMock, {
      statuses: bdReply(
        JSON.stringify({ built_in_statuses: [{ name: 'open', category: 'active' }] })
      ),
      types: bdReply(JSON.stringify({ core_types: [{ name: 'task', description: 'Work' }] }))
    })
    await expect(getBeadsChangeToken(TARGET)).resolves.toBe('hash-1')
    const schema = await getBeadsSchema(TARGET)
    await getBeadsSchema(TARGET)
    expect(schema.statuses.map((status) => status.name)).toEqual(['open'])
    const statusCalls = runBdMock.mock.calls.filter((call) => call[1][0] === 'statuses')
    expect(statusCalls).toHaveLength(1)
  })

  it('falls back to built-in statuses when bd returns none', async () => {
    installFakeBd(runBdMock, {
      statuses: bdReply('{"built_in_statuses":[]}'),
      types: bdReply('{"core_types":[]}')
    })
    const schema = await getBeadsSchema(TARGET)
    expect(schema.statuses.some((status) => status.name === 'closed')).toBe(true)
  })
})

describe('listBeadsIssues', () => {
  it('requests one extra row and reports hasMore', async () => {
    installFakeBd(runBdMock, {
      ready: bdReply(JSON.stringify([row('a-1'), row('a-2'), row('a-3')]))
    })
    const page = await listBeadsIssues(TARGET, { view: 'ready', filter: {}, limit: 2 })
    expect(page.hasMore).toBe(true)
    expect(page.issues.map((issue) => issue.id)).toEqual(['a-1', 'a-2'])
    expect(runBdMock).toHaveBeenCalledWith(TARGET, ['ready', '--json', '--limit=3'], 15_000)
  })

  it('slices blocked results locally because bd blocked has no limit', async () => {
    installFakeBd(runBdMock, { blocked: bdReply(JSON.stringify([row('b-1'), row('b-2')])) })
    const page = await listBeadsIssues(TARGET, { view: 'blocked', filter: {}, limit: 1 })
    expect(page).toMatchObject({ hasMore: true })
    expect(page.issues).toHaveLength(1)
  })

  it('rejects invalid requests before running bd', async () => {
    installFakeBd(runBdMock, {})
    await expect(
      listBeadsIssues(TARGET, { view: 'list', filter: {}, limit: 5000 })
    ).rejects.toMatchObject({ kind: 'invalid-input' })
    expect(runBdMock).not.toHaveBeenCalled()
  })
})

describe('countBeadsIssues and getBeadsIssueDetails', () => {
  it('reads bd count', async () => {
    installFakeBd(runBdMock, { count: bdReply('{"count":24,"schema_version":1}') })
    await expect(countBeadsIssues(TARGET, { statuses: ['open'] })).resolves.toBe(24)
  })

  it('returns details and classifies ambiguous ids', async () => {
    installFakeBd(runBdMock, {
      'show a-1': bdReply(JSON.stringify([{ ...row('a-1'), comments: [] }])),
      'show a': bdReply('{"error":"no issues found matching the provided IDs"}', {
        exitCode: 1,
        stderr: 'Error fetching a: ambiguous ID "a" matches 2 issues'
      })
    })
    await expect(getBeadsIssueDetails(TARGET, 'a-1')).resolves.toMatchObject({
      issue: { id: 'a-1' }
    })
    await expect(getBeadsIssueDetails(TARGET, 'a')).rejects.toMatchObject({ kind: 'ambiguous-id' })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/main/beads/beads-read-service.test.ts`
Expected: FAIL — `./beads-read-service` not found.

- [ ] **Step 4: Implement invocation**

`src/main/beads/beads-invocation.ts`:
```ts
import { classifyBdFailure } from './beads-error'
import { resolveBeadsContext } from './beads-context'
import { BeadsDbQueue } from './beads-db-queue'
import { BD_READ_TIMEOUT_MS, BD_WRITE_TIMEOUT_MS, beadsHostKey, runBd } from './beads-executor'
import type { BeadsExecutionTarget } from './beads-executor'
import { requireSupportedBd } from './beads-version'

const queue = new BeadsDbQueue()

export async function resolveBeadsScope(target: BeadsExecutionTarget): Promise<string> {
  const context = await resolveBeadsContext(target)
  return `${beadsHostKey(target)}\n${context.beadsDir}`
}

export async function invokeBd(
  target: BeadsExecutionTarget,
  args: readonly string[],
  mode: 'read' | 'write'
): Promise<string> {
  await requireSupportedBd(target)
  const scope = await resolveBeadsScope(target)
  const timeoutMs = mode === 'read' ? BD_READ_TIMEOUT_MS : BD_WRITE_TIMEOUT_MS
  const execute = async (): Promise<string> => {
    const result = await runBd(target, args, timeoutMs)
    if (result.exitCode !== 0) {
      throw classifyBdFailure(result)
    }
    return result.stdout
  }
  // Why: identical reads from several panes share one bd process; writes never coalesce.
  return mode === 'read'
    ? queue.runShared(scope, args.join(' '), execute)
    : queue.run(scope, execute)
}
```

- [ ] **Step 5: Implement the read service**

`src/main/beads/beads-read-service.ts`:
```ts
import type {
  BeadsIssuePage,
  BeadsListFilter,
  BeadsListRequest
} from '../../shared/beads/beads-contract'
import { normalizeBeadsIssue, normalizeBeadsIssueDetails } from '../../shared/beads/beads-issue-normalize'
import type {
  BeadsIssue,
  BeadsIssueDetails,
  BeadsSchema,
  BeadsWorkspaceStatus
} from '../../shared/beads/beads-issue-types'
import { readFiniteNumber, readOptionalString } from '../../shared/beads/beads-json-value'
import {
  FALLBACK_BEADS_SCHEMA,
  normalizeBeadsStatuses,
  normalizeBeadsTypes
} from '../../shared/beads/beads-schema'
import { parseBdJson, parseBdJsonList, parseBdJsonRecord } from './bd-json'
import { requirePageLimit } from './beads-arg-validation'
import { resolveBeadsContext } from './beads-context'
import { BeadsError } from './beads-error'
import type { BeadsExecutionTarget } from './beads-executor'
import { invokeBd, resolveBeadsScope } from './beads-invocation'
import {
  STATUSES_ARGS,
  TYPES_ARGS,
  VC_STATUS_ARGS,
  buildBlockedArgs,
  buildCountArgs,
  buildListArgs,
  buildReadyArgs,
  buildSearchArgs,
  buildShowArgs
} from './beads-read-args'
import { getBdVersionInfo } from './beads-version'

type CachedSchema = { token: string; schema: BeadsSchema }

const schemaCache = new Map<string, CachedSchema>()

export async function getBeadsWorkspaceStatus(
  target: BeadsExecutionTarget
): Promise<BeadsWorkspaceStatus> {
  const info = await getBdVersionInfo(target)
  if (info.hostOffline) {
    throw new BeadsError('host-offline', 'The remote host is not connected.')
  }
  const status: BeadsWorkspaceStatus = {
    bdInstalled: info.installed,
    bdVersion: info.version,
    versionSupported: info.supported,
    initialized: false,
    beadsDir: null,
    isWorktree: false
  }
  if (!info.supported) {
    return status
  }
  try {
    const context = await resolveBeadsContext(target)
    return { ...status, initialized: true, beadsDir: context.beadsDir, isWorktree: context.isWorktree }
  } catch (error) {
    if (error instanceof BeadsError && error.kind === 'not-initialized') {
      return status
    }
    throw error
  }
}

export async function getBeadsChangeToken(target: BeadsExecutionTarget): Promise<string> {
  const record = parseBdJsonRecord(await invokeBd(target, VC_STATUS_ARGS, 'read'))
  const commit = readOptionalString(record.commit)
  if (!commit) {
    throw new BeadsError('failed', 'bd vc status did not report a commit.')
  }
  return commit
}

export async function getBeadsSchema(target: BeadsExecutionTarget): Promise<BeadsSchema> {
  const scope = await resolveBeadsScope(target)
  const token = await getBeadsChangeToken(target)
  const cached = schemaCache.get(scope)
  if (cached && cached.token === token) {
    return cached.schema
  }
  const [statusesOutput, typesOutput] = await Promise.all([
    invokeBd(target, STATUSES_ARGS, 'read'),
    invokeBd(target, TYPES_ARGS, 'read')
  ])
  const statuses = normalizeBeadsStatuses(parseBdJson(statusesOutput))
  const types = normalizeBeadsTypes(parseBdJson(typesOutput))
  const schema: BeadsSchema = {
    statuses: statuses.length > 0 ? statuses : FALLBACK_BEADS_SCHEMA.statuses,
    types: types.length > 0 ? types : FALLBACK_BEADS_SCHEMA.types
  }
  schemaCache.set(scope, { token, schema })
  return schema
}

function argsForListRequest(request: BeadsListRequest, fetchLimit: number): string[] {
  switch (request.view) {
    case 'list':
      return buildListArgs(request.filter, fetchLimit)
    case 'ready':
      return buildReadyArgs(request.filter, fetchLimit)
    case 'blocked':
      return buildBlockedArgs(request.filter)
    case 'search':
      return buildSearchArgs(request.text ?? '', request.filter, fetchLimit)
  }
}

function normalizeIssues(rows: unknown[]): BeadsIssue[] {
  const issues: BeadsIssue[] = []
  for (const row of rows) {
    const issue = normalizeBeadsIssue(row)
    if (issue) {
      issues.push(issue)
    }
  }
  return issues
}

export async function listBeadsIssues(
  target: BeadsExecutionTarget,
  request: BeadsListRequest
): Promise<BeadsIssuePage> {
  const limit = requirePageLimit(request.limit)
  // Why: one extra row tells the UI to offer "Load more" instead of silently truncating.
  const args = argsForListRequest(request, limit + 1)
  const issues = normalizeIssues(parseBdJsonList(await invokeBd(target, args, 'read')))
  return { issues: issues.slice(0, limit), hasMore: issues.length > limit }
}

export async function countBeadsIssues(
  target: BeadsExecutionTarget,
  filter: BeadsListFilter
): Promise<number> {
  const record = parseBdJsonRecord(await invokeBd(target, buildCountArgs(filter), 'read'))
  const count = readFiniteNumber(record.count)
  if (count === undefined) {
    throw new BeadsError('failed', 'bd count did not report a count.')
  }
  return count
}

export async function getBeadsIssueDetails(
  target: BeadsExecutionTarget,
  id: string
): Promise<BeadsIssueDetails> {
  const rows = parseBdJsonList(await invokeBd(target, buildShowArgs(id), 'read'))
  const details = normalizeBeadsIssueDetails(rows[0])
  if (!details) {
    throw new BeadsError('not-found', `Issue ${id} was not found.`)
  }
  return details
}

export function resetBeadsReadCachesForTests(): void {
  schemaCache.clear()
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test src/main/beads/beads-read-service.test.ts`
Expected: PASS. If `beads-read-service.ts` exceeds 300 lines after `pnpm format`, move `argsForListRequest` and `normalizeIssues` into `src/main/beads/beads-list-plan.ts` (export both) and import them.

- [ ] **Step 7: Commit**

```bash
git add src/main/beads/beads-invocation.ts src/main/beads/beads-read-service.ts src/main/beads/beads-fake-bd.test-support.ts src/main/beads/beads-read-service.test.ts
git commit -m "feat(beads): add the beads read service

Workspace status, schema cached per change token, paged list/ready/blocked/
search with hasMore, count and issue details, all through the per-database
queue.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Write service

**Files:**
- Create: `src/main/beads/beads-write-service.ts`
- Test: `src/main/beads/beads-write-service.test.ts`

**Interfaces:**
- Consumes: `invokeBd` (Task 8), `getBeadsIssueDetails` (Task 8), write builders (Task 7), `parseBdJsonRecord` (Task 4), `BeadsError` (Task 4), `readOptionalString` (Task 1).
- Produces (all `actor: string | null`):
  - `createBeadsIssue(target, input: BeadsCreateInput, actor): Promise<BeadsIssueDetails>`
  - `updateBeadsIssue(target, id, patch: BeadsIssuePatch, actor): Promise<BeadsIssueDetails>`
  - `claimBeadsIssue(target, id, actor): Promise<BeadsIssueDetails>`
  - `closeBeadsIssue(target, id, reason: string, actor): Promise<BeadsIssueDetails>`
  - `reopenBeadsIssue(target, id, reason: string | null, actor): Promise<BeadsIssueDetails>`
  - `deferBeadsIssue(target, id, until: string | null, actor): Promise<BeadsIssueDetails>`
  - `undeferBeadsIssue(target, id, actor): Promise<BeadsIssueDetails>`
  - `deleteBeadsIssue(target, id, actor): Promise<BeadsDeleteOutcome>`
  - `addBeadsComment(target, id, text: string, actor): Promise<BeadsIssueDetails>`

- [ ] **Step 1: Write the failing test**

`src/main/beads/beads-write-service.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runBdMock } = vi.hoisted(() => ({ runBdMock: vi.fn() }))

vi.mock('./beads-executor', () => ({
  BD_READ_TIMEOUT_MS: 15_000,
  BD_WRITE_TIMEOUT_MS: 30_000,
  beadsHostKey: () => 'local',
  runBd: runBdMock
}))

import { bdReply, installFakeBd } from './beads-fake-bd.test-support'
import { resetBeadsContextCacheForTests } from './beads-context'
import { resetBdVersionCacheForTests } from './beads-version'
import {
  addBeadsComment,
  claimBeadsIssue,
  closeBeadsIssue,
  createBeadsIssue,
  deleteBeadsIssue,
  updateBeadsIssue
} from './beads-write-service'

const TARGET = { repoPath: '/repo', connectionId: null }

function showReply(id: string, status: string) {
  return bdReply(JSON.stringify([{ id, title: 'T', status, priority: 2, issue_type: 'task' }]))
}

function bdCalls(): string[][] {
  return runBdMock.mock.calls.map((call) => call[1])
}

beforeEach(() => {
  runBdMock.mockReset()
  resetBdVersionCacheForTests()
  resetBeadsContextCacheForTests()
})

describe('beads write service', () => {
  it('creates an issue and reads the new id back with bd show', async () => {
    installFakeBd(runBdMock, {
      create: bdReply(JSON.stringify({ id: 'p-9', title: 'New', schema_version: 1 })),
      'show p-9': showReply('p-9', 'open')
    })
    const details = await createBeadsIssue(TARGET, { title: 'New', issueType: 'bug' }, 'me')
    expect(details.issue.id).toBe('p-9')
    expect(runBdMock).toHaveBeenCalledWith(
      TARGET,
      ['create', '--json', '--title=New', '--type=bug', '--actor=me'],
      30_000
    )
  })

  it('updates, claims and closes, returning fresh details each time', async () => {
    installFakeBd(runBdMock, {
      update: bdReply('[]'),
      close: bdReply('[]'),
      'show p-1': showReply('p-1', 'in_progress')
    })
    await updateBeadsIssue(TARGET, 'p-1', { priority: 0 }, null)
    await claimBeadsIssue(TARGET, 'p-1', 'me')
    const closed = await closeBeadsIssue(TARGET, 'p-1', 'done', null)
    expect(closed.issue.id).toBe('p-1')
    const writes = bdCalls().filter((args) => args[0] === 'update' || args[0] === 'close')
    expect(writes).toEqual([
      ['update', 'p-1', '--json', '--priority=0'],
      ['update', 'p-1', '--json', '--claim', '--actor=me'],
      ['close', 'p-1', '--json', '--reason=done']
    ])
  })

  it('posts comments with the text after --', async () => {
    installFakeBd(runBdMock, {
      comment: bdReply('✓ Comment added'),
      'show p-1': showReply('p-1', 'open')
    })
    await addBeadsComment(TARGET, 'p-1', '-hi', null)
    expect(bdCalls()).toContainEqual(['comment', 'p-1', '--json', '--', '-hi'])
  })

  it('deletes and reports the deleted id', async () => {
    installFakeBd(runBdMock, {
      delete: bdReply('{"deleted":"p-1","dependencies_removed":1,"schema_version":1}')
    })
    await expect(deleteBeadsIssue(TARGET, 'p-1', null)).resolves.toEqual({ deleted: 'p-1' })
  })

  it('throws loudly when a write fails and never reads back', async () => {
    installFakeBd(runBdMock, {
      update: bdReply('', {
        exitCode: 1,
        stderr: 'Error: no issue found matching "p-404"'
      })
    })
    await expect(updateBeadsIssue(TARGET, 'p-404', { title: 'x' }, null)).rejects.toMatchObject({
      kind: 'not-found'
    })
    expect(bdCalls().some((args) => args[0] === 'show')).toBe(false)
  })

  it('rejects hostile input without spawning bd', async () => {
    installFakeBd(runBdMock, {})
    await expect(claimBeadsIssue(TARGET, '--all', null)).rejects.toMatchObject({
      kind: 'invalid-input'
    })
    expect(runBdMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/beads/beads-write-service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Argv is built before `invokeBd` is called, so invalid input throws before any bd process (including the version probe) starts.

`src/main/beads/beads-write-service.ts`:
```ts
import type {
  BeadsCreateInput,
  BeadsDeleteOutcome,
  BeadsIssuePatch
} from '../../shared/beads/beads-contract'
import type { BeadsIssueDetails } from '../../shared/beads/beads-issue-types'
import { readOptionalString } from '../../shared/beads/beads-json-value'
import { parseBdJsonRecord } from './bd-json'
import { BeadsError } from './beads-error'
import type { BeadsExecutionTarget } from './beads-executor'
import { invokeBd } from './beads-invocation'
import { getBeadsIssueDetails } from './beads-read-service'
import {
  buildClaimArgs,
  buildCloseArgs,
  buildCommentArgs,
  buildCreateArgs,
  buildDeferArgs,
  buildDeleteArgs,
  buildReopenArgs,
  buildUndeferArgs,
  buildUpdateArgs
} from './beads-write-args'

// Why: bd write outputs differ per command (object, array, plain text for
// `comment`). Reading the issue back with `bd show` gives callers one shape and
// includes relations and comments the write output lacks.
async function writeThenReadBack(
  target: BeadsExecutionTarget,
  id: string,
  args: string[]
): Promise<BeadsIssueDetails> {
  await invokeBd(target, args, 'write')
  return getBeadsIssueDetails(target, id)
}

export async function createBeadsIssue(
  target: BeadsExecutionTarget,
  input: BeadsCreateInput,
  actor: string | null
): Promise<BeadsIssueDetails> {
  const args = buildCreateArgs(input, actor)
  const created = parseBdJsonRecord(await invokeBd(target, args, 'write'))
  const id = readOptionalString(created.id)
  if (!id) {
    throw new BeadsError('failed', 'bd create did not report the new issue id.')
  }
  return getBeadsIssueDetails(target, id)
}

export async function updateBeadsIssue(
  target: BeadsExecutionTarget,
  id: string,
  patch: BeadsIssuePatch,
  actor: string | null
): Promise<BeadsIssueDetails> {
  return writeThenReadBack(target, id, buildUpdateArgs(id, patch, actor))
}

export async function claimBeadsIssue(
  target: BeadsExecutionTarget,
  id: string,
  actor: string | null
): Promise<BeadsIssueDetails> {
  return writeThenReadBack(target, id, buildClaimArgs(id, actor))
}

export async function closeBeadsIssue(
  target: BeadsExecutionTarget,
  id: string,
  reason: string,
  actor: string | null
): Promise<BeadsIssueDetails> {
  return writeThenReadBack(target, id, buildCloseArgs(id, reason, actor))
}

export async function reopenBeadsIssue(
  target: BeadsExecutionTarget,
  id: string,
  reason: string | null,
  actor: string | null
): Promise<BeadsIssueDetails> {
  return writeThenReadBack(target, id, buildReopenArgs(id, reason, actor))
}

export async function deferBeadsIssue(
  target: BeadsExecutionTarget,
  id: string,
  until: string | null,
  actor: string | null
): Promise<BeadsIssueDetails> {
  return writeThenReadBack(target, id, buildDeferArgs(id, until, actor))
}

export async function undeferBeadsIssue(
  target: BeadsExecutionTarget,
  id: string,
  actor: string | null
): Promise<BeadsIssueDetails> {
  return writeThenReadBack(target, id, buildUndeferArgs(id, actor))
}

export async function deleteBeadsIssue(
  target: BeadsExecutionTarget,
  id: string,
  actor: string | null
): Promise<BeadsDeleteOutcome> {
  const args = buildDeleteArgs(id, actor)
  const outcome = parseBdJsonRecord(await invokeBd(target, args, 'write'))
  const deleted = readOptionalString(outcome.deleted)
  if (!deleted) {
    throw new BeadsError('failed', `bd delete did not confirm deleting ${id}.`)
  }
  return { deleted }
}

export async function addBeadsComment(
  target: BeadsExecutionTarget,
  id: string,
  text: string,
  actor: string | null
): Promise<BeadsIssueDetails> {
  return writeThenReadBack(target, id, buildCommentArgs(id, text, actor))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/beads/beads-write-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/beads/beads-write-service.ts src/main/beads/beads-write-service.test.ts
git commit -m "feat(beads): add the beads write service

Create, update, claim, close, reopen, defer, undefer, delete and comment;
every successful write reads the issue back so callers get one shape.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Registered-repo target, IPC handlers and preload bridge

**Files:**
- Create: `src/main/beads/beads-repo-target.ts`
- Test: `src/main/beads/beads-repo-target.test.ts`
- Create: `src/main/ipc/beads.ts`
- Modify: `src/main/ipc/register-core-handlers/register-core-handlers.ts` (import near line 13–16; call after `registerGitLabHandlers(store)` ~line 155)
- Create: `src/preload/api/beads-api.ts`
- Create: `src/preload/api/beads-bridge.ts`
- Modify: `src/preload/api-types.ts` (import next to `JiraApi` ~line 34; field next to `jira: JiraApi` ~line 91)
- Modify: `src/preload/index.ts` (import next to `jiraApi` ~line 32; entry next to `jira: jiraApi,` ~line 126)

**Interfaces:**
- Consumes: `Repo` from `src/shared/repo-types`; `Store` from `src/main/persistence` (`getRepo(id): Repo | undefined`, `getRepos(): Repo[]`); `getLocalProjectWorktreeGitOptions(store, repo): { wslDistro?: string }` from `src/main/project-runtime-git-options`; services from Tasks 8–9; `captureBeadsResult` (Task 4); contract arg types (Task 1).
- Produces:
  - `type BeadsRepoRegistry = Pick<Store, 'getRepo' | 'getRepos'>`
  - `findRegisteredBeadsRepo(registry: BeadsRepoRegistry, repoPath: string, repoId: string | null | undefined): Repo`
  - `beadsTargetForRepo(repo: Repo, wslDistro: string | undefined): BeadsExecutionTarget`
  - `registerBeadsHandlers(store: Store): void`
  - IPC channels: `beads:getStatus`, `beads:getSchema`, `beads:getChangeToken`, `beads:listIssues`, `beads:countIssues`, `beads:getIssueDetails`, `beads:createIssue`, `beads:updateIssue`, `beads:claimIssue`, `beads:closeIssue`, `beads:reopenIssue`, `beads:deferIssue`, `beads:undeferIssue`, `beads:deleteIssue`, `beads:addComment`
  - `type BeadsApi` and `window.api.beads` with methods `getStatus, getSchema, getChangeToken, listIssues, countIssues, getIssueDetails, createIssue, updateIssue, claimIssue, closeIssue, reopenIssue, deferIssue, undeferIssue, deleteIssue, addComment`, each returning `Promise<BeadsResult<…>>`

- [ ] **Step 1: Write the failing test**

`src/main/beads/beads-repo-target.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import { beadsTargetForRepo, findRegisteredBeadsRepo } from './beads-repo-target'
import type { BeadsRepoRegistry } from './beads-repo-target'

function repo(id: string, path: string, connectionId: string | null = null): Repo {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: tests only read id, path and connectionId; the remaining Repo fields are irrelevant to target resolution.
  return { id, path, connectionId } as Repo
}

function registry(repos: Repo[]): BeadsRepoRegistry {
  return {
    getRepo: (id: string) => repos.find((candidate) => candidate.id === id),
    getRepos: () => repos
  }
}

describe('findRegisteredBeadsRepo', () => {
  it('finds a registered repo by id when the path matches, otherwise by path', () => {
    const repos = [repo('r1', '/work/a'), repo('r2', '/work/b', 'ssh-1')]
    expect(findRegisteredBeadsRepo(registry(repos), '/work/b', 'r2').id).toBe('r2')
    expect(findRegisteredBeadsRepo(registry(repos), '/work/a/', null).id).toBe('r1')
  })

  it('does not trust an id whose repo lives at a different path', () => {
    const repos = [repo('r1', '/work/a'), repo('r2', '/work/b')]
    expect(findRegisteredBeadsRepo(registry(repos), '/work/b', 'r1').id).toBe('r2')
  })

  it('refuses unregistered paths', () => {
    expect(() => findRegisteredBeadsRepo(registry([]), '/etc', null)).toThrow(
      /Access denied: unknown repository path/
    )
  })
})

describe('beadsTargetForRepo', () => {
  it('carries the SSH connection and WSL distro', () => {
    expect(beadsTargetForRepo(repo('r2', '/srv/b', 'ssh-1'), undefined)).toEqual({
      repoPath: '/srv/b',
      connectionId: 'ssh-1',
      wslDistro: undefined
    })
    expect(beadsTargetForRepo(repo('r1', '/work/a'), 'Ubuntu')).toMatchObject({
      connectionId: null,
      wslDistro: 'Ubuntu'
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/beads/beads-repo-target.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repo target**

`src/main/beads/beads-repo-target.ts`:
```ts
import { resolve } from 'node:path'
import type { Repo } from '../../shared/repo-types'
import type { Store } from '../persistence'
import { BeadsError } from './beads-error'
import type { BeadsExecutionTarget } from './beads-executor'

export type BeadsRepoRegistry = Pick<Store, 'getRepo' | 'getRepos'>

// Why: mirror gitlab-repo-access — main-process handlers must never run bd in a
// directory the user has not registered as a repo (filesystem-auth boundary).
export function findRegisteredBeadsRepo(
  registry: BeadsRepoRegistry,
  repoPath: string,
  repoId: string | null | undefined
): Repo {
  const resolvedPath = resolve(repoPath)
  const id = repoId?.trim()
  const byId = id ? registry.getRepo(id) : undefined
  const repo =
    byId && resolve(byId.path) === resolvedPath
      ? byId
      : registry.getRepos().find((candidate) => resolve(candidate.path) === resolvedPath)
  if (!repo) {
    throw new BeadsError('invalid-input', 'Access denied: unknown repository path')
  }
  return repo
}

export function beadsTargetForRepo(repo: Repo, wslDistro: string | undefined): BeadsExecutionTarget {
  return { repoPath: repo.path, connectionId: repo.connectionId ?? null, wslDistro }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/main/beads/beads-repo-target.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the IPC handlers**

`src/main/ipc/beads.ts`:
```ts
import { ipcMain } from 'electron'
import type {
  BeadsCloseArgs,
  BeadsCommentArgs,
  BeadsCountArgs,
  BeadsCreateArgs,
  BeadsDeferArgs,
  BeadsIssueActorArgs,
  BeadsListArgs,
  BeadsReadIssueArgs,
  BeadsReopenArgs,
  BeadsRepoArgs,
  BeadsResult,
  BeadsUpdateArgs
} from '../../shared/beads/beads-contract'
import { captureBeadsResult } from '../beads/beads-error'
import type { BeadsExecutionTarget } from '../beads/beads-executor'
import {
  countBeadsIssues,
  getBeadsChangeToken,
  getBeadsIssueDetails,
  getBeadsSchema,
  getBeadsWorkspaceStatus,
  listBeadsIssues
} from '../beads/beads-read-service'
import { beadsTargetForRepo, findRegisteredBeadsRepo } from '../beads/beads-repo-target'
import {
  addBeadsComment,
  claimBeadsIssue,
  closeBeadsIssue,
  createBeadsIssue,
  deferBeadsIssue,
  deleteBeadsIssue,
  reopenBeadsIssue,
  undeferBeadsIssue,
  updateBeadsIssue
} from '../beads/beads-write-service'
import type { Store } from '../persistence'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'

function targetFor(store: Store, args: BeadsRepoArgs): BeadsExecutionTarget {
  const repo = findRegisteredBeadsRepo(store, args.repoPath, args.repoId)
  return beadsTargetForRepo(repo, getLocalProjectWorktreeGitOptions(store, repo).wslDistro)
}

function handleBeads<TArgs extends BeadsRepoArgs, TValue>(
  store: Store,
  channel: string,
  run: (target: BeadsExecutionTarget, args: TArgs) => Promise<TValue>
): void {
  // Why: results cross IPC as data so the renderer keeps the error kind; a thrown
  // Error would arrive as a bare message.
  ipcMain.handle(
    channel,
    (_event, args: TArgs): Promise<BeadsResult<TValue>> =>
      captureBeadsResult(() => run(targetFor(store, args), args))
  )
}

export function registerBeadsHandlers(store: Store): void {
  handleBeads(store, 'beads:getStatus', (target) => getBeadsWorkspaceStatus(target))
  handleBeads(store, 'beads:getSchema', (target) => getBeadsSchema(target))
  handleBeads(store, 'beads:getChangeToken', (target) => getBeadsChangeToken(target))
  handleBeads(store, 'beads:listIssues', (target, args: BeadsListArgs) =>
    listBeadsIssues(target, args.request)
  )
  handleBeads(store, 'beads:countIssues', (target, args: BeadsCountArgs) =>
    countBeadsIssues(target, args.filter)
  )
  handleBeads(store, 'beads:getIssueDetails', (target, args: BeadsReadIssueArgs) =>
    getBeadsIssueDetails(target, args.id)
  )
  handleBeads(store, 'beads:createIssue', (target, args: BeadsCreateArgs) =>
    createBeadsIssue(target, args.input, args.actor)
  )
  handleBeads(store, 'beads:updateIssue', (target, args: BeadsUpdateArgs) =>
    updateBeadsIssue(target, args.id, args.patch, args.actor)
  )
  handleBeads(store, 'beads:claimIssue', (target, args: BeadsIssueActorArgs) =>
    claimBeadsIssue(target, args.id, args.actor)
  )
  handleBeads(store, 'beads:closeIssue', (target, args: BeadsCloseArgs) =>
    closeBeadsIssue(target, args.id, args.reason, args.actor)
  )
  handleBeads(store, 'beads:reopenIssue', (target, args: BeadsReopenArgs) =>
    reopenBeadsIssue(target, args.id, args.reason, args.actor)
  )
  handleBeads(store, 'beads:deferIssue', (target, args: BeadsDeferArgs) =>
    deferBeadsIssue(target, args.id, args.until, args.actor)
  )
  handleBeads(store, 'beads:undeferIssue', (target, args: BeadsIssueActorArgs) =>
    undeferBeadsIssue(target, args.id, args.actor)
  )
  handleBeads(store, 'beads:deleteIssue', (target, args: BeadsIssueActorArgs) =>
    deleteBeadsIssue(target, args.id, args.actor)
  )
  handleBeads(store, 'beads:addComment', (target, args: BeadsCommentArgs) =>
    addBeadsComment(target, args.id, args.text, args.actor)
  )
}
```

In `src/main/ipc/register-core-handlers/register-core-handlers.ts` add
```ts
import { registerBeadsHandlers } from '../beads'
```
next to `import { registerGitLabHandlers } from '../gitlab'`, and directly after `registerGitLabHandlers(store)`:
```ts
  registerBeadsHandlers(store)
```

- [ ] **Step 6: Implement the preload types and bridge**

`src/preload/api/beads-api.ts`:
```ts
import type {
  BeadsCloseArgs,
  BeadsCommentArgs,
  BeadsCountArgs,
  BeadsCreateArgs,
  BeadsDeferArgs,
  BeadsDeleteOutcome,
  BeadsIssueActorArgs,
  BeadsIssuePage,
  BeadsListArgs,
  BeadsReadIssueArgs,
  BeadsReopenArgs,
  BeadsRepoArgs,
  BeadsResult,
  BeadsUpdateArgs
} from '../../shared/beads/beads-contract'
import type {
  BeadsIssueDetails,
  BeadsSchema,
  BeadsWorkspaceStatus
} from '../../shared/beads/beads-issue-types'

type Details = Promise<BeadsResult<BeadsIssueDetails>>

export type BeadsApi = {
  getStatus: (args: BeadsRepoArgs) => Promise<BeadsResult<BeadsWorkspaceStatus>>
  getSchema: (args: BeadsRepoArgs) => Promise<BeadsResult<BeadsSchema>>
  getChangeToken: (args: BeadsRepoArgs) => Promise<BeadsResult<string>>
  listIssues: (args: BeadsListArgs) => Promise<BeadsResult<BeadsIssuePage>>
  countIssues: (args: BeadsCountArgs) => Promise<BeadsResult<number>>
  getIssueDetails: (args: BeadsReadIssueArgs) => Details
  createIssue: (args: BeadsCreateArgs) => Details
  updateIssue: (args: BeadsUpdateArgs) => Details
  claimIssue: (args: BeadsIssueActorArgs) => Details
  closeIssue: (args: BeadsCloseArgs) => Details
  reopenIssue: (args: BeadsReopenArgs) => Details
  deferIssue: (args: BeadsDeferArgs) => Details
  undeferIssue: (args: BeadsIssueActorArgs) => Details
  deleteIssue: (args: BeadsIssueActorArgs) => Promise<BeadsResult<BeadsDeleteOutcome>>
  addComment: (args: BeadsCommentArgs) => Details
}
```

`src/preload/api/beads-bridge.ts`:
```ts
import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const beadsApi = {
  getStatus: (args) => ipcRenderer.invoke('beads:getStatus', args),
  getSchema: (args) => ipcRenderer.invoke('beads:getSchema', args),
  getChangeToken: (args) => ipcRenderer.invoke('beads:getChangeToken', args),
  listIssues: (args) => ipcRenderer.invoke('beads:listIssues', args),
  countIssues: (args) => ipcRenderer.invoke('beads:countIssues', args),
  getIssueDetails: (args) => ipcRenderer.invoke('beads:getIssueDetails', args),
  createIssue: (args) => ipcRenderer.invoke('beads:createIssue', args),
  updateIssue: (args) => ipcRenderer.invoke('beads:updateIssue', args),
  claimIssue: (args) => ipcRenderer.invoke('beads:claimIssue', args),
  closeIssue: (args) => ipcRenderer.invoke('beads:closeIssue', args),
  reopenIssue: (args) => ipcRenderer.invoke('beads:reopenIssue', args),
  deferIssue: (args) => ipcRenderer.invoke('beads:deferIssue', args),
  undeferIssue: (args) => ipcRenderer.invoke('beads:undeferIssue', args),
  deleteIssue: (args) => ipcRenderer.invoke('beads:deleteIssue', args),
  addComment: (args) => ipcRenderer.invoke('beads:addComment', args)
} satisfies PreloadApi['beads']
```

In `src/preload/api-types.ts`: add `import type { BeadsApi } from './api/beads-api'` beside the `JiraApi` import and `beads: BeadsApi` beside `jira: JiraApi`.

In `src/preload/index.ts`: add `import { beadsApi } from './api/beads-bridge'` beside the `jiraApi` import and `beads: beadsApi,` beside `jira: jiraApi,`.

If `satisfies PreloadApi['beads']` leaves the `(args)` parameters implicitly `any` under the preload tsconfig, annotate each parameter with the matching arg type from `beads-api.ts` (for example `(args: BeadsRepoArgs)`), importing them with `import type`.

- [ ] **Step 7: Typecheck and run the beads tests**

Run:
```bash
pnpm tc
pnpm test src/main/beads src/shared/beads
```
Expected: typecheck exit 0; tests PASS. The web client (`web-preload-api.ts`) is a `Partial<PreloadApi>`, so no web change is needed.

- [ ] **Step 8: Commit**

```bash
git add src/main/beads/beads-repo-target.ts src/main/beads/beads-repo-target.test.ts src/main/ipc/beads.ts src/main/ipc/register-core-handlers/register-core-handlers.ts src/preload/api/beads-api.ts src/preload/api/beads-bridge.ts src/preload/api-types.ts src/preload/index.ts
git commit -m "feat(beads): expose the beads backend over IPC and preload

Handlers only run bd in registered repos and return BeadsResult so the
renderer keeps the error kind.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Runtime command class and surface

**Files:**
- Create: `src/main/runtime/runtime-beads-commands.ts`
- Create: `src/main/runtime/runtime-beads-command-surface.ts`
- Test: `src/main/runtime/runtime-beads-commands.test.ts`
- Modify: `src/main/runtime/orca-runtime-file-commands.ts` (add a field after `gitLabQueryCommands`, ~line 160–175; file is `@ts-nocheck`, keep it that way, do not add `@ts-nocheck` elsewhere)
- Modify: `src/main/runtime/orca-runtime-state-fields.ts` (import beside `installRuntimeReviewCommandSurface` ~line 23; call after the `installRuntimeReviewCommandSurface(runtime, {...})` block ~line 121–128)
- Modify: `src/main/runtime/orca-runtime-core.ts` (import beside `RuntimeReviewCommandSurface` ~line 17; add to `RuntimeInstalledCommandSurfaces` ~line 341–348)

**Interfaces:**
- Consumes: `Repo`; services (Tasks 8–9); `beadsTargetForRepo` (Task 10); `captureBeadsResult` (Task 4); runtime's `resolveRepoSelector(selector): Promise<Repo>` and `getLocalGitExecutionOptionArgs(repo): [] | [{ wslDistro?: string }]`.
- Produces:
  - `type RuntimeBeadsCommandsDeps = { resolveRepo: (selector: string) => Promise<Repo>; getLocalGitArgs: (repo: Repo) => [] | [{ wslDistro?: string }] }`
  - `class RuntimeBeadsCommands` with methods (all return `Promise<BeadsResult<…>>`): `beadsGetStatus(repo)`, `beadsGetSchema(repo)`, `beadsGetChangeToken(repo)`, `beadsListIssues(repo, request)`, `beadsCountIssues(repo, filter)`, `beadsGetIssueDetails(repo, id)`, `beadsCreateIssue(repo, input, actor)`, `beadsUpdateIssue(repo, id, patch, actor)`, `beadsClaimIssue(repo, id, actor)`, `beadsCloseIssue(repo, id, reason, actor)`, `beadsReopenIssue(repo, id, reason, actor)`, `beadsDeferIssue(repo, id, until, actor)`, `beadsUndeferIssue(repo, id, actor)`, `beadsDeleteIssue(repo, id, actor)`, `beadsAddComment(repo, id, text, actor)` — `repo` is a runtime repo selector string
  - `type RuntimeBeadsCommandSurface`, `installRuntimeBeadsCommandSurface(target, commands): void`

- [ ] **Step 1: Write the failing test**

`src/main/runtime/runtime-beads-commands.test.ts`:
```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../shared/repo-types'

const { listMock, claimMock } = vi.hoisted(() => ({ listMock: vi.fn(), claimMock: vi.fn() }))

vi.mock('../beads/beads-read-service', () => ({
  countBeadsIssues: vi.fn(),
  getBeadsChangeToken: vi.fn(),
  getBeadsIssueDetails: vi.fn(),
  getBeadsSchema: vi.fn(),
  getBeadsWorkspaceStatus: vi.fn(),
  listBeadsIssues: listMock
}))

vi.mock('../beads/beads-write-service', () => ({
  addBeadsComment: vi.fn(),
  claimBeadsIssue: claimMock,
  closeBeadsIssue: vi.fn(),
  createBeadsIssue: vi.fn(),
  deferBeadsIssue: vi.fn(),
  deleteBeadsIssue: vi.fn(),
  reopenBeadsIssue: vi.fn(),
  undeferBeadsIssue: vi.fn(),
  updateBeadsIssue: vi.fn()
}))

import { BeadsError } from '../beads/beads-error'
import { RuntimeBeadsCommands } from './runtime-beads-commands'
import { installRuntimeBeadsCommandSurface } from './runtime-beads-command-surface'
import type { RuntimeBeadsCommandSurface } from './runtime-beads-command-surface'

// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the commands only read id, path and connectionId from the resolved repo.
const REPO = { id: 'r1', path: '/srv/repo', connectionId: null } as Repo

function makeCommands(): RuntimeBeadsCommands {
  return new RuntimeBeadsCommands({
    resolveRepo: vi.fn(async () => REPO),
    getLocalGitArgs: () => [{ wslDistro: 'Ubuntu' }]
  })
}

beforeEach(() => {
  listMock.mockReset()
  claimMock.mockReset()
})

describe('RuntimeBeadsCommands', () => {
  it('resolves the repo selector to an execution target and wraps the result', async () => {
    listMock.mockResolvedValue({ issues: [], hasMore: false })
    const request = { view: 'ready' as const, filter: {}, limit: 200 }
    await expect(makeCommands().beadsListIssues('id:r1', request)).resolves.toEqual({
      ok: true,
      value: { issues: [], hasMore: false }
    })
    expect(listMock).toHaveBeenCalledWith(
      { repoPath: '/srv/repo', connectionId: null, wslDistro: 'Ubuntu' },
      request
    )
  })

  it('returns typed failures instead of throwing', async () => {
    claimMock.mockRejectedValue(new BeadsError('busy', 'locked'))
    await expect(makeCommands().beadsClaimIssue('id:r1', 'p-1', 'me')).resolves.toEqual({
      ok: false,
      error: { kind: 'busy', message: 'locked' }
    })
  })

  it('installs every beads method on a runtime surface', () => {
    const commands = makeCommands()
    const surface: Partial<RuntimeBeadsCommandSurface> = {}
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: installRuntimeBeadsCommandSurface fills every surface key, which the loop below verifies.
    installRuntimeBeadsCommandSurface(surface as RuntimeBeadsCommandSurface, commands)
    for (const name of Object.getOwnPropertyNames(RuntimeBeadsCommands.prototype)) {
      if (name.startsWith('beads')) {
        expect(typeof surface[name as keyof RuntimeBeadsCommandSurface]).toBe('function')
      }
    }
  })
})
```

The last `name as keyof …` cast is covered by the SAFETY comment's loop contract; if the SAFETY lint flags it, add the same `oxlint-disable-next-line … -- SAFETY: names are filtered to own beads* prototype methods` line above it.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/runtime/runtime-beads-commands.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the command class**

`src/main/runtime/runtime-beads-commands.ts`:
```ts
import type {
  BeadsCreateInput,
  BeadsDeleteOutcome,
  BeadsIssuePage,
  BeadsIssuePatch,
  BeadsListFilter,
  BeadsListRequest,
  BeadsResult
} from '../../shared/beads/beads-contract'
import type {
  BeadsIssueDetails,
  BeadsSchema,
  BeadsWorkspaceStatus
} from '../../shared/beads/beads-issue-types'
import type { Repo } from '../../shared/repo-types'
import { captureBeadsResult } from '../beads/beads-error'
import type { BeadsExecutionTarget } from '../beads/beads-executor'
import {
  countBeadsIssues,
  getBeadsChangeToken,
  getBeadsIssueDetails,
  getBeadsSchema,
  getBeadsWorkspaceStatus,
  listBeadsIssues
} from '../beads/beads-read-service'
import { beadsTargetForRepo } from '../beads/beads-repo-target'
import {
  addBeadsComment,
  claimBeadsIssue,
  closeBeadsIssue,
  createBeadsIssue,
  deferBeadsIssue,
  deleteBeadsIssue,
  reopenBeadsIssue,
  undeferBeadsIssue,
  updateBeadsIssue
} from '../beads/beads-write-service'

type LocalGitArgs = [] | [{ wslDistro?: string }]

export type RuntimeBeadsCommandsDeps = {
  resolveRepo: (selector: string) => Promise<Repo>
  getLocalGitArgs: (repo: Repo) => LocalGitArgs
}

type Details = Promise<BeadsResult<BeadsIssueDetails>>

export class RuntimeBeadsCommands {
  constructor(private readonly deps: RuntimeBeadsCommandsDeps) {}

  private async resolveTarget(selector: string): Promise<BeadsExecutionTarget> {
    const repo = await this.deps.resolveRepo(selector)
    const [localOptions] = this.deps.getLocalGitArgs(repo)
    return beadsTargetForRepo(repo, localOptions?.wslDistro)
  }

  beadsGetStatus(repo: string): Promise<BeadsResult<BeadsWorkspaceStatus>> {
    return captureBeadsResult(async () => getBeadsWorkspaceStatus(await this.resolveTarget(repo)))
  }

  beadsGetSchema(repo: string): Promise<BeadsResult<BeadsSchema>> {
    return captureBeadsResult(async () => getBeadsSchema(await this.resolveTarget(repo)))
  }

  beadsGetChangeToken(repo: string): Promise<BeadsResult<string>> {
    return captureBeadsResult(async () => getBeadsChangeToken(await this.resolveTarget(repo)))
  }

  beadsListIssues(repo: string, request: BeadsListRequest): Promise<BeadsResult<BeadsIssuePage>> {
    return captureBeadsResult(async () => listBeadsIssues(await this.resolveTarget(repo), request))
  }

  beadsCountIssues(repo: string, filter: BeadsListFilter): Promise<BeadsResult<number>> {
    return captureBeadsResult(async () => countBeadsIssues(await this.resolveTarget(repo), filter))
  }

  beadsGetIssueDetails(repo: string, id: string): Details {
    return captureBeadsResult(async () => getBeadsIssueDetails(await this.resolveTarget(repo), id))
  }

  beadsCreateIssue(repo: string, input: BeadsCreateInput, actor: string | null): Details {
    return captureBeadsResult(async () =>
      createBeadsIssue(await this.resolveTarget(repo), input, actor)
    )
  }

  beadsUpdateIssue(repo: string, id: string, patch: BeadsIssuePatch, actor: string | null): Details {
    return captureBeadsResult(async () =>
      updateBeadsIssue(await this.resolveTarget(repo), id, patch, actor)
    )
  }

  beadsClaimIssue(repo: string, id: string, actor: string | null): Details {
    return captureBeadsResult(async () => claimBeadsIssue(await this.resolveTarget(repo), id, actor))
  }

  beadsCloseIssue(repo: string, id: string, reason: string, actor: string | null): Details {
    return captureBeadsResult(async () =>
      closeBeadsIssue(await this.resolveTarget(repo), id, reason, actor)
    )
  }

  beadsReopenIssue(repo: string, id: string, reason: string | null, actor: string | null): Details {
    return captureBeadsResult(async () =>
      reopenBeadsIssue(await this.resolveTarget(repo), id, reason, actor)
    )
  }

  beadsDeferIssue(repo: string, id: string, until: string | null, actor: string | null): Details {
    return captureBeadsResult(async () =>
      deferBeadsIssue(await this.resolveTarget(repo), id, until, actor)
    )
  }

  beadsUndeferIssue(repo: string, id: string, actor: string | null): Details {
    return captureBeadsResult(async () =>
      undeferBeadsIssue(await this.resolveTarget(repo), id, actor)
    )
  }

  beadsDeleteIssue(
    repo: string,
    id: string,
    actor: string | null
  ): Promise<BeadsResult<BeadsDeleteOutcome>> {
    return captureBeadsResult(async () => deleteBeadsIssue(await this.resolveTarget(repo), id, actor))
  }

  beadsAddComment(repo: string, id: string, text: string, actor: string | null): Details {
    return captureBeadsResult(async () =>
      addBeadsComment(await this.resolveTarget(repo), id, text, actor)
    )
  }
}
```

- [ ] **Step 4: Implement the surface**

`src/main/runtime/runtime-beads-command-surface.ts`:
```ts
import type { RuntimeBeadsCommands } from './runtime-beads-commands'

type BeadsCommandName = Exclude<keyof RuntimeBeadsCommands, 'constructor'>

export type RuntimeBeadsCommandSurface = Pick<RuntimeBeadsCommands, BeadsCommandName>

export function installRuntimeBeadsCommandSurface(
  target: RuntimeBeadsCommandSurface,
  commands: RuntimeBeadsCommands
): void {
  Object.assign(target, {
    beadsGetStatus: commands.beadsGetStatus.bind(commands),
    beadsGetSchema: commands.beadsGetSchema.bind(commands),
    beadsGetChangeToken: commands.beadsGetChangeToken.bind(commands),
    beadsListIssues: commands.beadsListIssues.bind(commands),
    beadsCountIssues: commands.beadsCountIssues.bind(commands),
    beadsGetIssueDetails: commands.beadsGetIssueDetails.bind(commands),
    beadsCreateIssue: commands.beadsCreateIssue.bind(commands),
    beadsUpdateIssue: commands.beadsUpdateIssue.bind(commands),
    beadsClaimIssue: commands.beadsClaimIssue.bind(commands),
    beadsCloseIssue: commands.beadsCloseIssue.bind(commands),
    beadsReopenIssue: commands.beadsReopenIssue.bind(commands),
    beadsDeferIssue: commands.beadsDeferIssue.bind(commands),
    beadsUndeferIssue: commands.beadsUndeferIssue.bind(commands),
    beadsDeleteIssue: commands.beadsDeleteIssue.bind(commands),
    beadsAddComment: commands.beadsAddComment.bind(commands)
  } satisfies RuntimeBeadsCommandSurface)
}
```

- [ ] **Step 5: Wire it into the runtime**

`src/main/runtime/orca-runtime-file-commands.ts`: add `import { RuntimeBeadsCommands } from './runtime-beads-commands'` beside `import { RuntimeGitLabQueryCommands } from './runtime-gitlab-query-commands'`, and after the `gitLabQueryCommands` field:
```ts
  protected readonly beadsCommands = new RuntimeBeadsCommands({
    resolveRepo: (selector) => this.resolveRepoSelector(selector),
    getLocalGitArgs: (repo) => this.getLocalGitExecutionOptionArgs(repo)
  })
```

`src/main/runtime/orca-runtime-state-fields.ts`: add `import { installRuntimeBeadsCommandSurface } from './runtime-beads-command-surface'` beside the review-surface import, and after the `installRuntimeReviewCommandSurface(runtime, { … })` call:
```ts
    installRuntimeBeadsCommandSurface(runtime, this.beadsCommands)
```

`src/main/runtime/orca-runtime-core.ts`: add `import type { RuntimeBeadsCommandSurface } from './runtime-beads-command-surface'` beside the review-surface import, and extend the type:
```ts
export type RuntimeInstalledCommandSurfaces = RuntimeEdgeCommandSurface &
  RuntimeLinearCommandSurface &
  RuntimeFileCommandSurface &
  RuntimeGitCommandSurface &
  RuntimeRepositoryCommandSurface &
  RuntimeReviewCommandSurface &
  RuntimeBeadsCommandSurface &
  RuntimeServiceCommandSurface &
  RuntimeSkillCommandSurface
```

- [ ] **Step 6: Verify**

Run:
```bash
pnpm test src/main/runtime/runtime-beads-commands.test.ts
pnpm tc
pnpm run check:dead-classes
pnpm run check:ts-nocheck-ratchet
```
Expected: test PASS; typecheck exit 0; both checks pass (the class is used by the runtime; no new `@ts-nocheck`).

- [ ] **Step 7: Commit**

```bash
git add src/main/runtime/runtime-beads-commands.ts src/main/runtime/runtime-beads-command-surface.ts src/main/runtime/runtime-beads-commands.test.ts src/main/runtime/orca-runtime-file-commands.ts src/main/runtime/orca-runtime-state-fields.ts src/main/runtime/orca-runtime-core.ts
git commit -m "feat(beads): add beads commands to the Orca runtime

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: RPC params, methods and runtime capability

**Files:**
- Create: `src/shared/rpc-contract/beads-params.ts`
- Create: `src/main/runtime/rpc/methods/beads.ts`
- Test: `src/main/runtime/rpc/methods/beads.test.ts`
- Modify: `src/main/runtime/rpc/methods/index.ts` (import beside `JIRA_METHODS` ~line 30; spread beside `...JIRA_METHODS,` ~line 86)
- Modify: `src/shared/protocol-version.ts` (constant beside `JIRA_USER_FIELDS_RUNTIME_CAPABILITY` ~line 69; entry in `RUNTIME_CAPABILITIES` ~line 289)
- Regenerate: `src/shared/rpc-contract/rpc-params-catalog.generated.ts`

**Interfaces:**
- Consumes: runtime `beads*` methods (Task 11); `requiredString`, `OptionalString`, `OptionalFiniteNumber` from `./rpc-param-primitives`; `defineMethod` from `../core`.
- Produces:
  - RPC methods: `beads.getStatus`, `beads.getSchema`, `beads.getChangeToken`, `beads.listIssues`, `beads.countIssues`, `beads.getIssueDetails`, `beads.createIssue`, `beads.updateIssue`, `beads.claimIssue`, `beads.closeIssue`, `beads.reopenIssue`, `beads.deferIssue`, `beads.undeferIssue`, `beads.deleteIssue`, `beads.addComment`. Params always include `repo` (runtime repo selector).
  - `BEADS_TASK_SOURCE_RUNTIME_CAPABILITY = 'beads.task-source.v1'`

- [ ] **Step 1: Write the failing test**

`src/main/runtime/rpc/methods/beads.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { BEADS_METHODS } from './beads'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

describe('beads RPC methods', () => {
  it('routes beads methods to the runtime with parsed params', async () => {
    const ok = { ok: true, value: null }
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      beadsGetStatus: vi.fn().mockResolvedValue(ok),
      beadsListIssues: vi.fn().mockResolvedValue(ok),
      beadsClaimIssue: vi.fn().mockResolvedValue(ok),
      beadsCloseIssue: vi.fn().mockResolvedValue(ok),
      beadsAddComment: vi.fn().mockResolvedValue(ok)
    }
    const dispatcher = new RpcDispatcher({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the dispatcher only calls the stubbed beads methods exercised below.
      runtime: runtime as unknown as OrcaRuntimeService,
      methods: BEADS_METHODS
    })

    await dispatcher.dispatch(makeRequest('beads.getStatus', { repo: 'id:r1' }))
    await dispatcher.dispatch(
      makeRequest('beads.listIssues', {
        repo: 'id:r1',
        request: { view: 'ready', filter: { labels: ['ui'] }, limit: 200 }
      })
    )
    await dispatcher.dispatch(makeRequest('beads.claimIssue', { repo: 'id:r1', id: 'p-1', actor: 'me' }))
    await dispatcher.dispatch(
      makeRequest('beads.closeIssue', { repo: 'id:r1', id: 'p-1', actor: null, reason: 'done' })
    )
    await dispatcher.dispatch(
      makeRequest('beads.addComment', { repo: 'id:r1', id: 'p-1', actor: null, text: '-hi' })
    )

    expect(runtime.beadsGetStatus).toHaveBeenCalledWith('id:r1')
    expect(runtime.beadsListIssues).toHaveBeenCalledWith(
      'id:r1',
      expect.objectContaining({ view: 'ready', limit: 200 })
    )
    expect(runtime.beadsClaimIssue).toHaveBeenCalledWith('id:r1', 'p-1', 'me')
    expect(runtime.beadsCloseIssue).toHaveBeenCalledWith('id:r1', 'p-1', 'done', null)
    expect(runtime.beadsAddComment).toHaveBeenCalledWith('id:r1', 'p-1', '-hi', null)
  })

  it('rejects calls without a repo selector', async () => {
    const runtime = { getRuntimeId: () => 'test-runtime', beadsGetStatus: vi.fn() }
    const dispatcher = new RpcDispatcher({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: no runtime method should be reached for invalid params.
      runtime: runtime as unknown as OrcaRuntimeService,
      methods: BEADS_METHODS
    })
    await dispatcher.dispatch(makeRequest('beads.getStatus', {}))
    expect(runtime.beadsGetStatus).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/main/runtime/rpc/methods/beads.test.ts`
Expected: FAIL — `./beads` not found.

- [ ] **Step 3: Implement params**

`src/shared/rpc-contract/beads-params.ts`:
```ts
import { z } from 'zod'
import { OptionalFiniteNumber, OptionalString, requiredString } from './rpc-param-primitives'

const repoField = { repo: requiredString('Missing repo selector') }
const issueField = { id: requiredString('Missing beads issue id') }
const actorField = { actor: z.string().nullable() }

const ListFilter = z.object({
  statuses: z.array(z.string()).optional(),
  type: OptionalString,
  labels: z.array(z.string()).optional(),
  parent: OptionalString,
  priority: OptionalFiniteNumber,
  assignee: OptionalString,
  unassigned: z.boolean().optional(),
  includeClosed: z.boolean().optional()
})

export const BeadsRepoParams = z.object(repoField)

export const BeadsListIssuesParams = z.object({
  ...repoField,
  request: z.object({
    view: z.enum(['list', 'ready', 'blocked', 'search']),
    filter: ListFilter,
    text: OptionalString,
    limit: z.number()
  })
})

export const BeadsCountIssuesParams = z.object({ ...repoField, filter: ListFilter })

export const BeadsIssueParams = z.object({ ...repoField, ...issueField })

export const BeadsIssueActorParams = z.object({ ...repoField, ...issueField, ...actorField })

export const BeadsCreateIssueParams = z.object({
  ...repoField,
  ...actorField,
  input: z.object({
    title: z.string(),
    issueType: OptionalString,
    priority: OptionalFiniteNumber,
    description: z.string().optional(),
    design: z.string().optional(),
    acceptanceCriteria: z.string().optional(),
    notes: z.string().optional(),
    labels: z.array(z.string()).optional(),
    parent: OptionalString,
    assignee: OptionalString
  })
})

export const BeadsUpdateIssueParams = z.object({
  ...repoField,
  ...issueField,
  ...actorField,
  patch: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    design: z.string().optional(),
    acceptanceCriteria: z.string().optional(),
    notes: z.string().optional(),
    status: z.string().optional(),
    priority: OptionalFiniteNumber,
    issueType: z.string().optional(),
    assignee: z.string().optional(),
    parent: z.string().optional(),
    addLabels: z.array(z.string()).optional(),
    removeLabels: z.array(z.string()).optional()
  })
})

export const BeadsCloseIssueParams = z.object({
  ...repoField,
  ...issueField,
  ...actorField,
  reason: z.string()
})

export const BeadsReopenIssueParams = z.object({
  ...repoField,
  ...issueField,
  ...actorField,
  reason: z.string().nullable()
})

export const BeadsDeferIssueParams = z.object({
  ...repoField,
  ...issueField,
  ...actorField,
  until: z.string().nullable()
})

export const BeadsAddCommentParams = z.object({
  ...repoField,
  ...issueField,
  ...actorField,
  text: z.string()
})
```

Note: `description`, `design`, `acceptanceCriteria`, `notes` and `assignee` in `patch` use `z.string().optional()` (not `OptionalString`) on purpose, because an empty string means "clear" there.

- [ ] **Step 4: Implement methods**

`src/main/runtime/rpc/methods/beads.ts`:
```ts
import { defineMethod } from '../core'
import {
  BeadsAddCommentParams,
  BeadsCloseIssueParams,
  BeadsCountIssuesParams,
  BeadsCreateIssueParams,
  BeadsDeferIssueParams,
  BeadsIssueActorParams,
  BeadsIssueParams,
  BeadsListIssuesParams,
  BeadsRepoParams,
  BeadsReopenIssueParams,
  BeadsUpdateIssueParams
} from '../../../../shared/rpc-contract/beads-params'

export const BEADS_METHODS = [
  defineMethod({
    name: 'beads.getStatus',
    params: BeadsRepoParams,
    handler: async (params, { runtime }) => runtime.beadsGetStatus(params.repo)
  }),
  defineMethod({
    name: 'beads.getSchema',
    params: BeadsRepoParams,
    handler: async (params, { runtime }) => runtime.beadsGetSchema(params.repo)
  }),
  defineMethod({
    name: 'beads.getChangeToken',
    params: BeadsRepoParams,
    handler: async (params, { runtime }) => runtime.beadsGetChangeToken(params.repo)
  }),
  defineMethod({
    name: 'beads.listIssues',
    params: BeadsListIssuesParams,
    handler: async (params, { runtime }) => runtime.beadsListIssues(params.repo, params.request)
  }),
  defineMethod({
    name: 'beads.countIssues',
    params: BeadsCountIssuesParams,
    handler: async (params, { runtime }) => runtime.beadsCountIssues(params.repo, params.filter)
  }),
  defineMethod({
    name: 'beads.getIssueDetails',
    params: BeadsIssueParams,
    handler: async (params, { runtime }) => runtime.beadsGetIssueDetails(params.repo, params.id)
  }),
  defineMethod({
    name: 'beads.createIssue',
    params: BeadsCreateIssueParams,
    handler: async (params, { runtime }) =>
      runtime.beadsCreateIssue(params.repo, params.input, params.actor)
  }),
  defineMethod({
    name: 'beads.updateIssue',
    params: BeadsUpdateIssueParams,
    handler: async (params, { runtime }) =>
      runtime.beadsUpdateIssue(params.repo, params.id, params.patch, params.actor)
  }),
  defineMethod({
    name: 'beads.claimIssue',
    params: BeadsIssueActorParams,
    handler: async (params, { runtime }) =>
      runtime.beadsClaimIssue(params.repo, params.id, params.actor)
  }),
  defineMethod({
    name: 'beads.closeIssue',
    params: BeadsCloseIssueParams,
    handler: async (params, { runtime }) =>
      runtime.beadsCloseIssue(params.repo, params.id, params.reason, params.actor)
  }),
  defineMethod({
    name: 'beads.reopenIssue',
    params: BeadsReopenIssueParams,
    handler: async (params, { runtime }) =>
      runtime.beadsReopenIssue(params.repo, params.id, params.reason, params.actor)
  }),
  defineMethod({
    name: 'beads.deferIssue',
    params: BeadsDeferIssueParams,
    handler: async (params, { runtime }) =>
      runtime.beadsDeferIssue(params.repo, params.id, params.until, params.actor)
  }),
  defineMethod({
    name: 'beads.undeferIssue',
    params: BeadsIssueActorParams,
    handler: async (params, { runtime }) =>
      runtime.beadsUndeferIssue(params.repo, params.id, params.actor)
  }),
  defineMethod({
    name: 'beads.deleteIssue',
    params: BeadsIssueActorParams,
    handler: async (params, { runtime }) =>
      runtime.beadsDeleteIssue(params.repo, params.id, params.actor)
  }),
  defineMethod({
    name: 'beads.addComment',
    params: BeadsAddCommentParams,
    handler: async (params, { runtime }) =>
      runtime.beadsAddComment(params.repo, params.id, params.text, params.actor)
  })
]
```

- [ ] **Step 5: Register methods, capability and catalog**

`src/main/runtime/rpc/methods/index.ts`: add `import { BEADS_METHODS } from './beads'` beside `import { JIRA_METHODS } from './jira'`, and `...BEADS_METHODS,` beside `...JIRA_METHODS,` in `ALL_RPC_METHODS`.

`src/shared/protocol-version.ts`: beside `JIRA_USER_FIELDS_RUNTIME_CAPABILITY` add
```ts
export const BEADS_TASK_SOURCE_RUNTIME_CAPABILITY = 'beads.task-source.v1' as const
```
and add `BEADS_TASK_SOURCE_RUNTIME_CAPABILITY,` to `RUNTIME_CAPABILITIES` beside the Jira entry.

Do **not** add beads to `src/main/runtime/runtime-rpc/runtime-rpc-mobile-method-allowlist.ts`.

Run:
```bash
pnpm run generate:rpc-params-catalog
pnpm run verify:rpc-params-catalog
```
Expected: the generator updates `rpc-params-catalog.generated.ts`; verify exits 0.

- [ ] **Step 6: Verify**

Run:
```bash
pnpm test src/main/runtime/rpc/methods/beads.test.ts
pnpm tc
rg -ln "RUNTIME_CAPABILITIES" src --glob '*.test.ts' | xargs pnpm test
```
Expected: all PASS; typecheck exit 0. If a capability snapshot/list test fails only because the new capability is missing from its expected list, add `'beads.task-source.v1'` to that expected list in the same commit.

- [ ] **Step 7: Commit**

```bash
git add src/shared/rpc-contract/beads-params.ts src/main/runtime/rpc/methods/beads.ts src/main/runtime/rpc/methods/beads.test.ts src/main/runtime/rpc/methods/index.ts src/shared/protocol-version.ts src/shared/rpc-contract/rpc-params-catalog.generated.ts
git add -u src   # capability test expectation updates from Step 6, if any
git commit -m "feat(beads): expose beads over runtime RPC with a capability flag

Remote Orca runtimes serve beads.* methods; clients detect support through
beads.task-source.v1. Mobile allowlist unchanged (Jira precedent).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Recorded bd fixtures

**Files:**
- Create: `config/scripts/capture-beads-fixtures.mjs`
- Create (generated, committed): `src/main/beads/__fixtures__/bd-1.2.2/*.json`
- Test: `src/main/beads/beads-recorded-fixtures.test.ts`

**Interfaces:**
- Consumes: normalizers (Task 3), schema normalizers (Task 2), `parseBdJsonList`/`parseBdJsonRecord`/`parseBdJson` (Task 4), `classifyBdFailure` (Task 4), `normalizeBeadsContext` (Task 6).
- Produces: fixture files named `<operation>.json`. Success fixtures hold bd stdout verbatim; failure fixtures hold `{ "stdout": "...", "stderr": "...", "exitCode": N }`.

- [ ] **Step 1: Write the capture script**

`config/scripts/capture-beads-fixtures.mjs`:
```js
#!/usr/bin/env node
// Records real bd --json output into src/main/beads/__fixtures__/bd-<version>/.
// Runs only against a throwaway repo it creates in the OS temp dir.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const version = execFileSync('bd', ['version'], { encoding: 'utf8' }).match(/(\d+\.\d+\.\d+)/)?.[1]
if (!version) {
  throw new Error('Could not read bd version')
}
const outDir = join(repoRoot, 'src', 'main', 'beads', '__fixtures__', `bd-${version}`)
mkdirSync(outDir, { recursive: true })

const work = mkdtempSync(join(tmpdir(), 'orca-beads-fixtures-'))
const empty = mkdtempSync(join(tmpdir(), 'orca-beads-empty-'))

function run(cwd, args) {
  const result = spawnSync('bd', args, { cwd, encoding: 'utf8' })
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status }
}

function ok(cwd, args) {
  const result = run(cwd, args)
  if (result.exitCode !== 0) {
    throw new Error(`bd ${args.join(' ')} failed: ${result.stderr}`)
  }
  return result.stdout
}

function save(name, content) {
  writeFileSync(join(outDir, `${name}.json`), content.endsWith('\n') ? content : `${content}\n`)
}

function saveFailure(name, result) {
  save(name, JSON.stringify(result, null, 2))
}

try {
  execFileSync('git', ['init', '-q'], { cwd: work })
  execFileSync('git', ['config', 'user.name', 'Orca Fixtures'], { cwd: work })
  execFileSync('git', ['config', 'user.email', 'fixtures@example.com'], { cwd: work })
  ok(work, ['init', '--prefix=fx', '--non-interactive', '--skip-hooks', '--skip-agents', '-q'])
  const actor = '--actor=orca-fixtures'

  const epic = JSON.parse(ok(work, ['create', '--json', '--title=Epic', '--type=epic', '--priority=1', actor]))
  const createOut = ok(work, [
    'create', '--json', '--title=-dash child', '--type=task', `--parent=${epic.id}`,
    '--labels=ui', '--description=desc', '--design=design', '--acceptance=acc', '--notes=notes', actor
  ])
  save('create', createOut)
  const child = JSON.parse(createOut)
  const blocker = JSON.parse(ok(work, ['create', '--json', '--title=Blocker', actor]))
  ok(work, ['dep', 'add', child.id, blocker.id, actor])
  ok(work, ['create', '--json', '--title=Ambiguous one', '--id=fx-11', actor])
  ok(work, ['create', '--json', '--title=Ambiguous two', '--id=fx-12', actor])

  save('update', ok(work, ['update', blocker.id, '--json', '--priority=0', '--add-label=backend', actor]))
  save('claim', ok(work, ['update', blocker.id, '--json', '--claim', actor]))
  ok(work, ['comment', child.id, '--json', actor, '--', '-first comment'])

  save('context', ok(work, ['context', '--json']))
  save('statuses', ok(work, ['statuses', '--json']))
  save('types', ok(work, ['types', '--json']))
  save('vc-status', ok(work, ['vc', 'status', '--json']))
  save('list', ok(work, ['list', '--json', '--limit=50']))
  save('ready', ok(work, ['ready', '--json', '--limit=50']))
  save('blocked', ok(work, ['blocked', '--json']))
  save('search', ok(work, ['search', '--json', '--query=dash', '--limit=50']))
  save('count', ok(work, ['count', '--json']))
  save('show', ok(work, ['show', child.id, '--json', '--include-dependents', '--include-comments']))

  save('close', ok(work, ['close', blocker.id, '--json', '--reason=done', actor]))
  save('delete', ok(work, ['delete', 'fx-12', '--json', '--force', actor]))
  ok(work, ['create', '--json', '--title=Ambiguous again', '--id=fx-13', actor])

  saveFailure('show-ambiguous', run(work, ['show', 'fx-1', '--json']))
  saveFailure('show-not-found', run(work, ['show', 'fx-zzzz', '--json']))
  saveFailure('list-not-initialized', run(empty, ['list', '--json']))
  saveFailure('context-not-initialized', run(empty, ['context', '--json']))
  console.log(`Wrote bd ${version} fixtures to ${outDir}`)
} finally {
  rmSync(work, { recursive: true, force: true })
  rmSync(empty, { recursive: true, force: true })
}
```

- [ ] **Step 2: Record fixtures**

Run: `node config/scripts/capture-beads-fixtures.mjs`
Expected: `Wrote bd 1.2.2 fixtures to …/__fixtures__/bd-1.2.2` and 20 JSON files. Open `show.json` and confirm it contains `"text": "-first comment"`, a `parent-child` and a `blocks` dependency. If `show-ambiguous.json` has `exitCode` 0 (the prefix resolved uniquely), change the ids `fx-11`/`fx-13` in the script to `fx-a11`/`fx-a12`, query `fx-a1`, and re-run.

- [ ] **Step 3: Write the recorded-fixture test**

`src/main/beads/beads-recorded-fixtures.test.ts`:
```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  normalizeBeadsIssue,
  normalizeBeadsIssueDetails
} from '../../shared/beads/beads-issue-normalize'
import { normalizeBeadsStatuses, normalizeBeadsTypes } from '../../shared/beads/beads-schema'
import { parseBdJson, parseBdJsonList, parseBdJsonRecord } from './bd-json'
import { normalizeBeadsContext } from './beads-context'
import { classifyBdFailure } from './beads-error'

const FIXTURE_DIR = join(__dirname, '__fixtures__', 'bd-1.2.2')

function fixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.json`), 'utf8')
}

type RecordedFailure = { stdout: string; stderr: string; exitCode: number }

function failure(name: string): RecordedFailure {
  const parsed: RecordedFailure = JSON.parse(fixture(name))
  return parsed
}

function classify(name: string): string {
  const recorded = failure(name)
  return classifyBdFailure({
    stdout: recorded.stdout,
    stderr: recorded.stderr,
    exitCode: recorded.exitCode,
    spawnFailed: false,
    hostOffline: false,
    timedOut: false
  }).kind
}

describe('recorded bd 1.2.2 output', () => {
  it('normalizes every list-shaped command without dropping rows', () => {
    for (const name of ['list', 'ready', 'blocked', 'search']) {
      const rows = parseBdJsonList(fixture(name))
      expect(rows.length, name).toBeGreaterThan(0)
      expect(rows.map((row) => normalizeBeadsIssue(row)).every(Boolean), name).toBe(true)
    }
  })

  it('normalizes show details with relations and a leading-dash comment', () => {
    const details = normalizeBeadsIssueDetails(parseBdJsonList(fixture('show'))[0])
    expect(details?.issue.title).toBe('-dash child')
    expect(details?.issue.parent).toBeDefined()
    expect(details?.dependencies.map((relation) => relation.dependencyType).sort()).toEqual([
      'blocks',
      'parent-child'
    ])
    expect(details?.comments.map((comment) => comment.text)).toEqual(['-first comment'])
  })

  it('reads write outputs', () => {
    expect(normalizeBeadsIssue(parseBdJsonRecord(fixture('create')))?.labels).toEqual(['ui'])
    expect(normalizeBeadsIssue(parseBdJsonList(fixture('claim'))[0])?.status).toBe('in_progress')
    expect(normalizeBeadsIssue(parseBdJsonList(fixture('close'))[0])?.closeReason).toBe('done')
    expect(parseBdJsonRecord(fixture('delete')).deleted).toBe('fx-12')
  })

  it('reads schema, context, count and change token', () => {
    const statuses = normalizeBeadsStatuses(parseBdJson(fixture('statuses')))
    expect(statuses.find((status) => status.name === 'closed')?.category).toBe('done')
    expect(normalizeBeadsTypes(parseBdJson(fixture('types'))).map((type) => type.name)).toContain(
      'epic'
    )
    expect(normalizeBeadsContext(parseBdJsonRecord(fixture('context')))?.isWorktree).toBe(false)
    expect(typeof parseBdJsonRecord(fixture('count')).count).toBe('number')
    expect(typeof parseBdJsonRecord(fixture('vc-status')).commit).toBe('string')
  })

  it('classifies recorded failures', () => {
    expect(classify('show-ambiguous')).toBe('ambiguous-id')
    expect(classify('show-not-found')).toBe('not-found')
    expect(classify('list-not-initialized')).toBe('not-initialized')
    expect(classify('context-not-initialized')).toBe('not-initialized')
  })
})
```

- [ ] **Step 4: Run the test**

Run: `pnpm test src/main/beads/beads-recorded-fixtures.test.ts`
Expected: PASS. A failure here means real bd output differs from the assumptions in Tasks 3–6: fix the normalizer or classifier (and its unit test) to match the recorded output, never the fixture.

- [ ] **Step 5: Commit**

```bash
git add config/scripts/capture-beads-fixtures.mjs src/main/beads/__fixtures__ src/main/beads/beads-recorded-fixtures.test.ts
git commit -m "test(beads): record bd 1.2.2 output and check parsers against it

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Real-bd integration test

**Files:**
- Test: `src/main/beads/beads-bd-integration.test.ts`

**Interfaces:**
- Consumes: read and write services (Tasks 8–9), `commandExecFileAsync` from `../git/runner`.

The suite runs only with `ORCA_BEADS_INTEGRATION=1`, so CI without bd skips it deterministically.

- [ ] **Step 1: Write the test**

`src/main/beads/beads-bd-integration.test.ts`:
```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commandExecFileAsync } from '../git/runner'
import type { BeadsExecutionTarget } from './beads-executor'
import {
  getBeadsChangeToken,
  getBeadsIssueDetails,
  getBeadsSchema,
  getBeadsWorkspaceStatus,
  listBeadsIssues
} from './beads-read-service'
import {
  addBeadsComment,
  claimBeadsIssue,
  closeBeadsIssue,
  createBeadsIssue,
  updateBeadsIssue
} from './beads-write-service'

const ACTOR = 'orca-itest'

async function exec(cwd: string, command: string, args: string[]): Promise<void> {
  await commandExecFileAsync(command, args, { cwd, timeout: 30_000 })
}

describe.runIf(process.env.ORCA_BEADS_INTEGRATION === '1')('beads backend against real bd', () => {
  let repoDir = ''
  let emptyDir = ''
  let target: BeadsExecutionTarget

  beforeAll(async () => {
    repoDir = await mkdtemp(join(tmpdir(), 'orca-beads-itest-'))
    emptyDir = await mkdtemp(join(tmpdir(), 'orca-beads-empty-'))
    await exec(repoDir, 'git', ['init', '-q'])
    await exec(repoDir, 'git', ['config', 'user.name', 'Orca Test'])
    await exec(repoDir, 'git', ['config', 'user.email', 'test@example.com'])
    await exec(repoDir, 'bd', ['init', '--prefix=itest', '--non-interactive', '--skip-hooks', '--skip-agents', '-q'])
    await exec(repoDir, 'bd', ['create', '--json', '--title=Ambiguous a', '--id=itest-a11'])
    await exec(repoDir, 'bd', ['create', '--json', '--title=Ambiguous b', '--id=itest-a12'])
    target = { repoPath: repoDir, connectionId: null }
  }, 60_000)

  afterAll(async () => {
    await rm(repoDir, { recursive: true, force: true })
    await rm(emptyDir, { recursive: true, force: true })
  })

  it('reports workspace status and schema', async () => {
    const status = await getBeadsWorkspaceStatus(target)
    expect(status).toMatchObject({ initialized: true, versionSupported: true })
    expect(status.beadsDir).toContain(repoDir.split('/').pop())
    const schema = await getBeadsSchema(target)
    expect(schema.statuses.find((entry) => entry.name === 'closed')?.category).toBe('done')
    const empty = await getBeadsWorkspaceStatus({ repoPath: emptyDir, connectionId: null })
    expect(empty.initialized).toBe(false)
  })

  it('runs the full issue lifecycle', async () => {
    const tokenBefore = await getBeadsChangeToken(target)
    const epic = await createBeadsIssue(target, { title: 'Epic', issueType: 'epic' }, ACTOR)
    const child = await createBeadsIssue(
      target,
      { title: '-leading dash', parent: epic.issue.id, labels: ['ui'], description: 'first' },
      ACTOR
    )
    expect(child.issue.title).toBe('-leading dash')
    expect(child.dependencies.map((relation) => relation.dependencyType)).toContain('parent-child')
    expect(await getBeadsChangeToken(target)).not.toBe(tokenBefore)

    const children = await listBeadsIssues(target, {
      view: 'list',
      filter: { parent: epic.issue.id },
      limit: 200
    })
    expect(children.issues.map((issue) => issue.id)).toEqual([child.issue.id])

    const updated = await updateBeadsIssue(
      target,
      child.issue.id,
      { priority: 0, addLabels: ['backend'], description: '' },
      ACTOR
    )
    expect(updated.issue.priority).toBe(0)
    expect(updated.issue.labels.sort()).toEqual(['backend', 'ui'])
    expect(updated.issue.description).toBeUndefined()

    const claimed = await claimBeadsIssue(target, child.issue.id, ACTOR)
    expect(claimed.issue).toMatchObject({ status: 'in_progress', assignee: ACTOR })

    const commented = await addBeadsComment(target, child.issue.id, '-dash comment', ACTOR)
    expect(commented.comments.map((comment) => comment.text)).toEqual(['-dash comment'])

    const closed = await closeBeadsIssue(target, child.issue.id, 'done', ACTOR)
    expect(closed.issue).toMatchObject({ status: 'closed', closeReason: 'done' })

    const open = await listBeadsIssues(target, { view: 'list', filter: {}, limit: 200 })
    expect(open.issues.some((issue) => issue.id === child.issue.id)).toBe(false)
    const all = await listBeadsIssues(target, { view: 'list', filter: { includeClosed: true }, limit: 200 })
    expect(all.issues.some((issue) => issue.id === child.issue.id)).toBe(true)
  }, 60_000)

  it('classifies ambiguous and unknown ids', async () => {
    await expect(getBeadsIssueDetails(target, 'itest-a1')).rejects.toMatchObject({
      kind: 'ambiguous-id'
    })
    await expect(getBeadsIssueDetails(target, 'itest-zzzz')).rejects.toMatchObject({
      kind: 'not-found'
    })
  })
})
```

- [ ] **Step 2: Run it**

Run: `ORCA_BEADS_INTEGRATION=1 pnpm test src/main/beads/beads-bd-integration.test.ts`
Expected: PASS (3 tests). Then run `pnpm test src/main/beads/beads-bd-integration.test.ts` without the variable and expect the suite to be skipped.
If clearing the description fails (`description` still `'first'`, or bd rejects the empty value), check `bd update --help` for the clearing flag in the installed version, fix `textFlags` in `beads-write-args.ts` plus its unit test, and re-run.

- [ ] **Step 3: Commit**

```bash
git add src/main/beads/beads-bd-integration.test.ts
git commit -m "test(beads): exercise the backend against a real bd repository

Opt-in with ORCA_BEADS_INTEGRATION=1.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Performance measurement at 3k issues

**Files:**
- Create: `config/scripts/measure-beads-performance.mjs`
- Create (fork-only doc, force-added): `docs/superpowers/specs/2026-09-15-beads-performance.md`

**Interfaces:**
- Consumes: the bd CLI only. Produces a markdown table on stdout.

- [ ] **Step 1: Write the script**

`config/scripts/measure-beads-performance.mjs`:
```js
#!/usr/bin/env node
// Measures the bd calls Orca makes against a generated database.
// Usage: node config/scripts/measure-beads-performance.mjs [issueCount=3000] [runs=5]
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

const issueCount = Number.parseInt(process.argv[2] ?? '3000', 10)
const runs = Number.parseInt(process.argv[3] ?? '5', 10)
const work = mkdtempSync(join(tmpdir(), 'orca-beads-perf-'))

function bd(args, input) {
  const result = spawnSync('bd', args, { cwd: work, encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024 })
  if (result.status !== 0) {
    throw new Error(`bd ${args.join(' ')} failed: ${result.stderr}`)
  }
  return result.stdout
}

function timeOnce(args) {
  const start = performance.now()
  bd(args)
  return performance.now() - start
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function timeParallel(args, count) {
  const start = performance.now()
  return Promise.all(
    Array.from({ length: count }, () => new Promise((resolve, reject) => {
      const child = spawn('bd', args, { cwd: work, stdio: 'ignore' })
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
    }))
  ).then(() => performance.now() - start)
}

try {
  execFileSync('git', ['init', '-q'], { cwd: work })
  bd(['init', '--prefix=perf', '--non-interactive', '--skip-hooks', '--skip-agents', '-q'])
  const types = ['task', 'bug', 'feature', 'chore']
  const lines = Array.from({ length: issueCount }, (_, index) =>
    JSON.stringify({
      title: `Generated issue ${index} playtest`,
      issue_type: types[index % types.length],
      priority: index % 5,
      status: index % 7 === 0 ? 'closed' : 'open',
      labels: [`area-${index % 12}`]
    })
  )
  const importStart = performance.now()
  bd(['import', '-'], `${lines.join('\n')}\n`)
  const importMs = performance.now() - importStart
  const sampleId = JSON.parse(bd(['list', '--json', '--limit=1']))[0].id

  const cases = [
    ['version', ['version']],
    ['context', ['context', '--json']],
    ['vc status', ['vc', 'status', '--json']],
    ['statuses', ['statuses', '--json']],
    ['list (201)', ['list', '--json', '--limit=201']],
    ['list all (2001)', ['list', '--json', '--all', '--limit=2001']],
    ['ready (201)', ['ready', '--json', '--limit=201']],
    ['blocked', ['blocked', '--json']],
    ['search (201)', ['search', '--json', '--query=playtest', '--limit=201']],
    ['count', ['count', '--json']],
    ['show', ['show', sampleId, '--json', '--include-dependents', '--include-comments']]
  ]
  console.log(`bd ${bd(['version']).trim()} — ${issueCount} issues, median of ${runs} runs`)
  console.log(`import: ${importMs.toFixed(0)} ms\n`)
  console.log('| command | median ms | max ms |')
  console.log('|---|---:|---:|')
  for (const [label, args] of cases) {
    const samples = Array.from({ length: runs }, () => timeOnce(args))
    console.log(`| ${label} | ${median(samples).toFixed(0)} | ${Math.max(...samples).toFixed(0)} |`)
  }
  const parallelMs = await timeParallel(['list', '--json', '--limit=201'], 6)
  console.log(`| 6 × list (201) in parallel, wall | ${parallelMs.toFixed(0)} | – |`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
```

- [ ] **Step 2: Run it**

Run: `node config/scripts/measure-beads-performance.mjs 3000 5 | tee /tmp/beads-perf.txt`
Expected: a markdown table. If `bd import -` rejects a field (for example `status` or `labels`), remove that field from the generated lines and re-run; note the removal in the results doc.

- [ ] **Step 3: Record results and apply the spec rule**

Create `docs/superpowers/specs/2026-09-15-beads-performance.md` containing the date, machine (`sysctl -n machdep.cpu.brand_string`), bd version, the table from `/tmp/beads-perf.txt`, and a conclusion that applies spec §9:
- If `list (201)` median is ≤ 1000 ms: "No change needed before M2."
- If it is > 1000 ms: create a follow-up bead before M2 with
  `bd create --type=task --priority=1 --parent=orca-q11 --title="Reduce beads list latency before M2" --description="<numbers>; options: bd list --skip-labels for tree rows, smaller first page (100), slower hidden polling"` and link it: `bd dep add orca-q11.3 <new-id>`.

- [ ] **Step 4: Commit**

```bash
git add config/scripts/measure-beads-performance.mjs
git add -f docs/superpowers/specs/2026-09-15-beads-performance.md
git commit -m "chore(beads): measure bd latency on a 3k-issue database

The script is product tooling; the results doc is fork-only (docs/** is
ignored upstream).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Quality gates, spec update and milestone close

**Files:**
- Modify (fork-only, force-added): `docs/superpowers/specs/2026-09-15-beads-task-source-design.md`

- [ ] **Step 1: Run every gate**

Run:
```bash
pnpm format
pnpm tc
pnpm lint
pnpm test src/shared/beads src/main/beads src/main/runtime/runtime-beads-commands.test.ts src/main/runtime/rpc/methods/beads.test.ts
ORCA_BEADS_INTEGRATION=1 pnpm test src/main/beads/beads-bd-integration.test.ts
pnpm test src/shared/child-process
```
Expected: all exit 0. Fix lint findings in place (common ones: import order from `pnpm format`, a missing `SAFETY:` comment, `max-lines` — split the file along the lines named in Task 8 Step 6). If `pnpm format` changed files, commit them as `style(beads): format`.

- [ ] **Step 2: Manual check against a real repo**

With `pnpm dev` running and baumoscan registered in the dev app, open DevTools in the Orca window and run:
```js
await window.api.beads.getStatus({ repoPath: '/Users/sebastianseubert/Developer/baumoscan' })
await window.api.beads.listIssues({ repoPath: '/Users/sebastianseubert/Developer/baumoscan', request: { view: 'ready', filter: {}, limit: 5 } })
await window.api.beads.getIssueDetails({ repoPath: '/Users/sebastianseubert/Developer/baumoscan', id: 'baumoscan-cwf.3' })
await window.api.beads.getStatus({ repoPath: '/etc' })
```
Expected: `ok: true` with `initialized: true`; five ready issues with `hasMore: true`; details with a `blocks` dependency; the last call returns `ok: false` with `Access denied: unknown repository path`. Only read calls — do not write to baumoscan.

- [ ] **Step 3: Update the spec with the deviations**

In `docs/superpowers/specs/2026-09-15-beads-task-source-design.md`:
- §3 architecture block: replace `change-watcher.ts  polls the bd vc status --json commit hash` with `read service getChangeToken  bd vc status --json commit hash; renderer polls it (M2)`.
- §3.2: remove `graph`, `gateList`, `gateResolve`, `depAdd`, `depRemove`, `duplicate`, `supersede`, `batch` from the M1 table and add a line "Dependencies, graph and gates: M5 plan."
- §3.3: replace the watcher paragraph with "The renderer polls `getChangeToken` every 5 s while a beads view is visible and every 60 s otherwise; main invalidates its schema cache when the token changes."
- §4.3 New issue: replace "Saved as a single `batch` call" with "Saved with one `bd create` call (it accepts parent, labels and dependencies directly)."
- §6 table: `not-initialized` detection gains "`no .beads directory found`"; `ambiguous-id` detection becomes "`ambiguous ID` on stderr (bd prints the not-found JSON for both)"; add row `invalid-input` | argv validation or unregistered repo | inline message.
- §9: add the measured numbers link `2026-09-15-beads-performance.md`.

```bash
git add -f docs/superpowers/specs/2026-09-15-beads-task-source-design.md
git commit -m "docs(fork): record M1 deviations in the beads design spec

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Close the milestone**

```bash
bd close orca-q11.2 --reason="Backend: command table, executor (local/WSL/SSH), queue, context, schema, change token, IPC + runtime RPC, fixtures, integration test, perf measured"
bd ready
```
Expected: `orca-q11.3` (M2) is ready (unless a latency follow-up from Task 15 blocks it).

- [ ] **Step 5: Hand off**

Report: commits made on `beads`, gate results, performance conclusion, and that nothing was pushed. Suggested next commands for the user: `git push -u origin beads` (fork), then write the M2 plan.

