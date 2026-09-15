import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  commandExecFileAsyncMock,
  getSshGitProviderMock,
  accessMock,
  isWslPathMock,
  wslUncDirectoryExistsAsyncMock
} = vi.hoisted(() => ({
  commandExecFileAsyncMock: vi.fn(),
  getSshGitProviderMock: vi.fn(),
  accessMock: vi.fn(),
  isWslPathMock: vi.fn(),
  wslUncDirectoryExistsAsyncMock: vi.fn()
}))

vi.mock('../git/runner', () => ({
  commandExecFileAsync: commandExecFileAsyncMock,
  extractExecError: (err: { stderr?: string; stdout?: string; message?: string }) => ({
    stderr: err.stderr ?? err.message ?? '',
    stdout: err.stdout ?? ''
  })
}))

vi.mock('../providers/ssh-git-dispatch', () => ({
  getSshGitProvider: getSshGitProviderMock,
  getSshGitProviderGeneration: vi.fn(() => 3)
}))

vi.mock('node:fs/promises', () => ({
  access: accessMock
}))

vi.mock('../wsl', () => ({
  isWslPath: isWslPathMock,
  wslUncDirectoryExistsAsync: wslUncDirectoryExistsAsyncMock
}))

import { classifyBdFailure } from './beads-error'
import { beadsHostKey, runBd } from './beads-executor'

const LOCAL = { repoPath: '/repo', connectionId: null }

beforeEach(() => {
  commandExecFileAsyncMock.mockReset()
  getSshGitProviderMock.mockReset()
  accessMock.mockReset()
  accessMock.mockResolvedValue(undefined)
  isWslPathMock.mockReset()
  isWslPathMock.mockReturnValue(false)
  wslUncDirectoryExistsAsyncMock.mockReset()
})

describe('beadsHostKey', () => {
  it('distinguishes local, WSL and SSH hosts including the SSH generation', () => {
    expect(beadsHostKey(LOCAL)).toBe('local')
    expect(beadsHostKey({ ...LOCAL, wslDistro: 'Ubuntu' })).toBe('wsl:ubuntu')
    expect(beadsHostKey({ repoPath: '/r', connectionId: 'c1' })).toBe('ssh:c1:3')
  })
})

describe('runBd locally', () => {
  it('passes argv without a shell and returns stdout', async () => {
    commandExecFileAsyncMock.mockResolvedValueOnce({ stdout: '[]', stderr: '' })
    const result = await runBd({ ...LOCAL, wslDistro: 'Ubuntu' }, ['list', '--json'], 15_000)
    expect(commandExecFileAsyncMock).toHaveBeenCalledWith('bd', ['list', '--json'], {
      cwd: '/repo',
      timeout: 15_000,
      wslDistro: 'Ubuntu'
    })
    expect(result).toEqual({
      stdout: '[]',
      stderr: '',
      exitCode: 0,
      spawnFailed: false,
      hostOffline: false,
      timedOut: false
    })
  })

  it('reports a missing binary when the repo path is accessible', async () => {
    accessMock.mockResolvedValueOnce(undefined)
    commandExecFileAsyncMock.mockRejectedValueOnce({
      code: 'ENOENT',
      syscall: 'spawn bd',
      message: 'spawn bd ENOENT'
    })
    const result = await runBd(LOCAL, ['version'], 15_000)
    expect(result.spawnFailed).toBe(true)
    expect(result.exitCode).toBeNull()
  })

  it('reports a missing repo path instead of a missing binary when the cwd is inaccessible', async () => {
    accessMock.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'))
    commandExecFileAsyncMock.mockRejectedValueOnce({
      code: 'ENOENT',
      syscall: 'spawn bd',
      message: 'spawn bd ENOENT'
    })
    const result = await runBd(LOCAL, ['version'], 15_000)
    expect(result.spawnFailed).toBe(false)
    expect(result.stderr).toContain('/repo')
    expect(classifyBdFailure(result).kind).toBe('failed')
  })

  it('reports a missing repo path for a WSL UNC path when the in-distro probe says it does not exist', async () => {
    isWslPathMock.mockReturnValue(true)
    wslUncDirectoryExistsAsyncMock.mockResolvedValueOnce(false)
    commandExecFileAsyncMock.mockRejectedValueOnce({
      code: 'ENOENT',
      syscall: 'spawn bd',
      message: 'spawn bd ENOENT'
    })
    const wslTarget = {
      repoPath: '\\\\wsl.localhost\\Ubuntu\\home\\user\\repo',
      connectionId: null,
      wslDistro: 'Ubuntu'
    }
    const result = await runBd(wslTarget, ['version'], 15_000)
    expect(result.spawnFailed).toBe(false)
    expect(result.stderr).toContain('wsl.localhost')
    expect(accessMock).not.toHaveBeenCalled()
  })

  it('keeps the missing-binary classification for a WSL path when the in-distro probe is undeterminable', async () => {
    isWslPathMock.mockReturnValue(true)
    wslUncDirectoryExistsAsyncMock.mockResolvedValueOnce(null)
    commandExecFileAsyncMock.mockRejectedValueOnce({
      code: 'ENOENT',
      syscall: 'spawn bd',
      message: 'spawn bd ENOENT'
    })
    const wslTarget = {
      repoPath: '\\\\wsl.localhost\\Ubuntu\\home\\user\\repo',
      connectionId: null,
      wslDistro: 'Ubuntu'
    }
    const result = await runBd(wslTarget, ['version'], 15_000)
    expect(result.spawnFailed).toBe(true)
    expect(accessMock).not.toHaveBeenCalled()
  })

  it('keeps stdout/stderr and the exit code of a failed command', async () => {
    commandExecFileAsyncMock.mockRejectedValueOnce({
      code: 1,
      stderr: 'Error fetching x: no issue found matching "x"',
      stdout: '{"error":"no issues found matching the provided IDs"}',
      message: 'bd exited'
    })
    const result = await runBd(LOCAL, ['show', 'x', '--json'], 15_000)
    expect(result).toMatchObject({ exitCode: 1, spawnFailed: false, timedOut: false })
    expect(result.stderr).toContain('no issue found')
  })

  it('flags timeouts', async () => {
    commandExecFileAsyncMock.mockRejectedValueOnce(new Error('bd timed out.'))
    expect((await runBd(LOCAL, ['list', '--json'], 10)).timedOut).toBe(true)
  })
})

describe('runBd over SSH', () => {
  it('runs bd on the remote host in the repo directory', async () => {
    const execNonInteractive = vi
      .fn()
      .mockResolvedValue({ stdout: '[]', stderr: '', exitCode: 0, timedOut: false })
    getSshGitProviderMock.mockReturnValue({ execNonInteractive })
    const result = await runBd(
      { repoPath: '/srv/repo', connectionId: 'c1' },
      ['ready', '--json'],
      15_000
    )
    expect(execNonInteractive).toHaveBeenCalledWith('bd', ['ready', '--json'], '/srv/repo', 15_000)
    expect(result.exitCode).toBe(0)
  })

  it('reports an unavailable connection as host offline', async () => {
    getSshGitProviderMock.mockReturnValue(undefined)
    const result = await runBd({ repoPath: '/srv/repo', connectionId: 'c1' }, ['version'], 15_000)
    expect(result.hostOffline).toBe(true)
  })

  it('reports a remote spawn error as a missing binary', async () => {
    getSshGitProviderMock.mockReturnValue({
      execNonInteractive: vi.fn().mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: null,
        timedOut: false,
        spawnError: 'spawn bd ENOENT'
      })
    })
    const result = await runBd({ repoPath: '/srv/repo', connectionId: 'c1' }, ['version'], 15_000)
    expect(result.spawnFailed).toBe(true)
    expect(result.stderr).toContain('ENOENT')
  })
})
