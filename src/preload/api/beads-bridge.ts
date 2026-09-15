import { ipcRenderer } from 'electron'
import type {
  BeadsCloseArgs,
  BeadsCommentArgs,
  BeadsCountArgs,
  BeadsCreateArgs,
  BeadsDeferArgs,
  BeadsIssueActorArgs,
  BeadsListArgs,
  BeadsReadIssueArgs,
  BeadsReopenArgs,
  BeadsRepoArgs,
  BeadsUpdateArgs
} from '../../shared/beads/beads-contract'
import type { PreloadApi } from '../api-types'

export const beadsApi = {
  getStatus: (args: BeadsRepoArgs) => ipcRenderer.invoke('beads:getStatus', args),
  getSchema: (args: BeadsRepoArgs) => ipcRenderer.invoke('beads:getSchema', args),
  getChangeToken: (args: BeadsRepoArgs) => ipcRenderer.invoke('beads:getChangeToken', args),
  listIssues: (args: BeadsListArgs) => ipcRenderer.invoke('beads:listIssues', args),
  countIssues: (args: BeadsCountArgs) => ipcRenderer.invoke('beads:countIssues', args),
  getIssueDetails: (args: BeadsReadIssueArgs) => ipcRenderer.invoke('beads:getIssueDetails', args),
  createIssue: (args: BeadsCreateArgs) => ipcRenderer.invoke('beads:createIssue', args),
  updateIssue: (args: BeadsUpdateArgs) => ipcRenderer.invoke('beads:updateIssue', args),
  claimIssue: (args: BeadsIssueActorArgs) => ipcRenderer.invoke('beads:claimIssue', args),
  closeIssue: (args: BeadsCloseArgs) => ipcRenderer.invoke('beads:closeIssue', args),
  reopenIssue: (args: BeadsReopenArgs) => ipcRenderer.invoke('beads:reopenIssue', args),
  deferIssue: (args: BeadsDeferArgs) => ipcRenderer.invoke('beads:deferIssue', args),
  undeferIssue: (args: BeadsIssueActorArgs) => ipcRenderer.invoke('beads:undeferIssue', args),
  deleteIssue: (args: BeadsIssueActorArgs) => ipcRenderer.invoke('beads:deleteIssue', args),
  addComment: (args: BeadsCommentArgs) => ipcRenderer.invoke('beads:addComment', args)
} satisfies PreloadApi['beads']
