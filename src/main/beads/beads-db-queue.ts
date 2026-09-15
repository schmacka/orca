// Why: embedded Dolt serializes writers on a file lock; several Orca calls racing
// for it just wait in bd and eat into their timeouts. Queueing Orca's own calls
// per database keeps UI reads from timing out behind each other.
export class BeadsDbQueue {
  private readonly tails = new Map<string, Promise<void>>()
  private readonly shared = new Map<string, Map<string, Promise<unknown>>>()

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve()
    const result = previous.then(() => task())
    const tail = result.then(
      () => undefined,
      () => undefined
    )
    this.tails.set(key, tail)
    void tail.then(() => {
      if (this.tails.get(key) === tail) {
        this.tails.delete(key)
      }
    })
    return result
  }

  runShared<T>(key: string, shareKey: string, task: () => Promise<T>): Promise<T> {
    const keyMap = this.shared.get(key)
    const existing = keyMap?.get(shareKey)
    if (existing) {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: entries in the nested map are only created below by runShared<T> with the same (key, shareKey) pair, and callers pass the JSON-encoded bd argv as shareKey, which fixes the result type.
      return existing as Promise<T>
    }
    const result = this.run(key, task)
    const newKeyMap = keyMap ?? new Map<string, Promise<unknown>>()
    newKeyMap.set(shareKey, result)
    if (!keyMap) {
      this.shared.set(key, newKeyMap)
    }
    const clear = (): void => {
      const map = this.shared.get(key)
      if (map?.get(shareKey) === result) {
        map.delete(shareKey)
        if (map.size === 0) {
          this.shared.delete(key)
        }
      }
    }
    result.then(clear, clear)
    return result
  }
}
