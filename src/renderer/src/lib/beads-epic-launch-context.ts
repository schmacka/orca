import { BEADS_LIST_PAGE_SIZE } from '../../../shared/beads/beads-contract'
import {
  beadsListIssues,
  type BeadsRepoRef,
  type BeadsRuntimeSettings
} from '@/runtime/runtime-beads-client'
import { escapeLinkedContextControlChars } from './linked-context-control-chars'
import type { LinkedWorkItemContext } from './linked-work-item-context'

export type BeadsEpicPromptEpic = { id: string; title: string }
export type BeadsEpicPromptChild = { id: string; title: string }

// Why: an epic's ready children are untrusted prose heading an agent prompt; escape
// control chars the same way buildBeadsLaunchContextBlock does for a single issue
// (linked-context-control-chars.ts is the shared escaper — do not duplicate it here).
export function buildBeadsEpicPromptBlock(
  epic: BeadsEpicPromptEpic,
  children: readonly BeadsEpicPromptChild[]
): string {
  const safeEpicId = escapeLinkedContextControlChars(epic.id)
  const safeEpicTitle = escapeLinkedContextControlChars(epic.title)
  const header = `Linked Beads epic: ${safeEpicId} — ${safeEpicTitle}`
  if (children.length === 0) {
    return [
      header,
      `No children are ready right now; check with \`bd ready --parent ${safeEpicId}\`.`
    ].join('\n')
  }
  const lines = children.map(
    (child) =>
      `- ${escapeLinkedContextControlChars(child.id)} — ${escapeLinkedContextControlChars(child.title)}`
  )
  return [
    header,
    'Ready children:',
    ...lines,
    'Read any of them with `bd show <id>` (run `bd prime` for workflow context).'
  ].join('\n')
}

export type BeadsEpicLinkedContextSource = {
  repo: BeadsRepoRef
  epic: BeadsEpicPromptEpic
}

// Why: the one function a composer hook calls for this — it owns the bd lookup and
// the block assembly so the composer itself never learns how to talk to bd. Never
// throws: a failed or unreachable lookup resolves to null so the caller can leave
// the plain single-issue prompt in place (spec §5.1 item 2 — saving never waits on bd).
export async function fetchBeadsEpicLinkedContext(
  settings: BeadsRuntimeSettings,
  source: BeadsEpicLinkedContextSource
): Promise<LinkedWorkItemContext | null> {
  const result = await beadsListIssues(settings, source.repo, {
    view: 'ready',
    filter: { parent: source.epic.id },
    limit: BEADS_LIST_PAGE_SIZE
  })
  if (!result.ok) {
    return null
  }
  return {
    provider: 'beads',
    version: 1,
    renderedText: buildBeadsEpicPromptBlock(source.epic, result.value.issues)
  }
}
