# Issue 4 Audit: Real-Run Happy Path

Date: 2026-05-14
Repo state: `D:\Projects\AutoPocock`
Validator: Codex
Issue under audit: `#4` `Real-run happy path audit`

## Observable Outcome

Produce a real-run audit artifact for the canonical manual walkthrough that records every point where the Solo Operator had to infer file paths, issue numbers, labels, GitHub project configuration, required generated-file content, or other missing workflow state.

## Scope

This audit executed the canonical walkthrough in `docs/agents/manual-walkthrough.md` against the live repo and live GitHub repo/project configuration.

Because issue `#4` already exists as a live slice, the audit stayed inside the ownership boundary for that issue and did not create unrelated PRDs, issue decompositions, or dispatches for other issues.

## Environment And Real Inputs Used

- Repo root: `D:\Projects\AutoPocock`
- `pnpm` available
- `gh` available: `gh version 2.92.0 (2026-04-28)`
- `gh auth status` authenticated as `nithingm`
- `.ai/ops.config.json` configured for:
  - owner: `nithingm`
  - repo: `AutoPocock`
  - project URL: `https://github.com/users/nithingm/projects/1`
  - project number: `1`
- Live GitHub issue `#4` exists and is open
- Live GitHub issue `#4` labels: `enhancement`, `ready-for-agent`
- Live GitHub issue `#4` has no project items
- Live GitHub PR count: `0`

## Walkthrough Execution

## Step 1: `pnpm ops init`

Observed behavior:

- Command succeeded.
- Output matched the walkthrough.
- No operator guesswork was required at this step beyond knowing to run from repo root.

Observed output:

- `Workflow structure is initialized. No workers or automations were started.`

## Step 2: `pnpm ops github:init`

Observed behavior:

- Command succeeded in dry-run mode.
- It confirmed `gh` readiness, auth state, label presence/drift, and required project field schema.

Operator guesswork required:

- The walkthrough says `.ai/ops.config.json` must point at the intended owner/repo/project, but the operator still has to infer whether `projectUrl`, `projectId`, or `projectNumber` is the repo's source of truth.
- The walkthrough says tracker drift is informational, but it does not tell the operator whether drift on `ready-for-agent` is safe for later queue/scheduler behavior.
- The walkthrough says to "create or connect the GitHub Project manually" but does not tell the operator how to verify that issue `#4` is actually attached to that project before moving on.

Real-state finding:

- Issue `#4` is not attached to any GitHub project item, even though a project is configured in `.ai/ops.config.json`.

## Steps 3 and 4: `pnpm ops prd` and `pnpm ops issues`

Observed behavior:

- These steps were intentionally not run for this audit.

Reason:

- Running them would create new planning artifacts unrelated to live issue `#4`.
- Issue `#4` already exists as the slice under audit, and the issue instructions explicitly limit ownership to that issue.

Operator guesswork required:

- The walkthrough does not explain what the Solo Operator should do when validating the workflow against an already-created live issue instead of starting from a new feature idea.
- The operator must infer whether to skip these steps, reuse existing artifacts, or create throwaway PRD/issue files.

Hardening signal:

- The canonical walkthrough needs an explicit branch for "new feature planning flow" vs "audit or execution against an existing live issue."

## Step 5: `pnpm ops handoff -- --issue 4 --title "Real-run happy path audit"`

Observed behavior:

- Command succeeded.
- It wrote `docs/agents/handoffs/2026-05-14-4-real-run-happy-path-audit.md`.

Operator guesswork required:

- The operator had to infer the correct `--title` from the GitHub issue title because the walkthrough uses only an example title.
- The generated artifact leaves these required fields blank:
  - Goal
  - Boundaries
  - Context
  - Dependencies
  - Verification
- The operator must invent both the content and the expected level of detail before later steps can succeed.

Hardening signal:

- Handoff generation is structurally successful but still depends on substantial manual inference for required content.

## Step 6: `pnpm ops github:export`

Observed behavior:

- Command succeeded.
- It wrote `.ai/queue.json`.
- Export result: `Exported 1 non-Done item(s).`

Real-state finding:

- The exported queue contains issue `#1`, not issue `#4`.
- Issue `#4` is invisible to the export path because it is not attached to the configured GitHub project.

Operator guesswork required:

- The walkthrough lists "The target issues are not in `Done`" as a prerequisite, but real success also requires the issue to be present in the configured project.
- The walkthrough does not tell the operator how to detect that a specific issue was excluded from export except by manually opening `.ai/queue.json`.
- The walkthrough does not tell the operator whether to fix GitHub project membership, edit the queue file, use manual dispatch, or stop.

Hardening signal:

- The export step needs explicit issue-level exclusion reporting when a live issue is not part of the configured project.

## Step 7: `pnpm ops schedule`

Observed behavior:

- Dry-run schedule was executed instead of `--dispatch`.
- The generated plan selected issue `#1` for dispatch and consumed the only review capacity.
- It wrote `docs/agents/schedules/2026-05-14T17-38-56-467Z-scheduler-plan.md`.

Reason `--dispatch` was not run:

- Running the canonical `--dispatch` command in live repo state would have created dispatch artifacts for issue `#1`, which is outside issue `#4` ownership.

Operator guesswork required:

- The walkthrough does not explain what to do when the scheduler picks a different issue than the one the operator is actively working.
- The operator must infer that queue export plus scheduling is not issue-targeted and may advance unrelated work.
- The walkthrough omits `pnpm ops dispatch -- --issue <n> ...`, even though the repo exposes that command as the manual override path.

Hardening signal:

- The canonical walkthrough needs an explicit branch for "issue not scheduler-selected" and should point either to a stop condition or to the manual dispatch command with clear criteria.

## Steps 8 and 9: `pnpm ops claim` and `pnpm ops run`

Observed behavior:

- Not run for issue `#4`.

Reason:

- No dispatch artifact for issue `#4` existed in real repo state.
- The only scheduler-visible issue was `#1`.

Operator guesswork required:

- The walkthrough assumes a dispatch artifact exists for the current issue, but does not explain recovery when scheduler/export state selects a different issue.
- The operator must infer whether it is acceptable to claim a different issue, manually dispatch `#4`, or first repair project membership.

## Step 10: `pnpm ops complete -- --issue 4 --status "needs human review"`

Observed behavior:

- Command succeeded.
- It wrote `docs/agents/completions/2026-05-14-4-completion.md`.

Operator guesswork required:

- The template marks many fields as `REQUIRED`, but gives no repo-specific standard for what counts as sufficient detail:
  - summary
  - files or areas changed
  - reason
  - exact verification commands
  - verification results
  - gaps
  - residual risks
  - follow-up issues
- The operator must guess how much detail later commands need in order to pass.

Hardening signal:

- Completion generation is structurally successful but still requires content inference before the review gate can pass.

## Step 11: `pnpm ops review-prep -- --issue 4`

Observed behavior:

- Command failed, as expected, because the Completion Report still contained placeholder content.
- It did successfully resolve the completion report by issue without requiring `--completion`.

Observed failure:

- `Missing Review Entry input: acceptance criteria.`
- `Missing Review Entry input: changed areas.`
- `Missing Review Entry input: dependency changes.`
- `Missing Review Entry input: local refactors.`
- `Missing Review Entry input: verification.`
- `Missing Review Entry input: gaps.`
- `Missing Review Entry input: risks.`
- `Missing Review Entry input: follow-ups.`

Operator guesswork required:

- The walkthrough expects the operator to supply the missing fields, but the generated completion template does not pre-structure them in a way that obviously maps to the review gate inputs.
- There is no live PR for issue `#4`, and the walkthrough does not say whether review prep should wait for a PR, accept a future PR placeholder, or use a branch/reference instead.

Hardening signal:

- The review-prep gate messages are explicit, but the earlier artifact templates still leave too much content inference to the operator.

## Step 12: `pnpm ops qa -- --issue 4`

Observed behavior:

- Command failed because no PR identifier was supplied.
- It still wrote `docs/QA/2026-05-14-qa-checklist.generated.md`.

Observed failure:

- `Strict targeted QA requires a valid PR identifier.`

Critical real-run finding:

- The generated QA checklist did not resolve issue `#4` artifacts.
- Instead it matched issue `4` against date-containing filenames and selected:
  - `docs/agents/handoffs/2026-05-14-123-implement-slice.md`
  - `docs/agents/completions/2026-05-14-123-completion.md`
  - `docs/agents/reviews/2026-05-14-123-review-prep.md`

Why this matters:

- The operator can believe QA is targeting issue `#4` while the checklist silently points at unrelated issue `#123` artifacts because the artifact matcher uses substring matching.
- This is not just guesswork; it is misleading behavior in real repo state.

Operator guesswork required:

- The operator must manually inspect the generated checklist to notice the wrong artifact paths.
- The operator must also guess whether a numeric PR placeholder would be acceptable, because the validator checks only identifier shape, not PR existence.

Hardening signal:

- Artifact resolution for targeted QA must match issue identifiers exactly, not by loose substring.

## Step 13: `pnpm ops feedback -- --issue 4 --finding "QA finding text"`

Observed behavior:

- Command failed.

Observed failure:

- `Feedback classification requires pr.`

Operator guesswork required:

- There is no live PR for issue `#4`, but the walkthrough assumes a PR exists.
- The command contract requires a numeric `--pr`, yet there is no guidance for the operator when the workflow is being exercised before any PR exists.

Hardening signal:

- The late walkthrough steps need an explicit documented branch for pre-PR validation versus post-PR validation.

## Guesswork Inventory

The following operator inferences were required in this real run:

- Infer that steps 3 and 4 should be skipped for a live already-created issue, because the walkthrough only documents the new-feature path.
- Infer the correct handoff title from the GitHub issue title.
- Infer how to populate handoff sections with enough detail for later validation.
- Infer whether label drift on `ready-for-agent` is harmless or scheduler-relevant.
- Infer that issue `#4` must be attached to the configured GitHub project, not merely exist in GitHub with the right labels.
- Infer exclusion from export by manually inspecting `.ai/queue.json`.
- Infer what to do when the scheduler selects issue `#1` instead of the issue under active audit.
- Infer whether the omitted `pnpm ops dispatch` command is the intended recovery path.
- Infer how much detail the Completion Report requires for review-prep to pass.
- Infer what to use for `--pr` when no live PR exists.
- Infer that the QA artifact resolver chose the wrong files unless the generated checklist is manually audited.

## Commands Run

```bash
pnpm ops init
pnpm ops github:init
gh auth status
gh issue view 4 --json number,title,state,labels,projectItems,url
pnpm ops handoff -- --issue 4 --title "Real-run happy path audit"
pnpm ops github:export
pnpm ops schedule
gh pr list --state all --json number,title,headRefName,baseRefName,url
pnpm ops complete -- --issue 4 --status "needs human review"
pnpm ops review-prep -- --issue 4
pnpm ops qa -- --issue 4
pnpm ops feedback -- --issue 4 --finding "QA finding text"
```

## Outcome Against Acceptance Criteria

- Canonical walkthrough executed against real repo state: partially satisfied
- Every point of operator guesswork captured: satisfied
- Audit artifact specific enough to validate later hardening slices: satisfied

Why the first criterion is only partial:

- The walkthrough was executed as far as live repo state and issue `#4` ownership allowed.
- Scheduler dispatch, claim, and run could not be exercised for issue `#4` because the live GitHub project does not contain that issue, and the scheduler instead selected issue `#1`.
- Creating dispatches for unrelated issues would have violated the issue ownership boundary for this task.

## Follow-Up Signals

- Add an explicit existing-issue branch to `docs/agents/manual-walkthrough.md`.
- Make `github:export` report when a requested or recently touched issue is absent from the configured project.
- Tighten artifact lookup so targeted QA resolves issue-specific artifacts exactly rather than by substring.
- Document the intended recovery path when schedule/export selects a different issue than the one under active work.
- Document whether late-stage commands are allowed before a PR exists and, if so, what identifier should be used.
