# Issue Decomposition

Source PRD: 2026-05-14-github-backed-operational-workflow.md

## Decomposition Rules

- Keep each issue independently testable.
- Keep architecture decisions upstream of implementation.
- Split by vertical slice, not by technical layer when possible.
- Create follow-up bugs instead of silently expanding scope.

## Issue 1: Add dry-run `github:init` tracer bullet

### Outcome

- The Solo Operator can run `pnpm ops github:init` and receive a useful dry-run report about GitHub readiness without mutating GitHub.

### Queue

- Type: AFK
- Queue class: tracer-bullet
- Risk: low
- Conflict surface: low
- Blocked by: None - can start immediately
- User stories covered: GitHub bootstrap, dry-run safety, `gh` CLI integration

### Scope

- Included: `gh` presence detection, authentication detection, label/schema report, project field/view report, local issue template verification.
- Excluded: label creation, project creation, project mutation, issue creation.

### Implementation Notes

- Key files or modules: `scripts/ops.mjs`, `.ai/ops.config.json`, `docs/agents/issue-tracker.md`, `docs/agents/board.md`, `ROADMAP.md`.
- Use `gh` CLI first. Do not handle GitHub tokens inside the repo.
- Dry-run is default.

### Verification

- Automated: `node --check scripts/ops.mjs`.
- Manual: run `pnpm ops github:init` and verify it reports missing `gh` or current `gh` readiness without mutating anything.

### Non-Goals

- Do not create GitHub Projects.
- Do not create labels.
- Do not export queue data.

## Issue 2: Add `github:init --apply` label bootstrap

### Outcome

- The Solo Operator can run `pnpm ops github:init -- --apply` to create missing canonical labels while reporting drift and leaving existing labels untouched.

### Queue

- Type: AFK
- Queue class: routine-afk
- Risk: medium
- Conflict surface: low
- Blocked by: Issue 1
- User stories covered: label bootstrap, tracker drift safety

### Scope

- Included: create missing labels through `gh label create`, report existing labels, report drift.
- Excluded: renaming labels, deleting labels, changing existing label colors/descriptions, Project mutation.

### Implementation Notes

- Key files or modules: `scripts/ops.mjs`, `docs/agents/triage-labels.md`, `docs/agents/issue-tracker.md`.
- Existing-object mismatch is Tracker Drift, not automatic cleanup.

### Verification

- Automated: `node --check scripts/ops.mjs`.
- Manual: dry-run shows planned creates; `--apply` works only when `gh` is authenticated.

### Non-Goals

- Do not mutate Project fields.
- Do not handle tokens.

## Issue 3: Lock GitHub Project schema in docs and config

### Outcome

- The required GitHub Project field schema is documented and represented in config so bootstrap/export/scheduler share one contract.

### Queue

- Type: AFK
- Queue class: routine-afk
- Risk: low
- Conflict surface: low
- Blocked by: Issue 1
- User stories covered: board schema, scheduler contract

### Scope

- Included: required fields, allowed values, optional fields, config representation.
- Excluded: creating fields through GitHub APIs.

### Implementation Notes

- Required fields: `Execution Stage`, `Execution Lane`, `Queue Class`, `Risk`, `Dependency`, `Conflict Surface`, `Feature Track`, `Dispatch ID`.
- Key files or modules: `.ai/ops.config.json`, `docs/agents/board.md`, `docs/agents/issue-tracker.md`, `ROADMAP.md`.

### Verification

- Automated: JSON config remains valid.
- Manual: compare docs and config for matching field names and values.

### Non-Goals

- Do not implement GitHub Project creation.

## Issue 4: Add `github:export` queue snapshot

### Outcome

- The Solo Operator can export GitHub Project issues into `.ai/queue.json` as a scheduler snapshot.

### Queue

- Type: AFK
- Queue class: routine-afk
- Risk: medium
- Conflict surface: medium
- Blocked by: Issue 3
- User stories covered: queue export, scheduler input

### Scope

- Included: export all non-`Done` project issues, normalize fields into queue schema, write `.ai/queue.json`.
- Excluded: scheduler dispatch, GitHub mutation, custom API client.

### Implementation Notes

- Key files or modules: `scripts/ops.mjs`, `.ai/ops.config.json`, `.ai/queue.example.json`, `docs/agents/board.md`.
- Prefer `gh` CLI output. If project fields are unavailable, report missing config or unsupported export path.

### Verification

- Automated: `node --check scripts/ops.mjs`.
- Manual: export against a configured project or verify missing project config error is clear.

### Non-Goals

- Do not infer missing project fields.
- Do not export only `ready-for-agent`; export all non-`Done` items.

## Issue 5: Define and stub artifact mirroring

### Outcome

- The workflow clearly defines which local artifacts are mirrored to GitHub comments and exposes a dry-run mirroring stub.

### Queue

- Type: AFK
- Queue class: routine-afk
- Risk: medium
- Conflict surface: low
- Blocked by: Issue 1
- User stories covered: GitHub comment visibility, auditability

### Scope

- Included: docs for mirroring handoff, HITL steps, completion reports, review prep, targeted QA summaries, feedback, memory proposal summaries.
- Included: `pnpm ops mirror -- --artifact <path> --issue 123 --dry-run`.
- Excluded: posting comments by default.

### Implementation Notes

- Key files or modules: `scripts/ops.mjs`, `docs/agents/issue-tracker.md`, `docs/agents/handoff.md`.
- Full Scheduler Plans are not mirrored by default; only summaries after `--apply` or `--dispatch`.

### Verification

- Automated: `node --check scripts/ops.mjs`.
- Manual: dry-run prints target issue and summary without posting.

### Non-Goals

- Do not post GitHub comments until explicit `--apply` exists.

## Issue 6: Add `feedback` dry-run classifier

### Outcome

- QA findings can be classified into Same-PR Fix proposals or new bug issue drafts without silently expanding scope.

### Queue

- Type: AFK
- Queue class: routine-afk
- Risk: medium
- Conflict surface: low
- Blocked by: Issue 5
- User stories covered: QA feedback loop, bug loop discipline

### Scope

- Included: `pnpm ops feedback -- --issue 123 --pr 456 --finding "...";` dry-run output and local artifact creation.
- Included: Same-PR Fix proposal template and bug issue draft template.
- Excluded: GitHub issue/comment creation by default.

### Implementation Notes

- Key files or modules: `scripts/ops.mjs`, `docs/agents/handoff.md`, `docs/agents/workflow.md`.
- Same-PR Fix approval remains with the Solo Operator.

### Verification

- Automated: `node --check scripts/ops.mjs`.
- Manual: run feedback command and inspect generated artifact.

### Non-Goals

- Do not auto-approve Same-PR Fixes.
- Do not create live GitHub issues without `--apply`.

## Issue 7: Add `memory-propose` workflow

### Outcome

- Subagents and Solo Operators can propose Durable Memory changes without applying them directly.

### Queue

- Type: AFK
- Queue class: routine-afk
- Risk: low
- Conflict surface: low
- Blocked by: None - can start immediately
- User stories covered: memory safety, domain documentation

### Scope

- Included: proposal artifact directory, command stub, proposal types `context`, `adr`, `workflow`, `roadmap`.
- Excluded: automatic edits to `CONTEXT.md`, ADRs, workflow docs, or roadmap.

### Implementation Notes

- Key files or modules: `scripts/ops.mjs`, `docs/agents/domain.md`, `docs/agents/workflow.md`, `docs/agents/memory-proposals/`.
- Proposals include rationale, target files, suggested text, and risk of accepting/rejecting.

### Verification

- Automated: `node --check scripts/ops.mjs`.
- Manual: generate one proposal and inspect artifact.

### Non-Goals

- Do not implement `--apply` for memory.

## Issue 8: Add `run` no-op runner stub

### Outcome

- A future runner has a minimal command contract for reading claimed dispatch artifacts and validating isolation requirements without invoking a provider.

### Queue

- Type: AFK
- Queue class: routine-afk
- Risk: low
- Conflict surface: low
- Blocked by: Issue 1
- User stories covered: runner contract, dispatch lifecycle

### Scope

- Included: `pnpm ops run -- --dispatch <path>` validates `status = claimed`, claim metadata, isolation mode, forbidden actions, and prints what would run.
- Excluded: creating worktrees, running Codex/Claude, writing code, Docker.

### Implementation Notes

- Key files or modules: `scripts/ops.mjs`, `docs/agents/board.md`, `docs/agents/workflow.md`, `ROADMAP.md`.
- Runner must not choose work itself.

### Verification

- Automated: `node --check scripts/ops.mjs`.
- Manual: run against a claimed dispatch artifact and verify no provider call happens.

### Non-Goals

- Do not execute agents.
- Do not merge.
- Do not update Durable Memory.
