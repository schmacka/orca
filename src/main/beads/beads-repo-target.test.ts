import { describe, expect, it } from 'vitest'
import type { Repo } from '../../shared/repo-types'
import {
  beadsTargetForRepo,
  findRegisteredBeadsRepo,
  type BeadsRepoRegistry
} from './beads-repo-target'

function repo(id: string, path: string, connectionId: string | null = null): Repo {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: tests only read id, path and connectionId; the remaining Repo fields are irrelevant to target resolution.
  return { id, path, connectionId } as Repo
}

function registry(repos: Repo[]): BeadsRepoRegistry {
  return {
    getRepo: (id: string) => repos.find((candidate) => candidate.id === id),
    getRepos: () => repos
  }
}

describe('findRegisteredBeadsRepo', () => {
  it('finds a registered repo by id when the path matches, or by path without an id', () => {
    const repos = [repo('r1', '/work/a'), repo('r2', '/work/b', 'ssh-1')]
    expect(findRegisteredBeadsRepo(registry(repos), '/work/b', 'r2').id).toBe('r2')
    expect(findRegisteredBeadsRepo(registry(repos), '/work/a/', null).id).toBe('r1')
  })

  it('refuses an id whose repo lives at a different path instead of guessing', () => {
    const repos = [repo('r1', '/work/a'), repo('r2', '/work/b')]
    expect(() => findRegisteredBeadsRepo(registry(repos), '/work/b', 'r1')).toThrow(/Access denied/)
  })

  it('refuses unregistered paths', () => {
    expect(() => findRegisteredBeadsRepo(registry([]), '/etc', null)).toThrow(
      /Access denied: unknown repository path/
    )
  })
})

describe('beadsTargetForRepo', () => {
  it('carries the SSH connection and WSL distro', () => {
    expect(beadsTargetForRepo(repo('r2', '/srv/b', 'ssh-1'), undefined)).toEqual({
      repoPath: '/srv/b',
      connectionId: 'ssh-1',
      wslDistro: undefined
    })
    expect(beadsTargetForRepo(repo('r1', '/work/a'), 'Ubuntu')).toMatchObject({
      connectionId: null,
      wslDistro: 'Ubuntu'
    })
  })
})
