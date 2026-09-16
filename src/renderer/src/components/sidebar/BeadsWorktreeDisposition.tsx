import { useId, type JSX } from 'react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { translate } from '@/i18n/i18n'
import type { BeadsDisposition } from './beads-worktree-disposition'

const DISPOSITION_VALUES: readonly BeadsDisposition[] = ['close', 'unclaim', 'leave']

// Why a switch, not a key/fallback lookup table: the localization extraction
// script only sees literal translate(key, fallback) call sites, not ones
// indirected through a variable.
function dispositionLabel(value: BeadsDisposition): string {
  switch (value) {
    case 'close':
      return translate('auto.components.sidebar.beadsDispositionClose', 'Close with reason')
    case 'unclaim':
      return translate('auto.components.sidebar.beadsDispositionUnclaim', 'Unclaim (back to open)')
    case 'leave':
      return translate('auto.components.sidebar.beadsDispositionLeave', 'Leave as is')
  }
}

export function BeadsWorktreeDisposition({
  needed,
  disposition,
  onDispositionChange,
  reason,
  onReasonChange
}: {
  needed: boolean
  disposition: BeadsDisposition
  onDispositionChange: (disposition: BeadsDisposition) => void
  reason: string
  onReasonChange: (reason: string) => void
}): JSX.Element | null {
  const groupName = useId()
  const reasonId = useId()

  if (!needed) {
    return null
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {translate(
          'auto.components.sidebar.beadsDispositionLegend',
          'What should happen to the linked bead?'
        )}
      </legend>
      <div className="space-y-1.5">
        {DISPOSITION_VALUES.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-border p-2 text-xs has-[:checked]:border-ring has-[:checked]:ring-1 has-[:checked]:ring-ring"
          >
            <input
              type="radio"
              name={groupName}
              value={value}
              checked={disposition === value}
              onChange={() => onDispositionChange(value)}
            />
            {dispositionLabel(value)}
          </label>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor={reasonId}>
          {translate('auto.components.sidebar.beadsDispositionReasonLabel', 'Reason')}
        </Label>
        <Textarea
          id={reasonId}
          value={reason}
          disabled={disposition !== 'close'}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder={translate(
            'auto.components.sidebar.beadsDispositionReasonPlaceholder',
            'Why is this bead closing?'
          )}
        />
      </div>
    </fieldset>
  )
}
