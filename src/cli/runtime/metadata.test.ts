import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getDefaultUserDataPath } from './metadata'

describe('getDefaultUserDataPath', () => {
  const originalOverride = process.env.ORCA_USER_DATA_PATH
  const originalAppData = process.env.APPDATA
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME

  afterEach(() => {
    restoreEnv('ORCA_USER_DATA_PATH', originalOverride)
    restoreEnv('APPDATA', originalAppData)
    restoreEnv('XDG_CONFIG_HOME', originalXdgConfigHome)
  })

  function restoreEnv(key: string, value: string | undefined): void {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  // Why: the bundled CLI must resolve the same directory Electron writes to for a packaged
  // fork build (configure-process.ts's FORK_USER_DATA_DIR_NAME), or it reads/writes against
  // an installed upstream Orca's profile instead of the fork's.
  it('resolves the fork userData directory on macOS', () => {
    delete process.env.ORCA_USER_DATA_PATH
    expect(getDefaultUserDataPath('darwin', '/Users/tester')).toBe(
      join('/Users/tester', 'Library', 'Application Support', 'Orca Beads')
    )
  })

  it('resolves the fork userData directory on Windows from APPDATA', () => {
    delete process.env.ORCA_USER_DATA_PATH
    process.env.APPDATA = 'C:\\Users\\tester\\AppData\\Roaming'
    expect(getDefaultUserDataPath('win32', 'C:\\Users\\tester')).toBe(
      join('C:\\Users\\tester\\AppData\\Roaming', 'Orca Beads')
    )
  })

  it('throws on Windows when APPDATA is unset', () => {
    delete process.env.ORCA_USER_DATA_PATH
    delete process.env.APPDATA
    expect(() => getDefaultUserDataPath('win32', 'C:\\Users\\tester')).toThrow(/APPDATA is not set/)
  })

  it('resolves the fork userData directory on Linux under XDG_CONFIG_HOME', () => {
    delete process.env.ORCA_USER_DATA_PATH
    process.env.XDG_CONFIG_HOME = '/home/tester/.config-custom'
    expect(getDefaultUserDataPath('linux', '/home/tester')).toBe(
      join('/home/tester/.config-custom', 'Orca Beads')
    )
  })

  it('falls back to ~/.config on Linux when XDG_CONFIG_HOME is unset', () => {
    delete process.env.ORCA_USER_DATA_PATH
    delete process.env.XDG_CONFIG_HOME
    expect(getDefaultUserDataPath('linux', '/home/tester')).toBe(
      join('/home/tester', '.config', 'Orca Beads')
    )
  })

  it('lets ORCA_USER_DATA_PATH override the platform default', () => {
    process.env.ORCA_USER_DATA_PATH = '/tmp/orca-dev-repro'
    expect(getDefaultUserDataPath('darwin', '/Users/tester')).toBe('/tmp/orca-dev-repro')
  })
})
