import React from 'react'
import { ChevronDown, GitBranchPlus } from 'lucide-react'
import { beadsStatusCategory } from '../../../../../shared/beads/beads-schema'
import type { BeadsIssue, BeadsSchema } from '../../../../../shared/beads/beads-issue-types'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { beadsStatusIcon, beadsStatusToneClass } from './beads-status-visuals'
import type { BeadsListMode, BeadsListRow, BeadsProgress } from './beads-tree-rows'

const INDENT_PX = 16

// Why: bd ids allow '.', '_' and '-', so folding them all to '-' makes `cwf.3` and
// `cwf-3` the same DOM id and aria-activedescendant points at the wrong row.
export function beadsRowDomId(key: string): string {
  return `beads-row-${key.replace(/[^A-Za-z0-9]/g, (char) => `_${char.charCodeAt(0).toString(16)}`)}`
}

type BeadsIssueRowProps = {
  row: BeadsListRow
  schema: BeadsSchema
  progress: BeadsProgress | null
  mode: BeadsListMode
  current: boolean
  onSelect: (key: string) => void
  onToggle: (key: string, expand: boolean) => void
  onStartWorktree: (issue: Pick<BeadsIssue, 'id' | 'title' | 'issueType'>) => void
}

export function BeadsIssueRow({
  row,
  schema,
  progress,
  mode,
  current,
  onSelect,
  onToggle,
  onStartWorktree
}: BeadsIssueRowProps): React.JSX.Element {
  const id = row.kind === 'issue' ? row.issue.id : row.parentId
  const title = row.kind === 'issue' ? row.issue.title : (row.parent?.title ?? id)
  const toggleLabel = row.expanded
    ? translate('auto.components.task-page.beads.collapseRow', 'Collapse {{id}}', { id })
    : translate('auto.components.task-page.beads.expandRow', 'Expand {{id}}', { id })
  const category = row.kind === 'issue' ? beadsStatusCategory(schema, row.issue.status) : null
  const StatusIcon = category ? beadsStatusIcon(category) : null
  return (
    <div
      id={beadsRowDomId(row.key)}
      role="option"
      aria-selected={current}
      data-current={current ? 'true' : undefined}
      onClick={() => onSelect(row.key)}
      className={cn(
        'group/row flex h-9 cursor-pointer items-center gap-2 pr-3 text-[13px] transition hover:bg-accent',
        current && 'bg-accent'
      )}
      style={{ paddingLeft: row.depth * INDENT_PX + 8 }}
    >
      {row.hasChildren ? (
        <button
          type="button"
          // Why: this row is a `role="option"`; its children are presentational, so an
          // AT user can neither reach this button nor benefit from its label leaking
          // into the option name. Left/Right on the listbox does the same job.
          aria-hidden
          tabIndex={-1}
          title={toggleLabel}
          onClick={(event) => {
            event.stopPropagation()
            onToggle(row.key, !row.expanded)
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <ChevronDown
            className={cn('size-3.5 transition-transform', !row.expanded && '-rotate-90')}
          />
        </button>
      ) : (
        <span aria-hidden className="size-5 shrink-0" />
      )}
      {StatusIcon && category
        ? // Why: rendering a dynamically-chosen icon as a JSX tag trips oxlint's
          // react/static-components (looks like a component defined during render).
          React.createElement(StatusIcon, {
            'aria-hidden': true,
            className: cn('size-3.5 shrink-0', beadsStatusToneClass(category))
          })
        : null}
      <span className="shrink-0 font-mono text-[12px] text-muted-foreground">{id}</span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate',
          row.kind === 'context' ? 'text-muted-foreground' : 'text-foreground'
        )}
      >
        {title}
      </span>
      {row.kind === 'issue' && mode === 'flat' && row.issue.parent ? (
        <span className="shrink-0 rounded-full border border-border/60 bg-muted/50 px-1.5 text-[11px] text-muted-foreground">
          {row.issue.parent}
        </span>
      ) : null}
      {row.kind === 'issue' && row.issue.blockedBy.length > 0 ? (
        <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 text-[11px] text-destructive">
          {translate('auto.components.task-page.beads.blockedCount', 'Blocked by {{count}}', {
            count: row.issue.blockedBy.length
          })}
        </span>
      ) : null}
      {progress ? (
        <span className="shrink-0 text-[12px] text-muted-foreground">
          {`${progress.closed}/${progress.total}`}
        </span>
      ) : null}
      {row.kind === 'issue' ? (
        <span className="shrink-0 text-[12px] text-muted-foreground">{`P${row.issue.priority}`}</span>
      ) : null}
      {row.kind === 'issue' ? (
        <button
          type="button"
          // Why: same precedent as the expand chevron above — this row is a
          // `role="option"` whose children are presentational to assistive tech.
          aria-hidden
          tabIndex={-1}
          title={translate(
            'auto.components.task-page.beads.startWorktreeRow',
            'Start worktree from {{id}}',
            { id }
          )}
          onClick={(event) => {
            event.stopPropagation()
            onStartWorktree(row.issue)
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <GitBranchPlus className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}
