import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Loader2 } from 'lucide-react'
import type { BeadsIssue, BeadsSchema } from '../../../../../shared/beads/beads-issue-types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { isEditableTarget } from '@/lib/editable-target'
import { BeadsIssueRow, beadsRowDomId } from './BeadsIssueRow'
import { resolveBeadsListKey } from './beads-list-keyboard'
import type { BeadsListMode, BeadsListRow, BeadsProgress } from './beads-tree-rows'

const ROW_HEIGHT_PX = 36

type BeadsListPaneProps = {
  rows: BeadsListRow[]
  schema: BeadsSchema
  progressByParent: ReadonlyMap<string, BeadsProgress>
  mode: BeadsListMode
  currentKey: string | null
  hasMore: boolean
  loading: boolean
  onSelectKey: (key: string) => void
  onToggleKey: (key: string, expand: boolean) => void
  onOpenKey: (key: string) => void
  onLoadMore: () => void
  onStartWorktree: (issue: Pick<BeadsIssue, 'id' | 'title' | 'issueType'>) => void
}

export function BeadsListPane(props: BeadsListPaneProps): React.JSX.Element {
  const { rows, currentKey, onSelectKey, onToggleKey, onOpenKey } = props
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 12
  })
  const currentIndex = currentKey ? rows.findIndex((row) => row.key === currentKey) : -1
  const virtualItems = virtualizer.getVirtualItems()
  // Why: aria-activedescendant must name an element that exists. Outside the virtual
  // window (selection from the relations list, or after Load more) it does not, and
  // screen readers then announce nothing at all.
  const currentRendered = virtualItems.some((item) => item.index === currentIndex)

  useEffect(() => {
    if (currentIndex >= 0) {
      virtualizer.scrollToIndex(currentIndex)
    }
    // `useVirtualizer` keeps one instance for the component's life, so it is a safe dep.
  }, [currentKey, currentIndex, virtualizer])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (isEditableTarget(event.target)) {
      return
    }
    const action = resolveBeadsListKey(event.key, rows, currentIndex)
    if (action.type === 'none') {
      return
    }
    event.preventDefault()
    if (action.type === 'select') {
      onSelectKey(rows[action.index].key)
      virtualizer.scrollToIndex(action.index)
    } else if (action.type === 'expand' || action.type === 'collapse') {
      onToggleKey(action.key, action.type === 'expand')
    } else {
      onOpenKey(rows[action.index].key)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        role="listbox"
        tabIndex={0}
        aria-label={translate('auto.components.task-page.beads.listLabel', 'Beads issues')}
        aria-activedescendant={
          currentIndex >= 0 && currentRendered ? beadsRowDomId(rows[currentIndex].key) : undefined
        }
        onKeyDown={handleKeyDown}
        className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualItems.map((item) => {
            const row = rows[item.index]
            return (
              <div
                key={row.key}
                className="absolute left-0 right-0 top-0"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <BeadsIssueRow
                  row={row}
                  schema={props.schema}
                  // An epic whose children are filtered out still shows closed/total from the index.
                  progress={
                    row.kind === 'issue'
                      ? (props.progressByParent.get(row.issue.id) ?? null)
                      : (props.progressByParent.get(row.parentId) ?? null)
                  }
                  mode={props.mode}
                  current={row.key === currentKey}
                  onSelect={onSelectKey}
                  onToggle={onToggleKey}
                  onStartWorktree={props.onStartWorktree}
                />
              </div>
            )
          })}
        </div>
      </div>
      {props.hasMore || props.loading ? (
        <div className="flex h-10 shrink-0 items-center justify-center border-t border-border/50">
          {props.loading ? (
            <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <Button variant="ghost" size="sm" onClick={props.onLoadMore}>
              {translate('auto.components.task-page.beads.loadMore', 'Load more')}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
