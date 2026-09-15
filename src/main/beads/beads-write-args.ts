import type { BeadsCreateInput, BeadsIssuePatch } from '../../shared/beads/beads-contract'
import { BeadsError } from './beads-error'
import {
  requireIssueId,
  requireLabel,
  requirePriority,
  requireSingleLine,
  requireStringList,
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
// Why: bd update has --allow-empty-description to clear a description; bd create
// has no such flag, so an empty create description must be omitted entirely.
function textFlags(fields: TextFields, options: { allowEmptyDescription: boolean }): string[] {
  const flags: string[] = []
  if (
    fields.description !== undefined &&
    (fields.description !== '' || options.allowEmptyDescription)
  ) {
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
  for (const label of requireStringList(input.labels, 'labels')) {
    args.push(`--labels=${requireLabel(label)}`)
  }
  args.push(...textFlags(input, { allowEmptyDescription: false }), ...actorFlags(actor))
  return args
}

export function buildUpdateArgs(
  id: string,
  patch: BeadsIssuePatch,
  actor: string | null
): string[] {
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
  for (const label of requireStringList(patch.addLabels, 'labels to add')) {
    args.push(`--add-label=${requireLabel(label)}`)
  }
  for (const label of requireStringList(patch.removeLabels, 'labels to remove')) {
    args.push(`--remove-label=${requireLabel(label)}`)
  }
  args.push(...textFlags(patch, { allowEmptyDescription: true }))
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
  return [
    'comment',
    requireIssueId(id),
    '--json',
    ...actorFlags(actor),
    '--',
    requireText(text, 'comment')
  ]
}
