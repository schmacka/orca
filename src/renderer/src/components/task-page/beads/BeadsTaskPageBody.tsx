import { useMemo, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import type { Repo } from '../../../../../shared/repo-types'
import type { BeadsRepoRef } from '@/runtime/runtime-beads-client'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { BeadsDetailPane } from './BeadsDetailPane'
import { BeadsFiltersBar } from './BeadsFiltersBar'
import { BeadsListPane } from './BeadsListPane'
import { BeadsSetupCard } from './BeadsSetupCard'
import { BeadsSplitLayout } from './BeadsSplitLayout'
import { useBeadsPageState } from './use-beads-page-state'

type BeadsTaskPageBodyProps = {
  repos: readonly Repo[]
  primaryRepoId: string | null
  onHide: () => void
}

function BeadsRepoView({ repo, onHide }: { repo: Repo; onHide: () => void }): React.JSX.Element {
  // Why: the store replaces Repo objects on every repo-list push. Effects keyed on that
  // identity would reinstall the poller and refetch mid-read; these four fields do not change.
  const repoRef = useMemo<BeadsRepoRef>(
    () => ({
      id: repo.id,
      path: repo.path,
      connectionId: repo.connectionId ?? null,
      executionHostId: repo.executionHostId ?? null
    }),
    [repo.id, repo.path, repo.connectionId, repo.executionHostId]
  )
  const page = useBeadsPageState(repoRef)
  const detailRef = useRef<HTMLElement | null>(null)
  if (!page.ready) {
    return (
      <BeadsSetupCard
        status={page.status}
        repoName={repo.displayName}
        onRecheck={page.recheck}
        onHide={onHide}
      />
    )
  }
  const list =
    page.listLoaded && page.rows.length === 0 ? (
      <p className="m-auto p-8 text-[13px] text-muted-foreground">
        {translate('auto.components.task-page.beads.noIssues', 'No issues match')}
      </p>
    ) : (
      <BeadsListPane
        rows={page.rows}
        schema={page.schema}
        progressByParent={page.progressByParent}
        mode={page.mode}
        currentKey={page.currentKey}
        hasMore={page.hasMore}
        loading={page.listLoading}
        onSelectKey={page.selectKey}
        onToggleKey={page.toggleKey}
        // Enter means "focus detail" (spec §4.1), not just select.
        onOpenKey={(key) => {
          page.selectKey(key)
          detailRef.current?.focus()
        }}
        onLoadMore={page.loadMore}
      />
    )
  return (
    <>
      <BeadsFiltersBar
        preset={page.query.preset}
        onPresetChange={page.setPreset}
        text={page.textInput}
        onTextChange={page.setText}
        filters={page.query.filters}
        onFiltersChange={page.setFilters}
        view={page.view}
        schema={page.schema}
        labelOptions={page.labelOptions}
        epicOptions={page.epicOptions}
        mode={page.mode}
        onModeChange={page.setMode}
        refreshing={page.listLoading}
        onRefresh={page.refresh}
      />
      {page.listError ? (
        <div className="flex items-start gap-2 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          <AlertCircle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{page.listError.message}</span>
          <Button variant="ghost" size="xs" onClick={page.refresh}>
            {translate('auto.components.task-page.beads.retry', 'Retry')}
          </Button>
        </div>
      ) : null}
      {page.pollError ? (
        <p className="px-3 py-1 text-[12px] text-muted-foreground">
          {translate(
            'auto.components.task-page.beads.pollStale',
            'Beads is unreachable — showing the last data loaded.'
          )}
        </p>
      ) : null}
      {page.indexTruncated ? (
        <p className="px-3 py-1 text-[12px] text-muted-foreground">
          {translate(
            'auto.components.task-page.beads.indexTruncated',
            'More than 2000 issues — epic progress and filter options cover the first 2000.'
          )}
        </p>
      ) : null}
      <BeadsSplitLayout
        list={list}
        detailRef={detailRef}
        detail={
          page.openIssueId ? (
            <BeadsDetailPane
              repo={repoRef}
              issueId={page.openIssueId}
              schema={page.schema}
              onOpenIssue={page.openIssue}
            />
          ) : null
        }
        detailTitle={page.openIssueId ?? ''}
        onCloseDetail={page.closeIssue}
      />
    </>
  )
}

export function BeadsTaskPageBody({
  repos,
  primaryRepoId,
  onHide
}: BeadsTaskPageBodyProps): React.JSX.Element {
  const [chosenRepoId, setChosenRepoId] = useState<string | null>(null)
  const repo = useMemo(
    () => repos.find((entry) => entry.id === (chosenRepoId ?? primaryRepoId)) ?? repos[0] ?? null,
    [repos, chosenRepoId, primaryRepoId]
  )
  return (
    <div className="mt-3 flex min-h-0 max-h-full flex-1 flex-col overflow-hidden rounded-md border border-border/50 bg-background shadow-sm">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/50 bg-muted/35 px-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
          {translate('auto.components.task-page.beads.providerLabel', 'Beads')}
        </span>
        {repos.length > 1 && repo ? (
          <Select value={repo.id} onValueChange={setChosenRepoId}>
            <SelectTrigger size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {repos.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {repo ? (
        <BeadsRepoView key={repo.id} repo={repo} onHide={onHide} />
      ) : (
        <p className="m-auto p-8 text-[13px] text-muted-foreground">
          {translate(
            'auto.components.task-page.beads.selectRepo',
            'Select a repository to see its beads'
          )}
        </p>
      )}
    </div>
  )
}
