#!/usr/bin/env node
// Records real bd --json output into src/main/beads/__fixtures__/bd-<version>/.
// Runs only against a throwaway repo it creates in the OS temp dir.
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..', '..')
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

// Why: `bd context` embeds the throwaway repo's real mkdtemp path (machine- and
// run-specific); replace it with a stable, neutral placeholder before committing.
function scrubContextPaths(json, workDir) {
  const placeholder = '/tmp/orca-beads-fixtures'
  return json.split(workDir).join(placeholder)
}

try {
  execFileSync('git', ['init', '-q'], { cwd: work })
  execFileSync('git', ['config', 'user.name', 'Orca Fixtures'], { cwd: work })
  execFileSync('git', ['config', 'user.email', 'fixtures@example.com'], { cwd: work })
  ok(work, ['init', '--prefix=fx', '--non-interactive', '--skip-hooks', '--skip-agents', '-q'])
  const actor = '--actor=orca-fixtures'

  const epic = JSON.parse(
    ok(work, ['create', '--json', '--title=Epic', '--type=epic', '--priority=1', actor])
  )
  const createOut = ok(work, [
    'create',
    '--json',
    '--title=-dash child',
    '--type=task',
    `--parent=${epic.id}`,
    '--labels=ui',
    '--description=desc',
    '--design=design',
    '--acceptance=acc',
    '--notes=notes',
    actor
  ])
  save('create', createOut)
  const child = JSON.parse(createOut)
  const blocker = JSON.parse(ok(work, ['create', '--json', '--title=Blocker', actor]))
  ok(work, ['dep', 'add', child.id, blocker.id, actor])
  ok(work, ['create', '--json', '--title=Ambiguous one', '--id=fx-11', actor])
  ok(work, ['create', '--json', '--title=Ambiguous two', '--id=fx-12', actor])

  save(
    'update',
    ok(work, ['update', blocker.id, '--json', '--priority=0', '--add-label=backend', actor])
  )
  save('claim', ok(work, ['update', blocker.id, '--json', '--claim', actor]))
  ok(work, ['comment', child.id, '--json', actor, '--', '-first comment'])

  save('context', scrubContextPaths(ok(work, ['context', '--json']), realpathSync(work)))
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
