import type {
  BeadsCreateInput,
  BeadsDeleteOutcome,
  BeadsIssuePage,
  BeadsIssuePatch,
  BeadsListFilter,
  BeadsListRequest,
  BeadsResult
} from '../../shared/beads/beads-contract'
import type {
  BeadsIssueDetails,
  BeadsSchema,
  BeadsWorkspaceStatus
} from '../../shared/beads/beads-issue-types'
import type { Repo } from '../../shared/repo-types'
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
import { beadsTargetForRepo } from '../beads/beads-repo-target'
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

type LocalGitArgs = [] | [{ wslDistro?: string }]

export type RuntimeBeadsCommandsDeps = {
  resolveRepo: (selector: string) => Promise<Repo>
  getLocalGitArgs: (repo: Repo) => LocalGitArgs
}

type Details = Promise<BeadsResult<BeadsIssueDetails>>

export class RuntimeBeadsCommands {
  constructor(private readonly deps: RuntimeBeadsCommandsDeps) {}

  private async resolveTarget(selector: string): Promise<BeadsExecutionTarget> {
    const repo = await this.deps.resolveRepo(selector)
    const [localOptions] = this.deps.getLocalGitArgs(repo)
    return beadsTargetForRepo(repo, localOptions?.wslDistro)
  }

  beadsGetStatus(repo: string): Promise<BeadsResult<BeadsWorkspaceStatus>> {
    return captureBeadsResult(async () => getBeadsWorkspaceStatus(await this.resolveTarget(repo)))
  }

  beadsGetSchema(repo: string): Promise<BeadsResult<BeadsSchema>> {
    return captureBeadsResult(async () => getBeadsSchema(await this.resolveTarget(repo)))
  }

  beadsGetChangeToken(repo: string): Promise<BeadsResult<string>> {
    return captureBeadsResult(async () => getBeadsChangeToken(await this.resolveTarget(repo)))
  }

  beadsListIssues(repo: string, request: BeadsListRequest): Promise<BeadsResult<BeadsIssuePage>> {
    return captureBeadsResult(async () => listBeadsIssues(await this.resolveTarget(repo), request))
  }

  beadsCountIssues(repo: string, filter: BeadsListFilter): Promise<BeadsResult<number>> {
    return captureBeadsResult(async () => countBeadsIssues(await this.resolveTarget(repo), filter))
  }

  beadsGetIssueDetails(repo: string, id: string): Details {
    return captureBeadsResult(async () => getBeadsIssueDetails(await this.resolveTarget(repo), id))
  }

  beadsCreateIssue(repo: string, input: BeadsCreateInput, actor: string | null): Details {
    return captureBeadsResult(async () =>
      createBeadsIssue(await this.resolveTarget(repo), input, actor)
    )
  }

  beadsUpdateIssue(
    repo: string,
    id: string,
    patch: BeadsIssuePatch,
    actor: string | null
  ): Details {
    return captureBeadsResult(async () =>
      updateBeadsIssue(await this.resolveTarget(repo), id, patch, actor)
    )
  }

  beadsClaimIssue(repo: string, id: string, actor: string | null): Details {
    return captureBeadsResult(async () =>
      claimBeadsIssue(await this.resolveTarget(repo), id, actor)
    )
  }

  beadsCloseIssue(repo: string, id: string, reason: string, actor: string | null): Details {
    return captureBeadsResult(async () =>
      closeBeadsIssue(await this.resolveTarget(repo), id, reason, actor)
    )
  }

  beadsReopenIssue(repo: string, id: string, reason: string | null, actor: string | null): Details {
    return captureBeadsResult(async () =>
      reopenBeadsIssue(await this.resolveTarget(repo), id, reason, actor)
    )
  }

  beadsDeferIssue(repo: string, id: string, until: string | null, actor: string | null): Details {
    return captureBeadsResult(async () =>
      deferBeadsIssue(await this.resolveTarget(repo), id, until, actor)
    )
  }

  beadsUndeferIssue(repo: string, id: string, actor: string | null): Details {
    return captureBeadsResult(async () =>
      undeferBeadsIssue(await this.resolveTarget(repo), id, actor)
    )
  }

  beadsDeleteIssue(
    repo: string,
    id: string,
    actor: string | null
  ): Promise<BeadsResult<BeadsDeleteOutcome>> {
    return captureBeadsResult(async () =>
      deleteBeadsIssue(await this.resolveTarget(repo), id, actor)
    )
  }

  beadsAddComment(repo: string, id: string, text: string, actor: string | null): Details {
    return captureBeadsResult(async () =>
      addBeadsComment(await this.resolveTarget(repo), id, text, actor)
    )
  }
}
