import type { TaskPageComposerActionsModel } from '../../use-task-page-composer-actions'
import { translate } from '@/i18n/i18n'
import { BeadsTaskPageBody } from './BeadsTaskPageBody'

export function TaskPageBeadsContent({
  model
}: {
  model: TaskPageComposerActionsModel
}): React.JSX.Element {
  const { selectedRepos, primaryRepo, hideTaskSource } = model
  return (
    <BeadsTaskPageBody
      repos={selectedRepos}
      primaryRepoId={primaryRepo?.id ?? null}
      onHide={() =>
        hideTaskSource('beads', translate('auto.components.task-page.beads.providerLabel', 'Beads'))
      }
    />
  )
}
