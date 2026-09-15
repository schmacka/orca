# Beads M0 — Fork Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `schmacka/orca` fork build and run locally, package as a side-by-side "Orca Beads" app that never installs upstream updates, and run CI on the `beads` branch.

**Architecture:** No product code. A toolchain baseline, one fork-only packaging commit, and one fork-only CI workflow. Fork-only commits are prefixed `chore(fork):` or `docs(fork):` so they can be dropped from the upstream PR after M3.

**Tech Stack:** Node 24, pnpm 12 (via corepack), Electron + electron-vite, electron-builder, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-beads-task-source-design.md` (§10, §11 M0)

**Beads issue:** `orca-q11.1` (claim with `bd update orca-q11.1 --claim` before starting, close when done).

## Global Constraints

- Repo: `~/Developer/orca`, branch `beads`. Never commit to `main`. Never push to `upstream` (push URL is `DISABLED`).
- Fork identity: `appId` `dev.porcus3d.orca-beads`, `productName` `Orca Beads`.
- Fork-only commits must touch only packaging/CI/docs files, never beads product code.
- Commit trailers: use the attribution lines the executing session is given (at the time of writing: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` plus `Claude-Session: https://claude.ai/code/session_016WpdEv8mKGKnbFSPk884i5`). The commit messages below show only the first line for brevity.
- Orca ignores `docs/**`; docs for the fork are added with `git add -f`.

---

### Task 1: Toolchain baseline

**Files:** none changed.

- [ ] **Step 1: Enable pnpm 12 through corepack**

Run:
```bash
corepack enable
corepack prepare pnpm@12.0.0 --activate
pnpm -v
```
Expected: `12.0.0`. If `corepack enable` fails with a permission error, run `corepack enable --install-directory ~/.local/bin` and retry `pnpm -v`.

- [ ] **Step 2: Install dependencies**

Run: `cd ~/Developer/orca && pnpm install`
Expected: completes without `ERR_PNPM`. Native module builds may take several minutes.

- [ ] **Step 3: Typecheck baseline**

Run: `pnpm tc`
Expected: exit 0. If it fails on untouched `main`, stop and report the first error — the baseline must be green before any beads work.

- [ ] **Step 4: Unit test smoke**

Run: `pnpm test src/main/runtime/rpc/methods/jira.test.ts`
Expected: PASS.

- [ ] **Step 5: Dev app launch**

Run: `pnpm dev`
Expected: the Orca window opens using `orca-dev` userData (dev default). Close it with Cmd+Q. No commit for this task.

---

### Task 2: Fork-only packaging identity and update policy

**Files:**
- Create: `src/main/updater/fork-update-policy.ts`
- Modify: `src/main/updater/updater-setup.ts` (the `if (is.dev) { return }` block before `const autoUpdater = this.getAutoUpdater()`)
- Modify: `config/electron-builder.config.cjs` (`appId` ~line 67, `productName`/`protocols` ~164-165, `executableName` ~410 and ~573, `publish.owner` ~658-663)
- Modify: `src/shared/agent-feature-install-commands.ts:3`

**Interfaces:**
- Produces: `FORK_AUTO_UPDATE_DISABLED: true` exported from `src/main/updater/fork-update-policy.ts`.

- [ ] **Step 1: Add the update policy constant**

Create `src/main/updater/fork-update-policy.ts`:
```ts
// Why: this is the schmacka/orca fork ("Orca Beads"). Upstream releases carry a
// different appId and would replace the fork if installed, so the fork never
// checks the stablyai release feed. Drop this file when upstreaming.
export const FORK_AUTO_UPDATE_DISABLED = true
```

- [ ] **Step 2: Guard auto-update setup**

In `src/main/updater/updater-setup.ts`, add the import next to the other local imports:
```ts
import { FORK_AUTO_UPDATE_DISABLED } from './fork-update-policy'
```
and directly after the existing block
```ts
    if (is.dev) {
      return
    }
```
insert:
```ts
    if (FORK_AUTO_UPDATE_DISABLED) {
      return
    }
```

- [ ] **Step 3: Change packaging identity**

In `config/electron-builder.config.cjs`:
- `const appId = 'com.stablyai.orca'` → `const appId = 'dev.porcus3d.orca-beads'`
- `productName: 'Orca'` → `productName: 'Orca Beads'`
- `protocols: [{ name: 'Orca', schemes: ['orca'] }]` → `protocols: [{ name: 'Orca Beads', schemes: ['orca-beads'] }]` (so the fork never hijacks official `orca://` links)
- mac `executableName: 'Orca'` → `executableName: 'Orca Beads'`
- linux `executableName: 'orca-ide'` → `executableName: 'orca-beads'`
- in `publish`, `owner: 'stablyai'` → `owner: 'schmacka'`

In `src/shared/agent-feature-install-commands.ts:3`:
```ts
export const ORCA_SKILLS_REPOSITORY_URL = 'https://github.com/schmacka/orca'
```

The local-build compatibility contract must carry the same bundle id (`config/scripts/mac-build-compatibility.cjs` copies it into the app and `src/main/local-builds/local-build-candidate.ts` compares it with the running app id; `config/scripts/electron-builder-config.test.mjs` asserts they match):
- `src/shared/local-build-compatibility-contract.json`: `"appId": "com.stablyai.orca"` → `"appId": "dev.porcus3d.orca-beads"`
- `src/main/local-builds/local-build-compatibility-contract.test.ts:14`: `appId: 'com.stablyai.orca',` → `appId: 'dev.porcus3d.orca-beads',`

Known and accepted: with the `orca-beads` scheme, `orca://` deep links (skill-share links, `orca://pair`) keep opening official Orca, not the fork. Paste such links into the fork manually. Do not register `orca` for the fork — two apps claiming one scheme is the hijack this avoids.

- [ ] **Step 4: Verify nothing else pinned these values**

Run:
```bash
pnpm test src/main/updater src/main/local-builds src/shared/agent-feature-install-commands config/scripts/electron-builder-config.test.mjs
rg -n "ORCA_SKILLS_REPOSITORY_URL|executableName|orca-ide|com\.stablyai\.orca'" src config --glob '*.test.*'
```
Expected: tests PASS. For every remaining test that asserts the old skills URL, executable name or the packaged app id **as the value this build produces**, update the literal in the same commit. Leave tests that use `com.stablyai.orca` as an example of *another* app (for example macOS TCC or press-and-hold fixtures) unchanged.

- [ ] **Step 5: Build an unpacked app and check side-by-side identity**

Run:
```bash
pnpm build:unpack
find dist -maxdepth 3 -name "*.app" -print
defaults read "$(find dist -maxdepth 3 -name 'Orca Beads.app' -print -quit)/Contents/Info.plist" CFBundleIdentifier
```
Expected: an `Orca Beads.app` exists and the bundle identifier prints `dev.porcus3d.orca-beads`.
Then open it (`open "<path>/Orca Beads.app"`), confirm it starts, and confirm `~/Library/Application Support/Orca Beads` was created (separate from official `~/Library/Application Support/Orca`). Quit it.

- [ ] **Step 6: Commit (fork-only)**

```bash
git add src/main/updater/fork-update-policy.ts src/main/updater/updater-setup.ts config/electron-builder.config.cjs src/shared/agent-feature-install-commands.ts src/shared/local-build-compatibility-contract.json src/main/local-builds/local-build-compatibility-contract.test.ts
git status --short   # confirm only packaging files and Step 4 test-literal updates are staged or modified
git add -u src config   # only test literal updates from Step 4, if any
git commit -m "chore(fork): package as Orca Beads and disable upstream auto-update

Fork-only: drop from any upstream PR.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Fork-only CI workflow

**Files:**
- Create: `.github/workflows/fork-beads-checks.yml`

- [ ] **Step 1: Add the workflow**

Create `.github/workflows/fork-beads-checks.yml`:
```yaml
name: Fork beads checks

on:
  push:
    branches: [beads]
  workflow_dispatch:

permissions:
  contents: read

jobs:
  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          persist-credentials: false
      - uses: ./.github/actions/install-node-dependencies
      - run: pnpm run typecheck

  beads-tests:
    name: Beads unit tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
        with:
          persist-credentials: false
      - uses: ./.github/actions/install-node-dependencies
        with:
          native-runtime: node
      - run: pnpm exec vitest run --config config/vitest.config.ts --passWithNoTests src/shared/beads src/main/beads src/main/runtime/rpc/methods/beads.test.ts src/main/runtime/runtime-beads-commands.test.ts

  unit-tests:
    name: Unit tests
    uses: ./.github/workflows/unit-tests.yml
    with:
      node_versions: '["24"]'
```

- [ ] **Step 2: Validate YAML locally**

Run: `node -e "require('yaml')" 2>/dev/null && node -e "console.log(Object.keys(require('yaml').parse(require('fs').readFileSync('.github/workflows/fork-beads-checks.yml','utf8')).jobs))" || ruby -ryaml -e "p YAML.load_file('.github/workflows/fork-beads-checks.yml')['jobs'].keys"`
Expected: `[ 'typecheck', 'beads-tests', 'unit-tests' ]` (or the Ruby equivalent).

- [ ] **Step 3: Commit (fork-only)**

```bash
git add .github/workflows/fork-beads-checks.yml
git commit -m "chore(fork): add beads branch CI

Fork-only: drop from any upstream PR.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Hand off for the push**

Do not push. Report to the user: pushing `beads` to `origin` and enabling Actions on the fork (GitHub → schmacka/orca → Actions → "I understand my workflows, go ahead and enable them") are needed before CI runs. The CI "Done when" for M0 is confirmed after that push.

- [ ] **Step 5: Close the milestone issue**

After the user confirms CI is green (or explicitly defers CI):
```bash
bd close orca-q11.1 --reason="Dev build, Orca Beads packaging, fork CI in place"
```
