import { useState } from 'react'
import { useMeasuredWidth } from '@/components/right-sidebar/right-sidebar-measured-width'
import { VisuallyHidden } from 'radix-ui'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

const SPLIT_BREAKPOINT_PX = 880
const LIST_WIDTH_DEFAULT_PX = 460
const LIST_WIDTH_MIN_PX = 320
const LIST_WIDTH_MAX_PX = 720

// `null` is the first render, before measurement: assume wide, and because both
// layouts share one tree the correction costs a class swap, not a remount.
export function isBeadsSplitWide(width: number | null): boolean {
  return width === null || width >= SPLIT_BREAKPOINT_PX
}

type BeadsSplitLayoutProps = {
  list: React.ReactNode
  detail: React.ReactNode | null
  detailTitle: string
  /** Focused when the list handles Enter ("focus detail", spec §4.1). */
  detailRef?: React.RefObject<HTMLElement | null>
  onCloseDetail: () => void
}

export function BeadsSplitLayout({
  list,
  detail,
  detailTitle,
  detailRef,
  onCloseDetail
}: BeadsSplitLayoutProps): React.JSX.Element {
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const measureRef = useMeasuredWidth(setContainerWidth)
  const [listWidth, setListWidth] = useState(LIST_WIDTH_DEFAULT_PX)
  const { containerRef, isResizing, onResizeStart } = useSidebarResize<HTMLElement>({
    isOpen: true,
    width: listWidth,
    minWidth: LIST_WIDTH_MIN_PX,
    maxWidth: LIST_WIDTH_MAX_PX,
    deltaSign: 1,
    setWidth: setListWidth
  })

  // Why: one tree for both layouts. Returning a different tree per breakpoint remounts
  // the list — the virtualizer loses its scroll offset and the rows flash — and the first
  // render always measures `null`, so every narrow window would see that flash on open.
  const wide = isBeadsSplitWide(containerWidth)
  return (
    <div
      ref={measureRef}
      className={cn('flex min-h-0 flex-1', wide ? 'overflow-hidden' : 'flex-col')}
    >
      <aside
        ref={containerRef}
        className={cn(
          'relative flex min-h-0 flex-col',
          wide ? 'shrink-0 border-r border-border' : 'flex-1'
        )}
        style={wide ? { width: listWidth } : undefined}
      >
        {list}
        {wide ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={translate(
              'auto.components.task-page.beads.resizeList',
              'Resize issue list'
            )}
            onMouseDown={onResizeStart}
            className={cn(
              'group absolute -right-1.5 top-0 z-20 flex h-full w-3 cursor-col-resize items-stretch justify-center',
              isResizing && 'bg-ring/10'
            )}
          >
            <div
              className={cn(
                'h-full w-px bg-border transition-colors group-hover:bg-ring/50',
                isResizing && 'bg-ring'
              )}
            />
          </div>
        ) : null}
      </aside>
      {wide ? (
        <section
          ref={detailRef}
          tabIndex={-1}
          className="flex min-h-0 min-w-0 flex-1 flex-col focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {detail ?? (
            <p className="m-auto text-[13px] text-muted-foreground">
              {translate(
                'auto.components.task-page.beads.selectIssue',
                'Select an issue to see its details'
              )}
            </p>
          )}
        </section>
      ) : (
        <Sheet open={detail !== null} onOpenChange={(open) => !open && onCloseDetail()}>
          <SheetContent side="right" className="w-full sm:max-w-[640px]">
            {/* Radix requires a title; VisuallyHidden.Root is how the rest of the app hides it. */}
            <VisuallyHidden.Root asChild>
              <SheetTitle>{detailTitle}</SheetTitle>
            </VisuallyHidden.Root>
            {detail}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
