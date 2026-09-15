import { BEADS_LIST_MAX_LIMIT } from '../../shared/beads/beads-contract'
import { isBeadsIssueId } from '../../shared/beads/beads-issue-id'
import { BeadsError } from './beads-error'

// Why: statuses, types and similar values become flag values that bd splits on
// commas or matches exactly; restricting them to word characters keeps one value
// from turning into several.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/

function invalidInput(message: string): BeadsError {
  return new BeadsError('invalid-input', message)
}

export function requireIssueId(id: string): string {
  if (!isBeadsIssueId(id)) {
    throw invalidInput(`Invalid beads issue id: ${JSON.stringify(id)}`)
  }
  return id
}

export function requireToken(value: string, field: string): string {
  if (!TOKEN_PATTERN.test(value)) {
    throw invalidInput(`Invalid ${field}: ${JSON.stringify(value)}`)
  }
  return value
}

export function requireSingleLine(value: string, field: string): string {
  if (value.trim() === '' || /[\r\n]/.test(value)) {
    throw invalidInput(`The ${field} must be a single non-empty line.`)
  }
  return value
}

export function requireText(value: string, field: string): string {
  const trimmed = value.trim()
  if (trimmed === '') {
    throw invalidInput(`The ${field} must not be empty.`)
  }
  return trimmed
}

export function requireLabel(label: string): string {
  if (label.trim() === '' || /[,\r\n]/.test(label)) {
    throw invalidInput(`Invalid label: ${JSON.stringify(label)}`)
  }
  return label
}

// Why: IPC args come from the renderer untyped at runtime; a string where a list is
// expected would otherwise be iterated character by character into flags.
export function requireStringList(value: unknown, field: string): string[] {
  if (value === undefined) {
    return []
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw invalidInput(`The ${field} must be a list of strings.`)
  }
  return value
}

export function requirePriority(priority: number): number {
  if (!Number.isInteger(priority) || priority < 0 || priority > 4) {
    throw invalidInput('Priority must be an integer from 0 to 4.')
  }
  return priority
}

/** Limit passed to bd: one above the page limit so callers can detect "more". */
export function requireFetchLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > BEADS_LIST_MAX_LIMIT + 1) {
    throw invalidInput(`Invalid list limit: ${limit}`)
  }
  return limit
}

export function requirePageLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > BEADS_LIST_MAX_LIMIT) {
    throw invalidInput(`Invalid list limit: ${limit}`)
  }
  return limit
}
