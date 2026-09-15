import type {
  BeadsSchema,
  BeadsStatusCategory,
  BeadsStatusDefinition,
  BeadsTypeDefinition
} from './beads-issue-types'
import { isJsonRecord, readOptionalString } from './beads-json-value'

const STATUS_CATEGORIES: readonly BeadsStatusCategory[] = ['active', 'wip', 'frozen', 'done']

const FALLBACK_TYPE_NAMES = [
  'task',
  'bug',
  'feature',
  'chore',
  'epic',
  'decision',
  'spike',
  'story',
  'milestone'
]

// Why: bd 1.2.2 built-ins. Used only when `bd statuses`/`bd types` return nothing
// usable, so the UI still groups the stored statuses instead of showing no columns.
export const FALLBACK_BEADS_SCHEMA: BeadsSchema = {
  statuses: [
    { name: 'open', category: 'active', description: 'Available to work (default)', icon: '○' },
    { name: 'in_progress', category: 'wip', description: 'Actively being worked on', icon: '◐' },
    { name: 'blocked', category: 'wip', description: 'Blocked by a dependency', icon: '●' },
    {
      name: 'deferred',
      category: 'frozen',
      description: 'Deliberately put on ice for later',
      icon: '❄'
    },
    { name: 'closed', category: 'done', description: 'Completed', icon: '✓' }
  ],
  types: FALLBACK_TYPE_NAMES.map((name) => ({ name, description: '' }))
}

function toStatusCategory(value: unknown): BeadsStatusCategory | null {
  return STATUS_CATEGORIES.find((category) => category === value) ?? null
}

// Why: bd names its arrays built_in_statuses / core_types today and documents
// custom ones; reading every array with the suffix keeps custom entries without
// hardcoding key names that may change between bd versions.
function collectEntries(raw: unknown, keySuffix: string): unknown[] {
  if (!isJsonRecord(raw)) {
    return []
  }
  const entries: unknown[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (key.endsWith(keySuffix) && Array.isArray(value)) {
      entries.push(...value)
    }
  }
  return entries
}

export function normalizeBeadsStatuses(raw: unknown): BeadsStatusDefinition[] {
  const seen = new Set<string>()
  const statuses: BeadsStatusDefinition[] = []
  for (const entry of collectEntries(raw, '_statuses')) {
    if (!isJsonRecord(entry)) {
      continue
    }
    const name = readOptionalString(entry.name)
    const category = toStatusCategory(entry.category)
    if (!name || !category || seen.has(name)) {
      continue
    }
    seen.add(name)
    statuses.push({
      name,
      category,
      description: readOptionalString(entry.description) ?? '',
      icon: readOptionalString(entry.icon) ?? ''
    })
  }
  return statuses
}

function readTypeName(entry: unknown): string | undefined {
  if (typeof entry === 'string') {
    return readOptionalString(entry)
  }
  return isJsonRecord(entry) ? readOptionalString(entry.name) : undefined
}

export function normalizeBeadsTypes(raw: unknown): BeadsTypeDefinition[] {
  const seen = new Set<string>()
  const types: BeadsTypeDefinition[] = []
  for (const entry of collectEntries(raw, '_types')) {
    const name = readTypeName(entry)
    if (!name || seen.has(name)) {
      continue
    }
    seen.add(name)
    const description = isJsonRecord(entry) ? readOptionalString(entry.description) : undefined
    types.push({ name, description: description ?? '' })
  }
  return types
}

export function beadsStatusCategory(schema: BeadsSchema, status: string): BeadsStatusCategory {
  // Why: an unknown status is still real work; 'active' keeps it visible in open
  // presets instead of hiding it, and the raw status name is never rewritten.
  return schema.statuses.find((definition) => definition.name === status)?.category ?? 'active'
}
