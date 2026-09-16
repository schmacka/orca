import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { BeadsWorkspaceStatus } from '../../../../../shared/beads/beads-issue-types'
import { BeadsIcon } from '@/components/icons/BeadsIcon'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { BeadsLoad } from '@/store/slices/beads-slice-contract'

const INSTALL_GUIDE_URL = 'https://github.com/gastownhall/beads'

export type BeadsSetupState =
  | 'loading'
  | 'error'
  | 'missing'
  | 'outdated'
  | 'uninitialized'
  | 'ready'

export function beadsSetupState(status: BeadsLoad<BeadsWorkspaceStatus>): BeadsSetupState {
  const data = status.data
  if (data) {
    if (!data.bdInstalled) {
      return 'missing'
    }
    if (!data.versionSupported) {
      return 'outdated'
    }
    return data.initialized ? 'ready' : 'uninitialized'
  }
  return status.error ? 'error' : 'loading'
}

type BeadsSetupCardProps = {
  status: BeadsLoad<BeadsWorkspaceStatus>
  repoName: string
  onRecheck: () => void
  onHide: () => void
}

function CardShell(props: {
  title: string
  text: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="mt-3 flex flex-col items-center justify-center rounded-md border border-border/50 bg-muted/50 px-6 py-14 text-center shadow-sm">
      <BeadsIcon className="mb-4 size-8 text-muted-foreground/60" />
      <p className="text-base font-medium text-foreground">{props.title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{props.text}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{props.children}</div>
    </div>
  )
}

export function BeadsSetupCard({
  status,
  repoName,
  onRecheck,
  onHide
}: BeadsSetupCardProps): React.JSX.Element | null {
  const state = beadsSetupState(status)
  const hideButton = (
    <Button variant="outline" onClick={onHide}>
      {translate('auto.components.task-page.beads.setupHide', 'Hide Beads')}
    </Button>
  )
  const recheckButton = (
    <Button variant="outline" onClick={onRecheck}>
      {translate('auto.components.task-page.beads.setupRecheck', 'Re-check')}
    </Button>
  )
  switch (state) {
    case 'ready':
      return null
    case 'loading':
      return (
        <div role="status" aria-busy className="mt-4 flex items-center justify-center py-14">
          <Loader2 aria-hidden className="size-5 animate-spin text-muted-foreground" />
        </div>
      )
    case 'missing':
      return (
        <CardShell
          title={translate('auto.components.task-page.beads.setupMissingTitle', 'Install bd')}
          text={translate(
            'auto.components.task-page.beads.setupMissingText',
            'bd was not found on the host that runs {{repo}}.',
            { repo: repoName }
          )}
        >
          <Button onClick={() => void window.api.shell.openUrl(INSTALL_GUIDE_URL)}>
            {translate('auto.components.task-page.beads.setupOpenGuide', 'Open install guide')}
          </Button>
          {recheckButton}
          {hideButton}
        </CardShell>
      )
    case 'outdated':
      return (
        <CardShell
          title={translate('auto.components.task-page.beads.setupOutdatedTitle', 'Upgrade bd')}
          text={translate(
            'auto.components.task-page.beads.setupOutdatedText',
            'Found bd {{version}}; Orca needs bd 1.2.0 or newer.',
            { version: status.data?.bdVersion ?? '?' }
          )}
        >
          {recheckButton}
          {hideButton}
        </CardShell>
      )
    case 'uninitialized':
      return (
        <CardShell
          title={translate('auto.components.task-page.beads.setupInitTitle', 'Initialize beads')}
          text={translate(
            'auto.components.task-page.beads.setupInitText',
            'Run bd init in {{repo}}, then re-check.',
            { repo: repoName }
          )}
        >
          <Button
            onClick={() => {
              void window.api.ui.writeClipboardText('bd init')
              toast.success(
                translate('auto.components.task-page.beads.setupCopied', 'Copied bd init')
              )
            }}
          >
            {translate('auto.components.task-page.beads.setupCopyInit', 'Copy bd init')}
          </Button>
          {recheckButton}
          {hideButton}
        </CardShell>
      )
    case 'error':
      return (
        <CardShell
          title={
            status.error?.kind === 'host-offline'
              ? translate(
                  'auto.components.task-page.beads.setupOfflineTitle',
                  'The host is offline'
                )
              : translate(
                  'auto.components.task-page.beads.setupErrorTitle',
                  'Beads could not be read'
                )
          }
          text={status.error?.message ?? ''}
        >
          <Button onClick={onRecheck}>
            {translate('auto.components.task-page.beads.setupRetry', 'Retry')}
          </Button>
          {hideButton}
        </CardShell>
      )
  }
}
