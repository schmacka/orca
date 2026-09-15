import { classifyBdFailure } from './beads-error'
import { resolveBeadsContext } from './beads-context'
import { BeadsDbQueue } from './beads-db-queue'
import {
  BD_READ_TIMEOUT_MS,
  BD_WRITE_TIMEOUT_MS,
  beadsHostKey,
  runBd,
  type BeadsExecutionTarget
} from './beads-executor'
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
    ? queue.runShared(scope, JSON.stringify(args), execute)
    : queue.run(scope, execute)
}
