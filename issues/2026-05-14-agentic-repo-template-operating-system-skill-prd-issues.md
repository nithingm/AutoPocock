# Issue Decomposition

Source PRD: 2026-05-14-agentic-repo-template-operating-system-skill-prd.md

Status: Approved by Solo Operator

## Decomposition Rules

- Keep each issue independently testable.
- Keep architecture decisions upstream of implementation.
- Split by vertical slice, not by technical layer.
- Prefer AFK slices when decisions are already captured in `CONTEXT.md`.
- Create follow-up bugs instead of silently expanding scope.

## Parallelization Model

- Issue 1 is the Feature Track tracer bullet.
- Issues 2, 3, 5, 6, 9, and 10 can proceed after Issue 1 because they touch separate workflow surfaces.
- Issue 2 depends on Issue 1 because it mutates GitHub labels through the same bootstrap path.
- Issue 4 depends on Issues 1 and 3 because export requires GitHub readiness and a locked queue schema.
- Issue 7 depends on Issue 6 because strict Targeted QA consumes Review Prep and review-gate context.
- Issue 8 depends on Issue 7 because feedback consumes QA findings.

## Kanban Defaults

- Category label: `enhancement`
- State label: `ready-for-agent`
- Execution Stage: `Ready for Handoff`
- Execution Lane: `Handoff`
- Feature Track: `agentic-repo-template-operating-system`
- Dependency: `unblocked` when Blocked by is `None - can start immediately`; otherwise `blocked`

## Issue 1: Add dry-run GitHub Tracker Bootstrap

### Type

AFK

### Queue

- Queue class: tracer-bullet
- Risk: low
- Conflict surface: low
- Blocked by: None - can start immediately
- User stories covered: 5, 6, 8, 9, 10

### What to build

Add `pnpm ops github:init` as a dry-run Tracker Bootstrap that checks local GitHub readiness and reports the required tracker schema without mutating GitHub.

### Acceptance criteria

- [x] Command detects whether `gh` is installed and prints a clear setup message when missing.
- [x] Command detects whether `gh` is authenticated and prints `gh auth login` guidance when needed.
- [x] Command reports expected triage labels and whether they can be inspected.
- [x] Command verifies local issue template presence.
- [x] Command reports required GitHub Project fields and views without creating them.
- [x] Command exits successfully when it can produce a dry-run report.

### Blocked by

None - can start immediately

## Issue 2: Add Safe GitHub Label Bootstrap

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: medium
- Conflict surface: low
- Blocked by: Issue 1
- User stories covered: 7, 8

### What to build

Extend Tracker Bootstrap so `pnpm ops github:init -- --apply` creates missing canonical labels through `gh`, while reporting Tracker Drift and preserving existing tracker objects.

### Acceptance criteria

- [ ] Dry-run prints which labels would be created.
- [ ] `--apply` creates only missing canonical labels.
- [ ] Existing labels are not renamed, deleted, or rewritten.
- [ ] Label color or description mismatch is reported as Tracker Drift.
- [ ] Project fields and views remain report-only.

### Blocked by

Issue 1

## Issue 3: Lock GitHub Project Schema Contract

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: low
- Conflict surface: low
- Blocked by: Issue 1
- User stories covered: 10, 11, 12, 16

### What to build

Record the required GitHub Project schema in config and docs so Tracker Bootstrap, queue export, and scheduling share one stable contract.

### Acceptance criteria

- [x] Config lists required fields: `Execution Stage`, `Execution Lane`, `Queue Class`, `Risk`, `Dependency`, `Conflict Surface`, `Feature Track`, `Dispatch ID`.
- [x] Config lists allowed values for single-select fields.
- [x] Docs explain required fields, optional future fields, and why labels are separate from project fields.
- [x] Docs explain that GitHub remains source of truth and `.ai/queue.json` is a snapshot.

### Blocked by

Issue 1

## Issue 4: Export GitHub Project Queue Snapshot

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: medium
- Conflict surface: medium
- Blocked by: Issues 1 and 3
- User stories covered: 11, 12, 13, 14, 15, 16, 17, 18

### What to build

Add `pnpm ops github:export` to export all non-`Done` GitHub Project issues into `.ai/queue.json` using the scheduler queue schema.

### Acceptance criteria

- [x] Command refuses to run with a clear message when project reference is missing.
- [x] Export includes all non-`Done` project issues, not only `ready-for-agent`.
- [x] Export maps labels, execution stage, lane, queue class, risk, dependency, conflict surface, feature track, dispatch id, issue URL, PR links, and updated timestamp when available.
- [x] Export writes `.ai/queue.json` as a snapshot cache.
- [x] Command does not mutate GitHub.

### Blocked by

Issues 1 and 3

## Issue 5: Create Selective Artifact Mirroring

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: medium
- Conflict surface: low
- Blocked by: Issue 1
- User stories covered: 4, 28, 29, 30, 31, 34, 49

### What to build

Add a dry-run mirroring path that summarizes decision-useful local artifacts for GitHub comments without posting by default.

### Acceptance criteria

- [ ] Command accepts an artifact path and issue or PR reference.
- [ ] Dry-run prints the comment target and summarized body.
- [ ] Supported artifacts include handoff, Prepared Human Step, Completion Report, Review Prep, Targeted QA summary, feedback summary, and memory proposal summary.
- [ ] Full Scheduler Plans are not mirrored by default.
- [ ] No GitHub comment is posted without an explicit apply flag.

### Blocked by

Issue 1

## Issue 6: Add Review Entry And Review Prep Validation

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: low
- Conflict surface: low
- Blocked by: Issue 1
- User stories covered: 28, 30, 31, 32, 43, 44

### What to build

Make the local workflow validate the Review Entry Gate and generate Review Prep artifacts when work is ready for Human Review.

### Acceptance criteria

- [ ] Command or workflow path checks acceptance criteria, verification claims, changed areas, dependency changes, Local Refactors, risks, gaps, and follow-ups.
- [ ] Passing gate can generate a Review Prep artifact.
- [ ] Failing gate reports missing inputs and does not generate Review Prep.
- [ ] Review Prep remains advisory and records Solo Operator decisions still required.

### Blocked by

Issue 1

## Issue 7: Add Strict Targeted QA Validation

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: low
- Conflict surface: low
- Blocked by: Issue 6
- User stories covered: 33, 34, 35, 36, 47, 48

### What to build

Tighten Targeted QA so GitHub-backed AFK work requires issue, PR, Handoff Artifact, Completion Report, and review context, while Manual Mode remains permissive.

### Acceptance criteria

- [ ] Targeted QA requires issue and PR identifiers unless `--manual` is supplied.
- [ ] Targeted QA fails when required Handoff Artifact or Completion Report is missing.
- [ ] Targeted QA warns when Review Prep is missing.
- [ ] Generated checklist lists found artifacts and warnings.
- [ ] Oversized or unclear work is reported as needing slicing instead of passing QA.

### Blocked by

Issue 6

## Issue 8: Add QA Feedback Classifier

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: medium
- Conflict surface: low
- Blocked by: Issue 7
- User stories covered: 37, 38, 46

### What to build

Add `pnpm ops feedback` to classify QA findings into Same-PR Fix proposals or new bug issue drafts without silently widening original issue scope.

### Acceptance criteria

- [ ] Command accepts issue, PR, and finding text.
- [ ] Dry-run classifies the finding as Same-PR Fix candidate or new bug draft.
- [ ] Same-PR Fix output states that Solo Operator approval is required.
- [ ] New bug draft links original issue and PR and includes evidence, expected behavior, actual behavior, and verification notes.
- [ ] No GitHub issue or comment is created without explicit apply behavior.

### Blocked by

Issue 7

## Issue 9: Add Durable Memory Proposal Workflow

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: low
- Conflict surface: low
- Blocked by: Issue 1
- User stories covered: 39, 40, 50

### What to build

Add `pnpm ops memory-propose` so subagents and Solo Operators can propose Durable Memory changes without applying them directly.

### Acceptance criteria

- [ ] Command creates proposal artifacts under `docs/agents/memory-proposals/`.
- [ ] Proposal types include `context`, `adr`, `workflow`, and `roadmap`.
- [ ] Proposal includes rationale, target files, suggested text, and risk of accepting or rejecting.
- [ ] Command does not edit `CONTEXT.md`, ADRs, workflow docs, or roadmap directly.

### Blocked by

Issue 1

## Issue 10: Add Runner No-Op Validation Stub

### Type

AFK

### Queue

- Queue class: routine-afk
- Risk: low
- Conflict surface: low
- Blocked by: Issue 1
- User stories covered: 19, 20, 21, 22, 23, 25, 26, 27, 45

### What to build

Add `pnpm ops run -- --dispatch <path>` as a no-op runner stub that validates claimed Dispatch Artifacts and prints what a future runner would execute.

### Acceptance criteria

- [x] Command refuses dispatch artifacts that are not `claimed`.
- [x] Command validates claim metadata: `claimed_by`, `claimed_at`, and `isolation_mode`.
- [x] Command validates forbidden actions are present.
- [x] Command prints the expected branch, isolation mode, handoff artifact, and completion target.
- [x] Command does not create worktrees, call providers, write code, merge, or update Durable Memory.

### Blocked by

Issue 1
