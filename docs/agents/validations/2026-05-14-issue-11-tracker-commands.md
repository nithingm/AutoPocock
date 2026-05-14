# Issue 11 Validation: Tracker Commands

Date: 2026-05-14
Repo state: `D:\Projects\AutoPocock`
Validator: Codex

## Scope

Manual validation in real repo state for:

- `pnpm ops board`
- `pnpm ops github:init -- --apply`
- `pnpm ops mirror`

## Environment And Inputs Used

- `.ai/ops.config.json` configured for `nithingm/AutoPocock` and GitHub Project `1`
- `gh` installed: `gh version 2.92.0 (2026-04-28)`
- `gh auth status` authenticated as `nithingm`
- Real local artifacts already present under `docs/agents/completions/` and `docs/agents/handoffs/`

## Command: `pnpm ops board`

Prerequisites:

- Repo contains `docs/agents/board.md`

Observed behavior:

- Prints the contents of `docs/agents/board.md` to stdout
- Does not read GitHub state
- Does not create or modify local artifacts

Expected output or artifacts:

- A board contract document covering execution stages, lanes, required project fields, optional fields, scheduler signals, pickup rules, queue export, dispatch artifacts, claims, and runner stub behavior
- No files written

Readiness:

- Ready for normal use as a static contract printer

Rough edges:

- Output is documentation-only; it does not verify that `.ai/ops.config.json` still matches `docs/agents/board.md`
- It also does not verify that the live GitHub Project matches the documented schema

## Command: `pnpm ops github:init -- --apply`

Prerequisites:

- `.ai/ops.config.json` contains `github.owner` and `github.repo`
- `gh` installed and authenticated
- Repository access sufficient for `gh label list` and `gh label create`
- `.github/ISSUE_TEMPLATE/agentic-slice.md` present if template readiness should report cleanly

Observed behavior:

- Dry-run first reported:
  - missing labels: `needs-triage`, `needs-info`
  - drifted labels: `bug`, `enhancement`, `ready-for-agent`, `ready-for-human`, `wontfix`
- Apply run created only the two missing labels
- Re-running dry-run afterward showed:
  - `needs-triage` and `needs-info` as `present`
  - no planned label changes
  - drift still reported for existing non-canonical label descriptions/colors

Expected output or artifacts:

- Prints a GitHub Tracker Bootstrap report to stdout
- No local files written
- On apply, mutates GitHub only by creating missing canonical labels
- Does not correct label drift
- Does not create or modify GitHub Project fields or views

Readiness:

- Ready for normal use for missing-label bootstrap

Rough edges:

- The apply report still shows `missing:` in the `Label Inspection` section because inspection happens before creation; only `Apply Results` reveals the final mutation outcome
- The command intentionally leaves drift untouched, so a repo can remain partially non-canonical after a successful apply
- The next-steps footer always says to configure owner/repo/project reference even when config is already present

Follow-up signal:

- Add a post-apply reinspection step so the final report reflects end state instead of pre-apply inspection
- Tighten the next-steps copy so it reflects actual config state

## Command: `pnpm ops mirror`

Prerequisites:

- A supported artifact file exists
- One target is provided: `--issue <n>` or `--pr <n>`
- For posting behavior only: `gh` installed and authenticated, plus explicit `--apply`

Observed behavior:

- Dry-run against `docs/agents/completions/2026-05-14-123-completion.md` printed:
  - target issue
  - detected type `completion`
  - comment body with only `Status: needs human review`
- Dry-run against `docs/agents/handoffs/2026-05-14-123-implement-slice.md` printed:
  - target issue
  - detected type `handoff`
  - summary lines for `Goal`, `Boundaries`, and `Verification`
- No GitHub comment was posted because validation stayed on dry-run

Expected output or artifacts:

- Prints an `Artifact Mirror` plan to stdout with mode, artifact path, target, detected type, and summarized comment body
- No local files written
- No remote mutation unless `--apply` is passed

Readiness:

- Usable for dry-run inspection
- Still rough as a communication surface when source artifacts contain placeholder-only sections

Rough edges:

- Summaries are only as good as the source artifact content; placeholder templates collapse into low-signal output like `Goal: One sentence outcome:`
- Completion summaries can look nearly empty when `Summary`, `Changed areas`, and verification fields are blank
- This validation did not exercise `mirror -- --apply`, so live GitHub comment posting remains unverified in this note

Follow-up signal:

- Validate `mirror -- --apply` against a real issue once there is a non-placeholder artifact worth posting
- Consider stronger artifact-template guidance or preflight warnings when the summary would be mostly placeholders

## Commands Run

```bash
pnpm ops board
pnpm ops github:init
pnpm ops mirror -- --artifact docs/agents/completions/2026-05-14-123-completion.md --issue 11
pnpm ops github:init -- --apply
pnpm ops github:init
gh label list --limit 200 --json name,color,description --repo nithingm/AutoPocock
pnpm ops mirror -- --artifact docs/agents/handoffs/2026-05-14-123-implement-slice.md --issue 11
```

## Outcome

- `board`: ready for normal use as a static contract dump
- `github:init -- --apply`: ready for normal use for missing-label creation, with reporting caveats
- `mirror`: dry-run path works, but readiness is limited by placeholder-heavy source artifacts and unvalidated apply behavior
