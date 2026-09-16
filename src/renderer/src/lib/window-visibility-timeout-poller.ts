import { isWindowVisible } from './window-visibility-interval'

export type WindowVisibilityTimeoutPollerTimer = ReturnType<typeof setTimeout>

export function installWindowVisibilityTimeoutPoller(args: {
  run: () => Promise<void> | void
  getDelayMs: () => number
  /** When set, keep polling while hidden at this delay instead of pausing. */
  hiddenDelayMs?: number
  setTimeoutFn?: (callback: () => void, delayMs: number) => WindowVisibilityTimeoutPollerTimer
  clearTimeoutFn?: (handle: WindowVisibilityTimeoutPollerTimer) => void
}): () => void {
  const setTimeoutFn =
    args.setTimeoutFn ??
    ((callback: () => void, delayMs: number): WindowVisibilityTimeoutPollerTimer =>
      setTimeout(callback, delayMs))
  const clearTimeoutFn =
    args.clearTimeoutFn ??
    ((handle: WindowVisibilityTimeoutPollerTimer): void => clearTimeout(handle))
  let timeoutId: WindowVisibilityTimeoutPollerTimer | null = null
  let disposed = false
  let inFlight = false

  const pollsWhileHidden = args.hiddenDelayMs !== undefined
  const canPoll = (): boolean => pollsWhileHidden || isWindowVisible()
  const nextDelayMs = (): number =>
    isWindowVisible() ? args.getDelayMs() : (args.hiddenDelayMs ?? args.getDelayMs())

  const clearScheduledPoll = (): void => {
    if (!timeoutId) {
      return
    }
    clearTimeoutFn(timeoutId)
    timeoutId = null
  }

  const schedulePoll = (): void => {
    clearScheduledPoll()
    if (disposed || !canPoll()) {
      return
    }
    timeoutId = setTimeoutFn(() => {
      timeoutId = null
      runAndSchedule()
    }, nextDelayMs())
  }

  function runAndSchedule(): void {
    clearScheduledPoll()
    if (disposed || !canPoll() || inFlight) {
      return
    }
    inFlight = true
    void Promise.resolve(args.run()).finally(() => {
      inFlight = false
      schedulePoll()
    })
  }

  const reconcileVisibility = (): void => {
    if (isWindowVisible()) {
      runAndSchedule()
    } else if (pollsWhileHidden) {
      schedulePoll()
    } else {
      clearScheduledPoll()
    }
  }

  runAndSchedule()
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('focus', reconcileVisibility)
  }
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', reconcileVisibility)
  }

  return () => {
    disposed = true
    clearScheduledPoll()
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('focus', reconcileVisibility)
    }
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', reconcileVisibility)
    }
  }
}
