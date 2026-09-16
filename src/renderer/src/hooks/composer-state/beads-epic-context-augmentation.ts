import { useEffect, useRef } from 'react'
import type * as React from 'react'
import {
  fetchBeadsEpicLinkedContext,
  type BeadsEpicLinkedContextSource
} from '@/lib/beads-epic-launch-context'
import type { LinkedWorkItemSummary } from '@/lib/new-workspace'
import type { BeadsRuntimeSettings } from '@/runtime/runtime-beads-client'

export type BeadsEpicContextAugmentationInput = {
  initialBeadsEpicSource: BeadsEpicLinkedContextSource | null
  settings: BeadsRuntimeSettings
  setLinkedWorkItem: React.Dispatch<React.SetStateAction<LinkedWorkItemSummary | null>>
}

// Why: mirrors async-composer-state.ts's loadedIssueCommand — fetch after the composer
// is already open (the click never waits on bd, spec §5.1 item 2) and key the result on
// the epic id, the same way that hook keys on contextKey, so a response for a bead this
// composer no longer points at can never attach. This hook is the only place the
// composer knows a beads epic can carry extra linked context; the bd lookup and the
// block text live in beads-epic-launch-context.ts.
export function useBeadsEpicContextAugmentation(input: BeadsEpicContextAugmentationInput): void {
  const { initialBeadsEpicSource, settings, setLinkedWorkItem } = input
  const startedForEpicIdRef = useRef<string | null>(null)

  useEffect(() => {
    const epicId = initialBeadsEpicSource?.epic.id ?? null
    if (!initialBeadsEpicSource || startedForEpicIdRef.current === epicId) {
      return
    }
    startedForEpicIdRef.current = epicId
    const source = initialBeadsEpicSource
    let cancelled = false

    void fetchBeadsEpicLinkedContext(settings, source).then((linkedContext) => {
      if (cancelled || !linkedContext) {
        return
      }
      // Why: only attach if the composer's linked item is still this same epic —
      // the user may have removed or swapped the linked item while the fetch was in flight.
      setLinkedWorkItem((current) =>
        current?.beadsIdentifier === source.epic.id ? { ...current, linkedContext } : current
      )
    })

    return () => {
      cancelled = true
    }
  }, [initialBeadsEpicSource, settings, setLinkedWorkItem])
}
