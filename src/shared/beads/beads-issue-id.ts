const BEADS_ISSUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const BEADS_ISSUE_ID_MAX_LENGTH = 128

// Why: ids are placed in argv; a leading '-' or a separator would let a value
// become a bd flag or a second argument.
export function isBeadsIssueId(value: string): boolean {
  return value.length <= BEADS_ISSUE_ID_MAX_LENGTH && BEADS_ISSUE_ID_PATTERN.test(value)
}
