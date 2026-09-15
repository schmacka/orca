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
