import { resolve } from 'node:path'
import type { Repo } from '../../shared/repo-types'
import type { Store } from '../persistence'
import { BeadsError } from './beads-error'
import type { BeadsExecutionTarget } from './beads-executor'

export type BeadsRepoRegistry = Pick<Store, 'getRepo' | 'getRepos'>

// Why: mirror gitlab-repo-access — main-process handlers must never run bd in a
// directory the user has not registered as a repo (filesystem-auth boundary).
// Why lookup is by id only: a path-only search could pick a same-path repo on
// another host (an SSH /srv/repo and a local C:\srv\repo resolve alike).
export function findRegisteredBeadsRepo(
  registry: BeadsRepoRegistry,
  repoPath: string,
  repoId: string
): Repo {
  const resolvedPath = resolve(repoPath)
  const id = repoId.trim()
  const repo = id ? registry.getRepo(id) : undefined
  if (!repo || resolve(repo.path) !== resolvedPath) {
    throw new BeadsError('invalid-input', 'Access denied: unknown repository path')
  }
  return repo
}

export function beadsTargetForRepo(
  repo: Repo,
  wslDistro: string | undefined
): BeadsExecutionTarget {
  return { repoPath: repo.path, connectionId: repo.connectionId ?? null, wslDistro }
}
