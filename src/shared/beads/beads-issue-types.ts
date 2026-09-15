export type BeadsStatusCategory = 'active' | 'wip' | 'frozen' | 'done'

export type BeadsStatusDefinition = {
  name: string
  category: BeadsStatusCategory
  description: string
  icon: string
}

export type BeadsTypeDefinition = {
  name: string
  description: string
}

export type BeadsSchema = {
  statuses: BeadsStatusDefinition[]
  types: BeadsTypeDefinition[]
}

export type BeadsDependencyEdge = {
  dependsOnId: string
  dependencyType: string
}

export type BeadsIssue = {
  id: string
  title: string
  description?: string
  design?: string
  acceptanceCriteria?: string
  notes?: string
  status: string
  priority: number
  issueType: string
  assignee?: string
  owner?: string
  createdBy?: string
  labels: string[]
  parent?: string
  createdAt: string
  updatedAt: string
  closedAt?: string
  closeReason?: string
  deferUntil?: string
  dependencyCount: number
  dependentCount: number
  commentCount: number
  blockedBy: string[]
  dependencyEdges: BeadsDependencyEdge[]
}

export type BeadsIssueRelation = {
  id: string
  title: string
  status: string
  priority: number
  issueType: string
  dependencyType: string
}

export type BeadsIssueComment = {
  id: string
  author: string
  text: string
  createdAt: string
}

export type BeadsIssueDetails = {
  issue: BeadsIssue
  dependencies: BeadsIssueRelation[]
  dependents: BeadsIssueRelation[]
  comments: BeadsIssueComment[]
}

export type BeadsWorkspaceStatus = {
  bdInstalled: boolean
  bdVersion: string | null
  versionSupported: boolean
  initialized: boolean
  beadsDir: string | null
  isWorktree: boolean
}
