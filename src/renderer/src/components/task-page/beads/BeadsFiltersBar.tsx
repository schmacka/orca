import { ChevronDown, List, ListTree, RefreshCw, Search } from 'lucide-react'
import type { BeadsListView } from '../../../../../shared/beads/beads-contract'
import type { BeadsSchema } from '../../../../../shared/beads/beads-issue-types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  BEADS_PRESETS,
  EMPTY_BEADS_FILTERS,
  countActiveBeadsFilters,
  supportedBeadsFilterKeys,
  type BeadsFilterKey,
  type BeadsFilterValues,
  type BeadsPreset
} from './beads-list-request'
import type { BeadsListMode } from './beads-tree-rows'

type BeadsFiltersBarProps = {
  preset: BeadsPreset
  onPresetChange: (preset: BeadsPreset) => void
  text: string
  onTextChange: (text: string) => void
  filters: BeadsFilterValues
  onFiltersChange: (filters: BeadsFilterValues) => void
  view: BeadsListView
  schema: BeadsSchema
  labelOptions: readonly string[]
  epicOptions: readonly { id: string; title: string }[]
  mode: BeadsListMode
  onModeChange: (mode: BeadsListMode) => void
  refreshing: boolean
  onRefresh: () => void
}

const ANY = '__any__'

function presetLabel(preset: BeadsPreset): string {
  switch (preset) {
    case 'ready':
      return translate('auto.components.task-page.beads.presetReady', 'Ready')
    case 'in_progress':
      return translate('auto.components.task-page.beads.presetInProgress', 'In progress')
    case 'blocked':
      return translate('auto.components.task-page.beads.presetBlocked', 'Blocked')
    case 'open':
      return translate('auto.components.task-page.beads.presetOpen', 'All open')
    case 'closed':
      return translate('auto.components.task-page.beads.presetClosed', 'Closed')
  }
}

function FilterTrigger({
  label,
  value,
  disabled
}: {
  label: string
  value: string | null
  disabled: boolean
}): React.JSX.Element {
  return (
    <DropdownMenuTrigger asChild disabled={disabled}>
      <Button
        variant="outline"
        size="xs"
        disabled={disabled}
        title={
          disabled
            ? translate(
                'auto.components.task-page.beads.filterUnavailable',
                'Not available for this view'
              )
            : undefined
        }
      >
        {value ? `${label}: ${value}` : label}
        <ChevronDown aria-hidden className="size-3" />
      </Button>
    </DropdownMenuTrigger>
  )
}

export function BeadsFiltersBar(props: BeadsFiltersBarProps): React.JSX.Element {
  const { filters, onFiltersChange, view } = props
  const supported = supportedBeadsFilterKeys(view)
  const unavailable = (key: BeadsFilterKey): boolean => !supported.has(key)
  const setFilter = <K extends keyof BeadsFilterValues>(
    key: K,
    value: BeadsFilterValues[K]
  ): void => onFiltersChange({ ...filters, [key]: value })
  // Fall back to the raw id: the index may not be loaded, or the parent may not be an epic.
  const epicTitle = filters.parent ?? null

  return (
    <div className="flex flex-col gap-2 border-b border-border/50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {BEADS_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={props.preset === preset}
            onClick={() => props.onPresetChange(preset)}
            className={cn(
              'h-7 rounded-full px-2.5 text-[12px] transition',
              props.preset === preset
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {presetLabel(preset)}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <ToggleGroup
            type="single"
            value={props.mode}
            onValueChange={(value) => {
              if (value === 'tree' || value === 'flat') {
                props.onModeChange(value)
              }
            }}
          >
            <ToggleGroupItem
              value="tree"
              aria-label={translate('auto.components.task-page.beads.treeView', 'Tree view')}
            >
              <ListTree aria-hidden className="size-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="flat"
              aria-label={translate('auto.components.task-page.beads.flatView', 'Flat view')}
            >
              <List aria-hidden className="size-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={translate('auto.components.task-page.beads.refresh', 'Refresh')}
            onClick={props.onRefresh}
          >
            <RefreshCw aria-hidden className={cn('size-3.5', props.refreshing && 'animate-spin')} />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={props.text}
            onChange={(event) => props.onTextChange(event.target.value)}
            placeholder={translate(
              'auto.components.task-page.beads.searchPlaceholder',
              'Search beads'
            )}
            className="h-7 w-56 rounded-md border border-input bg-transparent pl-7 pr-2 text-[12px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <DropdownMenu>
          <FilterTrigger
            label={translate('auto.components.task-page.beads.filterType', 'Type')}
            value={filters.type}
            disabled={unavailable('type')}
          />
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={filters.type ?? ANY}
              onValueChange={(value) => setFilter('type', value === ANY ? null : value)}
            >
              <DropdownMenuRadioItem value={ANY}>
                {translate('auto.components.task-page.beads.filterAny', 'Any')}
              </DropdownMenuRadioItem>
              {props.schema.types.map((type) => (
                <DropdownMenuRadioItem key={type.name} value={type.name}>
                  {type.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <FilterTrigger
            label={translate('auto.components.task-page.beads.filterPriority', 'Priority')}
            value={filters.priority === null ? null : `P${filters.priority}`}
            disabled={unavailable('priority')}
          />
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={filters.priority === null ? ANY : String(filters.priority)}
              onValueChange={(value) => setFilter('priority', value === ANY ? null : Number(value))}
            >
              <DropdownMenuRadioItem value={ANY}>
                {translate('auto.components.task-page.beads.filterAny', 'Any')}
              </DropdownMenuRadioItem>
              {[0, 1, 2, 3, 4].map((priority) => (
                <DropdownMenuRadioItem key={priority} value={String(priority)}>
                  {`P${priority}`}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <FilterTrigger
            label={translate('auto.components.task-page.beads.filterEpic', 'Epic')}
            value={epicTitle}
            disabled={unavailable('parent')}
          />
          <DropdownMenuContent align="start">
            <DropdownMenuRadioGroup
              value={filters.parent ?? ANY}
              onValueChange={(value) => setFilter('parent', value === ANY ? null : value)}
            >
              <DropdownMenuRadioItem value={ANY}>
                {translate('auto.components.task-page.beads.filterAny', 'Any')}
              </DropdownMenuRadioItem>
              {props.epicOptions.map((epic) => (
                <DropdownMenuRadioItem key={epic.id} value={epic.id}>
                  {`${epic.id} · ${epic.title}`}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <FilterTrigger
            label={translate('auto.components.task-page.beads.filterLabels', 'Labels')}
            value={filters.labels.length > 0 ? filters.labels.join(', ') : null}
            disabled={unavailable('labels')}
          />
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>
              {translate(
                'auto.components.task-page.beads.filterLabelsHint',
                'Issues must have all selected labels'
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {props.labelOptions.map((label) => (
              <DropdownMenuCheckboxItem
                key={label}
                checked={filters.labels.includes(label)}
                onCheckedChange={(checked) =>
                  setFilter(
                    'labels',
                    checked === true
                      ? [...filters.labels, label]
                      : filters.labels.filter((entry) => entry !== label)
                  )
                }
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          value={filters.assignee}
          disabled={unavailable('assignee')}
          onChange={(event) => setFilter('assignee', event.target.value)}
          placeholder={translate('auto.components.task-page.beads.filterAssignee', 'Assignee')}
          className="h-7 w-32 rounded-md border border-input bg-transparent px-2 text-[12px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
        {countActiveBeadsFilters(filters, view) > 0 ? (
          <Button variant="ghost" size="xs" onClick={() => onFiltersChange(EMPTY_BEADS_FILTERS)}>
            {translate('auto.components.task-page.beads.clearFilters', 'Clear filters')}
          </Button>
        ) : null}
        {view === 'search' ? (
          // Why: `bd search` ignores the preset and the epic filter; without this the
          // highlighted "Ready" button silently lies about what is on screen.
          <span className="text-[12px] text-muted-foreground">
            {translate(
              'auto.components.task-page.beads.searchOverridesPreset',
              'Search looks at every issue and ignores the preset and epic filter.'
            )}
          </span>
        ) : null}
      </div>
    </div>
  )
}
