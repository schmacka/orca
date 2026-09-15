import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { BEADS_METHODS } from './beads'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

describe('beads RPC methods', () => {
  it('routes beads methods to the runtime with parsed params', async () => {
    const ok = { ok: true, value: null }
    const beadsGetStatus = vi.fn().mockResolvedValue(ok)
    const beadsListIssues = vi.fn().mockResolvedValue(ok)
    const beadsClaimIssue = vi.fn().mockResolvedValue(ok)
    const beadsCloseIssue = vi.fn().mockResolvedValue(ok)
    const beadsAddComment = vi.fn().mockResolvedValue(ok)
    const dispatcher = new RpcDispatcher({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the dispatcher only calls the stubbed beads methods exercised below.
      runtime: {
        getRuntimeId: () => 'test-runtime',
        beadsGetStatus,
        beadsListIssues,
        beadsClaimIssue,
        beadsCloseIssue,
        beadsAddComment
      } as unknown as OrcaRuntimeService,
      methods: BEADS_METHODS
    })

    await dispatcher.dispatch(makeRequest('beads.getStatus', { repo: 'id:r1' }))
    await dispatcher.dispatch(
      makeRequest('beads.listIssues', {
        repo: 'id:r1',
        request: { view: 'ready', filter: { labels: ['ui'] }, limit: 200 }
      })
    )
    await dispatcher.dispatch(
      makeRequest('beads.claimIssue', { repo: 'id:r1', id: 'p-1', actor: 'me' })
    )
    await dispatcher.dispatch(
      makeRequest('beads.closeIssue', { repo: 'id:r1', id: 'p-1', actor: null, reason: 'done' })
    )
    await dispatcher.dispatch(
      makeRequest('beads.addComment', { repo: 'id:r1', id: 'p-1', actor: null, text: '-hi' })
    )

    expect(beadsGetStatus).toHaveBeenCalledWith('id:r1')
    expect(beadsListIssues).toHaveBeenCalledWith(
      'id:r1',
      expect.objectContaining({ view: 'ready', limit: 200 })
    )
    expect(beadsClaimIssue).toHaveBeenCalledWith('id:r1', 'p-1', 'me')
    expect(beadsCloseIssue).toHaveBeenCalledWith('id:r1', 'p-1', 'done', null)
    expect(beadsAddComment).toHaveBeenCalledWith('id:r1', 'p-1', '-hi', null)
  })

  it('rejects calls without a repo selector', async () => {
    const beadsGetStatus = vi.fn()
    const dispatcher = new RpcDispatcher({
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: no runtime method should be reached for invalid params.
      runtime: {
        getRuntimeId: () => 'test-runtime',
        beadsGetStatus
      } as unknown as OrcaRuntimeService,
      methods: BEADS_METHODS
    })
    await dispatcher.dispatch(makeRequest('beads.getStatus', {}))
    expect(beadsGetStatus).not.toHaveBeenCalled()
  })
})
