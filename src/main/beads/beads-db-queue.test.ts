import { describe, expect, it } from 'vitest'
import { BeadsDbQueue } from './beads-db-queue'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {}
  let reject: (error: Error) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flush(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve()
  }
}

describe('BeadsDbQueue', () => {
  it('runs tasks for the same database one at a time, in order', async () => {
    const queue = new BeadsDbQueue()
    const first = deferred<string>()
    const started: string[] = []
    const a = queue.run('db', async () => {
      started.push('a')
      return first.promise
    })
    const b = queue.run('db', async () => {
      started.push('b')
      return 'b'
    })
    await flush()
    expect(started).toEqual(['a'])
    first.resolve('a')
    expect(await a).toBe('a')
    expect(await b).toBe('b')
    expect(started).toEqual(['a', 'b'])
  })

  it('runs different databases concurrently', async () => {
    const queue = new BeadsDbQueue()
    const blocker = deferred<string>()
    const started: string[] = []
    void queue.run('db-1', async () => {
      started.push('db-1')
      return blocker.promise
    })
    void queue.run('db-2', async () => {
      started.push('db-2')
      return 'x'
    })
    await flush()
    expect(started).toEqual(['db-1', 'db-2'])
    blocker.resolve('done')
  })

  it('continues after a failed task', async () => {
    const queue = new BeadsDbQueue()
    const failing = queue.run('db', async () => {
      throw new Error('boom')
    })
    const next = queue.run('db', async () => 'ok')
    await expect(failing).rejects.toThrow('boom')
    expect(await next).toBe('ok')
  })

  it('shares an identical in-flight read and runs it again once settled', async () => {
    const queue = new BeadsDbQueue()
    let runs = 0
    const gate = deferred<number>()
    const task = async () => {
      runs += 1
      return gate.promise
    }
    const first = queue.runShared('db', 'list', task)
    const second = queue.runShared('db', 'list', task)
    expect(second).toBe(first)
    gate.resolve(7)
    expect(await second).toBe(7)
    await flush()
    await queue.runShared('db', 'list', async () => {
      runs += 1
      return 8
    })
    expect(runs).toBe(2)
  })

  it('does not share reads when (key, shareKey) pairs differ, even if concatenation would collide', async () => {
    const queue = new BeadsDbQueue()
    const taskRuns: string[] = []
    const gate1 = deferred<string>()
    const gate2 = deferred<string>()
    // These would collide with string concatenation: 'a' + '\n' + 'b\nc' = 'a\nb\nc' = 'a\nb' + '\n' + 'c'
    const first = queue.runShared('a', 'b\nc', async () => {
      taskRuns.push('first')
      return gate1.promise
    })
    const second = queue.runShared('a\nb', 'c', async () => {
      taskRuns.push('second')
      return gate2.promise
    })
    // Different promises, so they should be independent
    expect(first).not.toBe(second)
    gate1.resolve('result1')
    gate2.resolve('result2')
    expect(await first).toBe('result1')
    expect(await second).toBe('result2')
    expect(taskRuns).toEqual(['first', 'second'])
  })
})
