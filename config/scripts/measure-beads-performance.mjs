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
  const result = spawnSync('bd', args, {
    cwd: work,
    encoding: 'utf8',
    input,
    maxBuffer: 256 * 1024 * 1024
  })
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
    Array.from(
      { length: count },
      () =>
        new Promise((resolve, reject) => {
          const child = spawn('bd', args, { cwd: work, stdio: 'ignore' })
          child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
        })
    )
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
