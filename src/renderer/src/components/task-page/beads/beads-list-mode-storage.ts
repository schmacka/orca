import type { BeadsListMode } from './beads-tree-rows'

function storageKey(repoId: string): string {
  return `orca.beads.listMode.${repoId}`
}

export function readBeadsListMode(repoId: string): BeadsListMode {
  try {
    return window.localStorage.getItem(storageKey(repoId)) === 'flat' ? 'flat' : 'tree'
  } catch {
    return 'tree'
  }
}

export function writeBeadsListMode(repoId: string, mode: BeadsListMode): void {
  try {
    window.localStorage.setItem(storageKey(repoId), mode)
  } catch {
    // Why: storage can be unavailable (private window, blocked site data); the mode is a convenience.
  }
}
