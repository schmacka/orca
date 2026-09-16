import React from 'react'
import { ChevronDown, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { beadsStatusCategory } from '../../../../../shared/beads/beads-schema'
import type {
  BeadsIssueDetails,
  BeadsIssueRelation,
  BeadsSchema
} from '../../../../../shared/beads/beads-issue-types'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { groupBeadsRelations } from './beads-detail-relations'
import { beadsStatusIcon, beadsStatusToneClass } from './beads-status-visuals'

type SectionsProps = {
  details: BeadsIssueDetails
  schema: BeadsSchema
  onOpenIssue: (id: string) => void
}

function RelationRow({
  relation,
  schema,
  showType,
  onOpenIssue
}: {
  relation: BeadsIssueRelation
  schema: BeadsSchema
  showType: boolean
  onOpenIssue: (id: string) => void
}): React.JSX.Element {
  const category = beadsStatusCategory(schema, relation.status)
  const Icon = beadsStatusIcon(category)
  return (
    <button
      type="button"
      onClick={() => onOpenIssue(relation.id)}
      className="flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-accent"
    >
      {
        // Why: rendering a dynamically-chosen icon as a JSX tag trips oxlint's
        // react/static-components (looks like a component defined during render).
        React.createElement(Icon, {
          'aria-hidden': true,
          className: cn('size-3.5 shrink-0', beadsStatusToneClass(category))
        })
      }
      <span className="shrink-0 font-mono text-[12px] text-muted-foreground">{relation.id}</span>
      <span className="min-w-0 flex-1 truncate">{relation.title}</span>
      {showType ? (
        <span className="shrink-0 text-[12px] text-muted-foreground">
          {relation.dependencyType}
        </span>
      ) : null}
    </button>
  )
}

function RelationGroup(props: {
  title: string
  relations: BeadsIssueRelation[]
  schema: BeadsSchema
  showType?: boolean
  onOpenIssue: (id: string) => void
}): React.JSX.Element | null {
  if (props.relations.length === 0) {
    return null
  }
  return (
    <div>
      <p className="px-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
        {props.title}
      </p>
      {props.relations.map((relation) => (
        <RelationRow
          key={`${relation.dependencyType}:${relation.id}`}
          relation={relation}
          schema={props.schema}
          showType={props.showType ?? false}
          onOpenIssue={props.onOpenIssue}
        />
      ))}
    </div>
  )
}

function TextSection(props: {
  title: string
  text: string | undefined
  defaultOpen: boolean
}): React.JSX.Element | null {
  if (!props.text?.trim()) {
    return null
  }
  return (
    <Collapsible defaultOpen={props.defaultOpen}>
      {/* asChild: typography and color on the primitive itself trip shadcn/no-restyle (layout only). */}
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-1 py-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground"
        >
          <ChevronDown
            aria-hidden
            className="size-3 transition-transform group-data-[state=closed]:-rotate-90"
          />
          {props.title}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CommentMarkdown
          content={props.text}
          variant="document"
          className="text-[14px] leading-relaxed"
        />
      </CollapsibleContent>
    </Collapsible>
  )
}

export function BeadsDetailSections({
  details,
  schema,
  onOpenIssue
}: SectionsProps): React.JSX.Element {
  const { issue } = details
  const groups = groupBeadsRelations(details, schema)
  const category = beadsStatusCategory(schema, issue.status)
  const StatusIcon = beadsStatusIcon(category)
  const hasText = [issue.description, issue.design, issue.acceptanceCriteria, issue.notes].some(
    (text) => text?.trim()
  )
  const hasRelations =
    groups.parent !== null ||
    groups.blockers.length + groups.blocks.length + groups.children.length + groups.related.length >
      0

  const copyId = async (): Promise<void> => {
    await window.api.ui.writeClipboardText(issue.id)
    toast.success(
      translate('auto.components.task-page.beads.copiedId', 'Copied {{id}}', { id: issue.id })
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <Button variant="ghost" size="xs" onClick={() => void copyId()}>
            <span className="font-mono">{issue.id}</span>
            <Copy aria-hidden className="size-3" />
          </Button>
          <span>{issue.issueType}</span>
          <span>{`P${issue.priority}`}</span>
          <span className={cn('inline-flex items-center gap-1', beadsStatusToneClass(category))}>
            {React.createElement(StatusIcon, { 'aria-hidden': true, className: 'size-3.5' })}
            {issue.status}
          </span>
          {issue.labels.map((label) => (
            <Badge key={label} variant="outline">
              {label}
            </Badge>
          ))}
        </div>
        <h2 className="text-[14px] font-medium text-foreground">{issue.title}</h2>
      </header>

      {groups.openBlockers.length > 0 ? (
        <section className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
          <p className="text-[12px] font-medium">
            {translate('auto.components.task-page.beads.blockedBy', 'Blocked by')}
          </p>
          {groups.openBlockers.map((blocker) => (
            <div key={blocker.id} className="flex items-center gap-2 text-[13px]">
              <span className="font-mono text-[12px]">{blocker.id}</span>
              <span className="min-w-0 flex-1 truncate">{blocker.title}</span>
              <Button variant="ghost" size="xs" onClick={() => onOpenIssue(blocker.id)}>
                {translate('auto.components.task-page.beads.openIssue', 'Open')}
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      <section
        aria-label={translate('auto.components.task-page.beads.relations', 'Relations')}
        className="flex flex-col gap-2"
      >
        <RelationGroup
          title={translate('auto.components.task-page.beads.relationParent', 'Parent')}
          relations={groups.parent ? [groups.parent] : []}
          schema={schema}
          onOpenIssue={onOpenIssue}
        />
        <RelationGroup
          title={translate('auto.components.task-page.beads.relationBlockedBy', 'Blocked by')}
          relations={groups.blockers}
          schema={schema}
          onOpenIssue={onOpenIssue}
        />
        <RelationGroup
          title={translate('auto.components.task-page.beads.relationBlocks', 'Blocks')}
          relations={groups.blocks}
          schema={schema}
          onOpenIssue={onOpenIssue}
        />
        <RelationGroup
          title={translate('auto.components.task-page.beads.relationChildren', 'Children')}
          relations={groups.children}
          schema={schema}
          onOpenIssue={onOpenIssue}
        />
        <RelationGroup
          title={translate('auto.components.task-page.beads.relationRelated', 'Related')}
          relations={groups.related}
          schema={schema}
          showType
          onOpenIssue={onOpenIssue}
        />
        {hasRelations ? null : (
          <p className="text-[12px] text-muted-foreground">
            {translate('auto.components.task-page.beads.noRelations', 'No relations')}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <TextSection
          title={translate('auto.components.task-page.beads.sectionDescription', 'Description')}
          text={issue.description}
          defaultOpen
        />
        <TextSection
          title={translate(
            'auto.components.task-page.beads.sectionAcceptance',
            'Acceptance criteria'
          )}
          text={issue.acceptanceCriteria}
          defaultOpen
        />
        <TextSection
          title={translate('auto.components.task-page.beads.sectionDesign', 'Design')}
          text={issue.design}
          defaultOpen={false}
        />
        <TextSection
          title={translate('auto.components.task-page.beads.sectionNotes', 'Notes')}
          text={issue.notes}
          defaultOpen={false}
        />
        {hasText ? null : (
          <p className="text-sm italic text-muted-foreground">
            {translate('auto.components.task-page.beads.noDescription', 'No description')}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {translate('auto.components.task-page.beads.commentsHeading', 'Comments ({{count}})', {
            count: details.comments.length
          })}
        </p>
        {details.comments.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            {translate('auto.components.task-page.beads.noComments', 'No comments')}
          </p>
        ) : (
          details.comments.map((comment) => (
            <div key={comment.id} className="rounded-md border border-border/50 px-3 py-2">
              <p className="text-[12px] text-muted-foreground">{`${comment.author} · ${comment.createdAt}`}</p>
              <CommentMarkdown
                content={comment.text}
                variant="compact"
                className="text-[13px] leading-relaxed"
              />
            </div>
          ))
        )}
      </section>
    </div>
  )
}
