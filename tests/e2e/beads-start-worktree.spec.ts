/**
 * E2E: starting a worktree from a bead, end to end.
 *
 * Why: this is the milestone's main-path proof. It drives a real `bd` binary
 * against a disposable fixture repo (no bd mocking layer exists in the main
 * process — beads-executor.ts always shells out to the real CLI), lists the
 * issue through the Beads tab, opens its detail, starts a worktree from it,
 * and confirms the agent's actual launch prompt is the readable §5.1 text —
 * never the synthetic `bd://` URL that this milestone exists to remove from
 * in front of an agent.
 *
 * Why the terminal, not the store, proves the prompt: the draft launch
 * context is never persisted on the worktree (only a `pendingFirstAgentMessageRename`
 * boolean is); for `claude` it rides in on the native `--prefill` argv flag
 * (src/shared/tui-agent-config.ts) and is only otherwise observable in the
 * terminal buffer. Mirrors github-created-issue-start-prefill.spec.ts's fake
 * `claude` binary that echoes argv.
 *
 * Why a disposable repo, not the shared `testRepoPath`: `bd init` commits new
 * files (.beads/, AGENTS.md, .claude/) into the repo it runs in. The shared
 * worker-scoped fixture repo is reused across spec files in the same worker;
 * mutating its history here would risk other specs' assumptions about its
 * contents.
 */

import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Page } from '@stablyai/playwright-test'
import { test as base, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { getTerminalContent } from './helpers/terminal'

const ISSUE_TITLE = 'Fix crash on launch from a linked bead'

function bdIsAvailable(): boolean {
  try {
    execFileSync('bd', ['version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

const BD_AVAILABLE = bdIsAvailable()

// Why: a CI box without `bd` on PATH must skip this spec, not fail it — the
// module-level bd-dependent setup below must never run in that case, so every
// bd-touching step is gated behind the same BD_AVAILABLE check computed here.
// Verified by hand: the same execFileSync('bd', ['version']) probe run once
// with the real PATH (resolves) and once with PATH overridden to a
// nonexistent directory (throws ENOENT, treated as absent) — both branches
// behave as intended.
base.skip(!BD_AVAILABLE, 'bd is not installed on this host; skipping beads e2e coverage')

type BeadsFixture = {
  repoPath: string
  issueId: string
}

function runGit(repoPath: string, args: string[]): void {
  execFileSync('git', args, { cwd: repoPath, stdio: 'pipe' })
}

function createBeadsFixtureRepo(): BeadsFixture {
  const repoPath = mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-beads-'))
  runGit(repoPath, ['init'])
  runGit(repoPath, ['config', 'user.email', 'e2e@test.local'])
  runGit(repoPath, ['config', 'user.name', 'E2E Test'])
  writeFileSync(path.join(repoPath, 'README.md'), '# Beads start-worktree E2E fixture\n')
  runGit(repoPath, ['add', '-A'])
  runGit(repoPath, ['commit', '-m', 'Initial commit'])
  // Why: a repo with no git remote never settles into the Tasks page's
  // eligible-repo set (getTaskEligibleRepos), so `preselectedRepoId` would
  // silently fail to select it. Any resolvable remote counts — beads itself
  // needs none.
  runGit(repoPath, ['remote', 'add', 'origin', 'https://example.com/orca-e2e-beads.git'])

  execFileSync('bd', ['init'], {
    cwd: repoPath,
    stdio: 'pipe',
    env: { ...process.env, BD_NON_INTERACTIVE: '1' }
  })
  const createOutput = execFileSync('bd', ['create', ISSUE_TITLE, '-t', 'bug', '-p', '2'], {
    cwd: repoPath,
    stdio: 'pipe',
    encoding: 'utf8'
  })
  const match = createOutput.match(/Created issue:\s*(\S+)/)
  if (!match) {
    throw new Error(`Could not parse bead id from 'bd create' output: ${createOutput}`)
  }
  return { repoPath, issueId: match[1] }
}

const fakeClaudeSource = `
const args = process.argv.slice(2)
process.stdout.write('E2E_CLAUDE_ARGV ' + JSON.stringify(args) + '\\n')
setInterval(() => {}, 60_000)
`

function installFakeClaudeCli(dir: string): void {
  if (process.platform === 'win32') {
    writeFileSync(path.join(dir, 'fake-claude.js'), fakeClaudeSource)
    writeFileSync(path.join(dir, 'claude.cmd'), `@echo off\r\nnode "%~dp0\\fake-claude.js" %*\r\n`)
    return
  }
  const executable = path.join(dir, 'claude')
  writeFileSync(executable, `#!/usr/bin/env node\n${fakeClaudeSource}`)
  chmodSync(executable, 0o755)
}

const fakeCliDir = BD_AVAILABLE ? mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-beads-cli-')) : ''
if (BD_AVAILABLE) {
  installFakeClaudeCli(fakeCliDir)
}

const fixture = BD_AVAILABLE ? createBeadsFixtureRepo() : null

const test = base.extend({
  launchEnv: [{ PATH: `${fakeCliDir}${path.delimiter}${process.env.PATH ?? ''}` }, { option: true }]
})

test.afterAll(() => {
  if (fixture) {
    rmSync(fixture.repoPath, { recursive: true, force: true })
  }
  if (fakeCliDir) {
    rmSync(fakeCliDir, { recursive: true, force: true })
  }
})

async function addBeadsFixtureRepo(page: Page, repoPath: string): Promise<string> {
  const repoId = await page.evaluate(async (targetRepoPath) => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    const repo = await store.getState().addRepoPath(targetRepoPath)
    if (!repo) {
      throw new Error(`Failed to add repo at ${targetRepoPath}`)
    }
    return repo.id
  }, repoPath)

  // Why: openTaskPage's initial repo selection locks into useState on mount —
  // the repo must already be eligible (remote identity settled) before it is
  // called, or preselectedRepoId is silently dropped.
  await expect
    .poll(
      () =>
        page.evaluate(async (id) => {
          const store = window.__store
          if (!store) {
            return false
          }
          await store.getState().fetchRepos()
          const repo = store.getState().repos.find((candidate) => candidate.id === id)
          return repo?.gitRemoteIdentity !== undefined
        }, repoId),
      { timeout: 20_000, message: 'Fixture repo remote identity never settled' }
    )
    .toBe(true)

  return repoId
}

type LinkedBeadsWorktree = { provider: string | undefined; beadsIdentifier: string | undefined }

function findLinkedBeadsWorktree(page: Page, issueId: string): Promise<LinkedBeadsWorktree | null> {
  return page.evaluate((id) => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    const worktrees = Object.values(store.getState().worktreesByRepo).flat()
    const match = worktrees.find((worktree) => worktree.linkedWorkItem?.beadsIdentifier === id)
    return match
      ? {
          provider: match.linkedWorkItem?.provider,
          beadsIdentifier: match.linkedWorkItem?.beadsIdentifier
        }
      : null
  }, issueId)
}

test.describe('Starting a worktree from a bead', () => {
  test.beforeEach(async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)
    await orcaPage.evaluate(async () => {
      const store = window.__store
      if (!store) {
        throw new Error('window.__store is not available')
      }
      await store.getState().updateSettings({
        defaultTuiAgent: 'claude',
        disabledTuiAgents: []
      })
    })
  })

  test('lists the bead, opens its detail, and creates a worktree with a readable prompt', async ({
    orcaPage
  }) => {
    if (!fixture) {
      throw new Error('unreachable: BD_AVAILABLE guards fixture creation and test.skip above')
    }
    const { repoPath, issueId } = fixture

    const repoId = await addBeadsFixtureRepo(orcaPage, repoPath)
    await orcaPage.evaluate(
      ({ repoId }) => {
        window.__store?.getState().openTaskPage({ taskSource: 'beads', preselectedRepoId: repoId })
      },
      { repoId }
    )

    // 1. The Beads tab lists the issue from the fixture repo (real `bd ready --json`).
    const issueRow = orcaPage.getByRole('option').filter({ hasText: ISSUE_TITLE })
    await expect(issueRow).toBeVisible({ timeout: 20_000 })

    // 2. Selecting it opens the detail pane (real `bd show <id> --json`).
    await issueRow.click()
    await expect(orcaPage.getByRole('heading', { name: ISSUE_TITLE, level: 2 })).toBeVisible({
      timeout: 20_000
    })

    // 3. Start worktree opens the composer, pre-filled.
    await orcaPage.getByRole('button', { name: 'Start worktree' }).click()
    const composer = orcaPage.getByRole('dialog', { name: /Create (Workspace|Worktree)/i })
    await expect(composer).toBeVisible({ timeout: 15_000 })

    // Why not a plain [data-workspace-name-input="true"] value check: once a
    // linked work item is selected, the name field renders as the source pill
    // below instead of a text input (smart-workspace-name-input-surface.tsx) —
    // the pill *is* the "pre-filled" evidence here.
    const sourcePill = composer.locator('[data-workspace-source-pill="true"]')
    await expect(sourcePill).toContainText(issueId)
    await expect(sourcePill).toContainText(ISSUE_TITLE)

    // 4. Creating produces a worktree linked to the bead.
    const createButton = composer.getByRole('button', { name: /Create (Workspace|Worktree)/i })
    await expect(createButton).toBeEnabled()
    await createButton.click()
    await expect(composer).toBeHidden({ timeout: 20_000 })

    // Why not a single expect.poll(...).toEqual(): expect.poll's return value is
    // the assertion outcome, not the polled value — read it back afterward once
    // the poll confirms the worktree exists.
    await expect
      .poll(() => findLinkedBeadsWorktree(orcaPage, issueId), {
        timeout: 20_000,
        message: 'Created worktree never linked to the bead'
      })
      .not.toBeNull()
    const linkedWorktree = await findLinkedBeadsWorktree(orcaPage, issueId)
    expect(linkedWorktree).toEqual({ provider: 'beads', beadsIdentifier: issueId })

    // 5. The agent's draft prompt is the readable §5.1 text, never `bd://`.
    let terminalText = ''
    await expect
      .poll(
        async () => {
          terminalText = await getTerminalContent(orcaPage, 12_000)
          return terminalText
        },
        { timeout: 30_000, message: 'Beads launch prompt did not reach the active terminal buffer' }
      )
      .toContain('--prefill')
    expect(terminalText).toContain(`Linked Beads issue: ${issueId} — ${ISSUE_TITLE}`)
    expect(terminalText).toContain(`bd show ${issueId}`)
    expect(terminalText).toContain('bd prime')
    expect(terminalText).not.toContain('bd://')
  })
})
