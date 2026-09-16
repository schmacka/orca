import { Circle, CircleCheck, CircleDot, Snowflake, type LucideIcon } from 'lucide-react'
import type { BeadsStatusCategory } from '../../../../../shared/beads/beads-issue-types'

export function beadsStatusIcon(category: BeadsStatusCategory): LucideIcon {
  switch (category) {
    case 'active':
      return Circle
    case 'wip':
      return CircleDot
    case 'frozen':
      return Snowflake
    case 'done':
      return CircleCheck
  }
}

export function beadsStatusToneClass(category: BeadsStatusCategory): string {
  switch (category) {
    case 'active':
      return 'text-muted-foreground'
    case 'wip':
      return 'text-foreground'
    case 'frozen':
      return 'text-muted-foreground'
    case 'done':
      return 'text-status-success'
  }
}
