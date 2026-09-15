import { defineMethod } from '../core'
import {
  BeadsAddCommentParams,
  BeadsCloseIssueParams,
  BeadsCountIssuesParams,
  BeadsCreateIssueParams,
  BeadsDeferIssueParams,
  BeadsIssueActorParams,
  BeadsIssueParams,
  BeadsListIssuesParams,
  BeadsRepoParams,
  BeadsReopenIssueParams,
  BeadsUpdateIssueParams
} from '../../../../shared/rpc-contract/beads-params'

export const BEADS_METHODS = [
  defineMethod({
    name: 'beads.getStatus',
    params: BeadsRepoParams,
    handler: async (params, { runtime }) => runtime.beadsGetStatus(params.repo)
  }),
  defineMethod({
    name: 'beads.getSchema',
    params: BeadsRepoParams,
    handler: async (params, { runtime }) => runtime.beadsGetSchema(params.repo)
  }),
  defineMethod({
    name: 'beads.getChangeToken',
    params: BeadsRepoParams,
    handler: async (params, { runtime }) => runtime.beadsGetChangeToken(params.repo)
  }),
  defineMethod({
    name: 'beads.listIssues',
    params: BeadsListIssuesParams,
    handler: async (params, { runtime }) => runtime.beadsListIssues(params.repo, params.request)
  }),
  defineMethod({
    name: 'beads.countIssues',
    params: BeadsCountIssuesParams,
    handler: async (params, { runtime }) => runtime.beadsCountIssues(params.repo, params.filter)
  }),
  defineMethod({
    name: 'beads.getIssueDetails',
    params: BeadsIssueParams,
    handler: async (params, { runtime }) => runtime.beadsGetIssueDetails(params.repo, params.id)
  }),
  defineMethod({
    name: 'beads.createIssue',
    params: BeadsCreateIssueParams,
    handler: async (params, { runtime }) =>
      runtime.beadsCreateIssue(params.repo, params.input, params.actor)
  }),
  defineMethod({
    name: 'beads.updateIssue',
    params: BeadsUpdateIssueParams,
    handler: async (params, { runtime }) =>
      runtime.beadsUpdateIssue(params.repo, params.id, params.patch, params.actor)
  }),
  defineMethod({
    name: 'beads.claimIssue',
    params: BeadsIssueActorParams,
    handler: async (params, { runtime }) =>
      runtime.beadsClaimIssue(params.repo, params.id, params.actor)
  }),
  defineMethod({
    name: 'beads.closeIssue',
    params: BeadsCloseIssueParams,
    handler: async (params, { runtime }) =>
      runtime.beadsCloseIssue(params.repo, params.id, params.reason, params.actor)
  }),
  defineMethod({
    name: 'beads.reopenIssue',
    params: BeadsReopenIssueParams,
    handler: async (params, { runtime }) =>
      runtime.beadsReopenIssue(params.repo, params.id, params.reason, params.actor)
  }),
  defineMethod({
    name: 'beads.deferIssue',
    params: BeadsDeferIssueParams,
    handler: async (params, { runtime }) =>
      runtime.beadsDeferIssue(params.repo, params.id, params.until, params.actor)
  }),
  defineMethod({
    name: 'beads.undeferIssue',
    params: BeadsIssueActorParams,
    handler: async (params, { runtime }) =>
      runtime.beadsUndeferIssue(params.repo, params.id, params.actor)
  }),
  defineMethod({
    name: 'beads.deleteIssue',
    params: BeadsIssueActorParams,
    handler: async (params, { runtime }) =>
      runtime.beadsDeleteIssue(params.repo, params.id, params.actor)
  }),
  defineMethod({
    name: 'beads.addComment',
    params: BeadsAddCommentParams,
    handler: async (params, { runtime }) =>
      runtime.beadsAddComment(params.repo, params.id, params.text, params.actor)
  })
]
