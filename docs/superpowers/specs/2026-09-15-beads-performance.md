# Beads performance at 3k issues — results

- **Date:** 2026-09-15
- **Machine:** `sysctl -n machdep.cpu.brand_string` → `Apple A18 Pro`
- **bd version:** `bd version 1.2.2 (Homebrew)`
- **Script:** `config/scripts/measure-beads-performance.mjs`
- **Run:** `node config/scripts/measure-beads-performance.mjs 3000 5`

## Method

Generated a fresh 3,000-issue database in a temp dir (never this repo's `.beads`) via `bd import -`, then timed the bd calls Orca's backend makes: `version`, `context --json`, `vc status --json`, `statuses --json`, `list --json --limit=201`, `list --json --all --limit=2001`, `ready --json --limit=201`, `blocked --json`, `search --json --query=… --limit=201`, `count --json`, `show … --json --include-dependents --include-comments`, plus 6 parallel `list --limit=201` calls (wall time). 5 samples per case (median/max reported); a smaller 50-issue smoke run first confirmed `bd import -` accepts every generated field (`status`, `labels` included — no removal needed). The temp dir was deleted after each run.

Numbers looked stable on the first run (max within ~1–3% of median for every case), so per the instruction to repeat only if noisy, a second run was not taken. A reviewer working Task 14 in parallel does not touch files and is unlikely to have skewed CPU-bound `bd` latency meaningfully.

## Results

Script output (header line quoted with its duplicated `bd` prefix removed — the script prints `bd ${bd(['version']).trim()}`, and `bd version` already returns a string starting with `bd`):

bd 1.2.2 (Homebrew) — 3000 issues, median of 5 runs
import: 16918 ms

| command                          | median ms | max ms |
| -------------------------------- | --------: | -----: |
| version                          |        84 |     84 |
| context                          |        90 |     92 |
| vc status                        |       296 |    298 |
| statuses                         |       249 |    250 |
| list (201)                       |       428 |    439 |
| list all (2001)                  |       450 |    459 |
| ready (201)                      |       386 |    394 |
| blocked                          |       208 |    211 |
| search (201)                     |       376 |    388 |
| count                            |       204 |    209 |
| show                             |       575 |    577 |
| 6 × list (201) in parallel, wall |      3457 |      – |

## Output size

`bd list --json --all --limit=2001` on the same 3,000-issue database produced **701,131 bytes** (≈ 685 KiB) of JSON for 2,000 rows. This is well under the 4 MB cap the SSH relay imposes on command output (an earlier review flagged this cap), so the 2000-row list page stays safely within the limit — no truncation risk at this scale.

## Conclusion (spec §9 rule)

Spec §9: _"If list calls take more than 1 s, add narrower list fields or longer poll intervals before M2."_

`list (201)` median is **428 ms** (max 439 ms), well under the 1000 ms threshold. `list all (2001)` median is 450 ms, also well under. **No change needed before M2.**

No follow-up bead was created — the ≤ 1 s condition was not triggered, and the 2000-row payload (701 KB) is well under the 4 MB SSH relay output cap.
