import type { RuntimeBeadsCommands } from './runtime-beads-commands'

type BeadsCommandName = Exclude<keyof RuntimeBeadsCommands, 'constructor'>

export type RuntimeBeadsCommandSurface = Pick<RuntimeBeadsCommands, BeadsCommandName>

export function installRuntimeBeadsCommandSurface(
  target: RuntimeBeadsCommandSurface,
  commands: RuntimeBeadsCommands
): void {
  Object.assign(target, {
    beadsGetStatus: commands.beadsGetStatus.bind(commands),
    beadsGetSchema: commands.beadsGetSchema.bind(commands),
    beadsGetChangeToken: commands.beadsGetChangeToken.bind(commands),
    beadsListIssues: commands.beadsListIssues.bind(commands),
    beadsCountIssues: commands.beadsCountIssues.bind(commands),
    beadsGetIssueDetails: commands.beadsGetIssueDetails.bind(commands),
    beadsCreateIssue: commands.beadsCreateIssue.bind(commands),
    beadsUpdateIssue: commands.beadsUpdateIssue.bind(commands),
    beadsClaimIssue: commands.beadsClaimIssue.bind(commands),
    beadsCloseIssue: commands.beadsCloseIssue.bind(commands),
    beadsReopenIssue: commands.beadsReopenIssue.bind(commands),
    beadsDeferIssue: commands.beadsDeferIssue.bind(commands),
    beadsUndeferIssue: commands.beadsUndeferIssue.bind(commands),
    beadsDeleteIssue: commands.beadsDeleteIssue.bind(commands),
    beadsAddComment: commands.beadsAddComment.bind(commands)
  } satisfies RuntimeBeadsCommandSurface)
}
