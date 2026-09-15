import { beforeEach, describe, expect, it, vi } from 'vitest'

const { runBdMock } = vi.hoisted(() => ({ runBdMock: vi.fn() }))

vi.mock('./beads-executor', () => ({
  BD_READ_TIMEOUT_MS: 15_000,
  beadsHostKey: () => 'local',
  runBd: runBdMock
}))

import {
  getBdVersionInfo,
  isSupportedBdVersion,
  parseBdVersion,
  requireSupportedBd,
  resetBdVersionCacheForTests
} from './beads-version'

const TARGET = { repoPath: '/repo', connectionId: null }

function reply(stdout: string, overrides: Record<string, unknown> = {}) {
  return {
    stdout,
    stderr: '',
    exitCode: 0,
    spawnFailed: false,
    hostOffline: false,
    timedOut: false,
    ...overrides
  }
}

beforeEach(() => {
  runBdMock.mockReset()
  resetBdVersionCacheForTests()
})

describe('bd version parsing', () => {
  it('parses the version line and gates on 1.2.0', () => {
    expect(parseBdVersion('bd version 1.2.2 (Homebrew)\n')).toBe('1.2.2')
    expect(parseBdVersion('garbage')).toBeNull()
    expect(isSupportedBdVersion('1.2.0')).toBe(true)
    expect(isSupportedBdVersion('1.10.0')).toBe(true)
    expect(isSupportedBdVersion('2.0.0')).toBe(true)
    expect(isSupportedBdVersion('1.1.9')).toBe(false)
    expect(isSupportedBdVersion('1.2')).toBe(false)
  })
})

describe('getBdVersionInfo', () => {
  it('caches a supported version per host and dedupes concurrent probes', async () => {
    runBdMock.mockResolvedValue(reply('bd version 1.2.2 (Homebrew)'))
    const [a, b] = await Promise.all([getBdVersionInfo(TARGET), getBdVersionInfo(TARGET)])
    await getBdVersionInfo(TARGET)
    expect(a).toEqual({ installed: true, version: '1.2.2', supported: true, hostOffline: false })
    expect(b).toEqual(a)
    expect(runBdMock).toHaveBeenCalledTimes(1)
    expect(runBdMock).toHaveBeenCalledWith(TARGET, ['version'], 15_000)
  })

  it('does not cache an offline host', async () => {
    runBdMock.mockResolvedValueOnce(reply('', { hostOffline: true, exitCode: null }))
    runBdMock.mockResolvedValueOnce(reply('bd version 1.2.2'))
    expect((await getBdVersionInfo(TARGET)).hostOffline).toBe(true)
    expect((await getBdVersionInfo(TARGET)).supported).toBe(true)
  })
})

describe('requireSupportedBd', () => {
  it('throws typed errors for offline, missing and outdated bd', async () => {
    runBdMock.mockResolvedValueOnce(reply('', { hostOffline: true, exitCode: null }))
    await expect(requireSupportedBd(TARGET)).rejects.toMatchObject({ kind: 'host-offline' })

    runBdMock.mockResolvedValueOnce(reply('', { spawnFailed: true, exitCode: null }))
    await expect(requireSupportedBd(TARGET)).rejects.toMatchObject({ kind: 'bd-missing' })

    resetBdVersionCacheForTests()
    runBdMock.mockResolvedValueOnce(reply('bd version 1.1.2'))
    await expect(requireSupportedBd(TARGET)).rejects.toMatchObject({ kind: 'bd-outdated' })
  })

  it('returns the version when supported', async () => {
    runBdMock.mockResolvedValueOnce(reply('bd version 1.2.2'))
    await expect(requireSupportedBd(TARGET)).resolves.toBe('1.2.2')
  })
})
