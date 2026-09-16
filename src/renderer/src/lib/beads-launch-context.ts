import type { TaskProvider } from '../../../shared/task-providers'
import { escapeLinkedContextControlChars } from './linked-context-control-chars'
import type { LinkedWorkItemContext } from './linked-work-item-context'

export function isBeadsWorkItemReference(
  args:
    | { provider?: TaskProvider; beadsIdentifier?: string; linkedContext?: LinkedWorkItemContext }
    | null
    | undefined
): boolean {
  return (
    args?.provider === 'beads' ||
    Boolean(args?.beadsIdentifier?.trim()) ||
    args?.linkedContext?.provider === 'beads'
  )
}

export type BeadsLaunchContextArgs = {
  identifier: string | undefined
  title?: string
}

// Why: a bead title is user-authored text heading an agent prompt; escape
// control chars so an embedded newline cannot inject fake instructions.
export function buildBeadsLaunchContextBlock(args: BeadsLaunchContextArgs): string | null {
  const identifier = args.identifier?.trim()
  if (!identifier) {
    return null
  }
  const safeIdentifier = escapeLinkedContextControlChars(identifier)
  const title = escapeLinkedContextControlChars(args.title?.trim() ?? '')
  const summary = title
    ? `Linked Beads issue: ${safeIdentifier} — ${title}`
    : `Linked Beads issue: ${safeIdentifier}`
  return [
    summary,
    `Read it with \`bd show ${safeIdentifier}\` (run \`bd prime\` for workflow context).`
  ].join('\n')
}
