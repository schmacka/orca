import { isJsonRecord } from '../../shared/beads/beads-json-value'
import { BeadsError } from './beads-error'

function preview(text: string): string {
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

// Why: under BD_JSON_ENVELOPE=1 (announced default for bd 2.0) payloads arrive as
// {"schema_version":1,"data":…}. Plain objects such as `bd count` also carry
// schema_version, so both keys are required before unwrapping.
export function unwrapBdJsonEnvelope(parsed: unknown): unknown {
  return isJsonRecord(parsed) && 'schema_version' in parsed && 'data' in parsed
    ? parsed.data
    : parsed
}

export function parseBdJson(stdout: string): unknown {
  const trimmed = stdout.trim()
  if (trimmed === '') {
    return null
  }
  let parsed: unknown
  try {
    parsed = unwrapBdJsonEnvelope(JSON.parse(trimmed))
  } catch {
    throw new BeadsError('failed', `bd returned unparseable JSON: ${preview(trimmed)}`)
  }
  // Why: bd can exit 0 while printing {"error": …}; treating it as data hides the failure.
  if (isJsonRecord(parsed) && typeof parsed.error === 'string') {
    throw new BeadsError('failed', `bd reported an error: ${parsed.error}`)
  }
  return parsed
}

export function parseBdJsonList(stdout: string): unknown[] {
  const parsed = parseBdJson(stdout)
  // Why: some list commands (e.g. `bd gate list --json`) print `null` for "none".
  if (parsed === null) {
    return []
  }
  if (!Array.isArray(parsed)) {
    throw new BeadsError('failed', `bd returned a non-list JSON payload: ${preview(stdout.trim())}`)
  }
  return parsed
}

export function parseBdJsonRecord(stdout: string): Record<string, unknown> {
  const parsed = parseBdJson(stdout)
  if (!isJsonRecord(parsed)) {
    throw new BeadsError(
      'failed',
      `bd returned a non-object JSON payload: ${preview(stdout.trim())}`
    )
  }
  return parsed
}
