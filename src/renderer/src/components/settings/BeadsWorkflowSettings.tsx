import { useState } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { SettingsRow, SettingsSwitchRow } from './SettingsFormControls'

/** Beads-specific workflow prefs (bd write actor, auto-claim on worktree creation), shown under the Beads card in Tasks settings. */
export function BeadsWorkflowSettings(): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const actor = settings?.beadsActor ?? null
  const autoClaim = settings?.beadsAutoClaim ?? true

  // Render-time sync (not an effect), mirroring NumberField: an external change (another
  // window, a reset) lands in the field without yanking characters mid-edit.
  const [actorDraft, setActorDraft] = useState(actor ?? '')
  const [lastActor, setLastActor] = useState(actor)
  if (actor !== lastActor) {
    setLastActor(actor)
    setActorDraft(actor ?? '')
  }

  const actorLabel = translate(
    'auto.components.settings.BeadsWorkflowSettings.actorLabel',
    'Beads actor'
  )

  const commitActor = (): void => {
    const trimmed = actorDraft.trim()
    const next = trimmed === '' ? null : trimmed
    setActorDraft(trimmed)
    void updateSettings({ beadsActor: next }).catch(() => {
      toast.error(
        translate(
          'auto.components.settings.BeadsWorkflowSettings.actorSaveFailed',
          'Failed to save the Beads actor.'
        )
      )
    })
  }

  const toggleAutoClaim = (): void => {
    void updateSettings({ beadsAutoClaim: !autoClaim }).catch(() => {
      toast.error(
        translate(
          'auto.components.settings.BeadsWorkflowSettings.autoClaimSaveFailed',
          'Failed to save the auto-claim setting.'
        )
      )
    })
  }

  return (
    <div className="space-y-1 border-t border-border/50 pt-2">
      <SettingsRow
        label={actorLabel}
        description={translate(
          'auto.components.settings.BeadsWorkflowSettings.actorDescription',
          "Recorded as the author of bd writes (issues, comments, claims). Leave empty to use bd's own default."
        )}
        control={
          <Input
            aria-label={actorLabel}
            value={actorDraft}
            placeholder={translate(
              'auto.components.settings.BeadsWorkflowSettings.actorPlaceholder',
              'bd default'
            )}
            onChange={(e) => setActorDraft(e.target.value)}
            onBlur={commitActor}
            className="w-48"
          />
        }
      />
      <SettingsSwitchRow
        label={translate(
          'auto.components.settings.BeadsWorkflowSettings.autoClaimLabel',
          'Claim a bead when its worktree is created'
        )}
        description={translate(
          'auto.components.settings.BeadsWorkflowSettings.autoClaimDescription',
          'Runs bd update --claim for the bead a new worktree starts from.'
        )}
        checked={autoClaim}
        onChange={toggleAutoClaim}
      />
    </div>
  )
}
