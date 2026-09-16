export function BeadsIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      {/* Why: a monochrome chain of beads, matching Orca's single-color provider icons. */}
      <circle cx="5" cy="12" r="3" />
      <circle cx="12" cy="12" r="3" />
      <circle cx="19" cy="12" r="3" />
      <rect x="7.5" y="11.25" width="2" height="1.5" rx="0.75" />
      <rect x="14.5" y="11.25" width="2" height="1.5" rx="0.75" />
    </svg>
  )
}
