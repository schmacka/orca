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
  ipcMain.handle(channel, (_event, args: TArgs): Promise<BeadsResult<TValue>> =>
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
