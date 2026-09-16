import { isBeadsIssueId } from '../../shared/beads/beads-issue-id'
import type { WorkspaceLinkedItem } from '../../shared/worktree/types'
import { RuntimeClientError } from '../runtime-client'

export type BeadsIssueLinkUpdates = {
  linkedWorkItem: WorkspaceLinkedItem | null
}

export function getOptionalBeadsIssueLinkFlag(
  flags: Map<string, string | boolean>,
  name: string,
  options: { allowNull?: boolean } = {}
): BeadsIssueLinkUpdates | undefined {
  const value = getPresentStringFlag(flags, name)
  if (value === undefined) {
    return undefined
  }

  if (value.trim().toLowerCase() === 'null') {
    if (!options.allowNull) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Omit --beads-issue on create, or pass a bead id.'
      )
    }
    return { linkedWorkItem: null }
  }

  const id = value.trim()
  if (!isBeadsIssueId(id)) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Pass a valid bead id for --beads-issue, or null to clear.'
    )
  }

  // Why: the CLI does not fetch the bead's title (offline-safe); the id stands
  // in for it. The URL carries no repo segment — repoId is a separate field on
  // WorkspaceLinkedItem and nothing parses this URL, so the server fills it in.
  return {
    linkedWorkItem: {
      provider: 'beads',
      type: 'issue',
      number: 0,
      title: id,
      url: `bd://${id}`,
      beadsIdentifier: id
    }
  }
}

function getPresentStringFlag(
  flags: Map<string, string | boolean>,
  name: string
): string | undefined {
  if (!flags.has(name)) {
    return undefined
  }
  const value = flags.get(name)
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  throw new RuntimeClientError('invalid_argument', `Missing value for --${name}`)
}
