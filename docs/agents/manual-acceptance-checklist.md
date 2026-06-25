# Manual Acceptance Checklist

Date: 2026-05-14
Repo: `D:\Projects\AutoPocock`
Parent issue: `#16` `Manual acceptance checklist`

## Purpose

This checklist is the hard gate for the manual operating system before provider-execution automation work begins.

A fresh **Solo Operator** should be able to satisfy every required item below without guessing file paths, hand-editing generated artifacts blindly, or relying on undocumented workflow state.

## Required Pass Criteria

### 1. GitHub CLI readiness

- [x] The Solo Operator can run `gh auth status` successfully in the intended shell environment.
- [x] The repo docs explain the immediate shell fix and the permanent environment fix when `gh` is missing.
- [x] The repo docs explain that GitHub-backed flow requires authenticated `gh`.

Evidence:

- `gh auth status`
- `docs/agents/manual-walkthrough.md`
- `docs/agents/workflow.md`

### 2. GitHub project configuration

- [x] The Solo Operator can identify the required GitHub config fields from repo docs.
- [x] The docs explain the required Project fields and the role of `.ai/ops.config.json`.
- [x] `pnpm ops github:init` and `pnpm ops github:export` provide actionable guidance when project configuration is incomplete.

Evidence:

- `README.md`
- `docs/agents/workflow.md`
- `.ai/ops.config.json`

### 3. Canonical manual walkthrough exists

- [x] A single canonical walkthrough exists and is the primary operator-facing workflow artifact.
- [x] The walkthrough covers `init`, `github:init`, `prd`, `issues`, `handoff`, `github:export`, `schedule --dispatch`, `claim`, `run --prepare-worktree`, `complete`, `review-prep`, `qa`, and `feedback`.
- [x] Each step includes prerequisites, exact command text, expected artifact or output, common failure modes, and exact next command.

Evidence:

- `docs/agents/manual-walkthrough.md`

### 4. Artifact chain works locally

- [x] The manual OS has a scripted local smoke test that chains artifacts end to end.
- [x] The smoke test uses fixture-backed GitHub export where live GitHub is unnecessary.
- [x] The smoke test is suitable as a future gating check.

Evidence:

- `tests/issue17-manual-smoke.test.mjs`
- passing `pnpm test`

### 5. Review-entry workflow is hardened

- [x] `complete` generates a Completion Report template with explicit required and optional markers.
- [x] `review-prep` resolves the latest issue-matching completion report when safe.
- [x] `review-prep` fails with explicit missing-input guidance when the review gate is incomplete.

Evidence:

- `scripts/ops.mjs`
- `scripts/lib/review-gate.mjs`
- `tests/issue6-review-entry.test.mjs`
- `tests/ops-workflow-extensions.test.mjs`

### 6. Dispatch workflow is hardened

- [x] `schedule -- --apply` updates GitHub Project fields only for scheduler-selected `DISPATCH` items.
- [x] `schedule -- --dispatch` creates Dispatch Artifacts only for dispatchable queue items.
- [x] `claim` and console claim/reclaim use an exclusive local dispatch-artifact lock before mutating claim state.
- [x] `claim`, `run`, `claim-status`, and `reclaim` support safer artifact resolution and give exact follow-up commands on ambiguity.
- [x] Missing queue and dispatch artifacts produce recovery guidance with exact commands.

Evidence:

- `scripts/ops.mjs`
- `tests/ops-cli.test.mjs`
- `tests/issue9-artifact-recovery.test.mjs`

### 7. GitHub export is stable against real shapes

- [x] `github:export` supports nested, flattened, empty-field, and alternate top-level item shapes from `gh project item-list`.
- [x] Export preserves scheduler-critical queue fields for non-`Done` items.
- [x] Missing `gh` and missing project-reference errors provide actionable recovery guidance.

Evidence:

- `scripts/ops.mjs`
- `tests/ops-cli.test.mjs`

### 8. Tracker and artifact command validation exists

- [x] Real-repo validation notes exist for tracker-facing commands.
- [x] Real-repo validation notes exist for artifact-oriented commands.
- [x] Each note records prerequisites, outputs/artifacts, readiness, and rough edges.

Evidence:

- `docs/agents/validations/2026-05-14-issue-11-tracker-commands.md`
- `docs/agents/manual-artifact-command-validation-2026-05-14.md`

### 9. Product shape is documented

- [x] The skills/prompts split is explicitly documented.
- [x] The TDD contract placement is explicitly decided.
- [x] The docs reflect the approved decision that TDD remains a doc-only contract in this phase.

Evidence:

- `docs/agents/issue-13-skills-prompts-decision-brief.md`
- `README.md`
- `docs/agents/workflow.md`
- `docs/agents/tdd.md`

### 10. Remaining rough edges are explicit

- [x] Remaining operator-guesswork gaps are documented rather than implicit.
- [x] The reconciliation artifact distinguishes eliminated gaps from unresolved follow-up work.
- [x] No unresolved rough edge is silently treated as "done".

Evidence:

- `docs/agents/validations/2026-05-14-issue-4-real-run-happy-path-audit.md`
- `docs/agents/validations/2026-05-14-issue-15-audit-reconciliation-pass.md`

## Current Status

Updated: 2026-06-25

### Checklist Result

- [x] Manual OS is accepted as complete for pre-automation use

### Closed Follow-Up Items

- [x] Exact targeted-QA artifact matching replaces loose substring artifact resolution in `scripts/qa.mjs`.
  - Evidence: `tests/qa-cli.test.mjs` covers the issue `4` versus `123` false-positive class.
- [x] The canonical walkthrough documents the existing-live-issue path as explicitly as the new-feature path.
  - Evidence: `docs/agents/manual-walkthrough.md` now has `Choose Your Entry Path`.
- [x] The docs define recovery when export/schedule selects a different issue than the one under active ownership.
  - Evidence: `tests/ops-cli.test.mjs` covers requested-issue scheduler mismatch guidance.
- [x] The docs define the intended pre-PR path for `review-prep`, `qa`, and `feedback`.
  - Evidence: `README.md`, `docs/agents/workflow.md`, and `docs/agents/manual-walkthrough.md` make `--pr` optional unless a PR already exists.
- [x] `github:export` provides clearer issue-level exclusion reporting when the intended issue is absent from the configured project.
  - Evidence: `tests/ops-cli.test.mjs` covers `github:export -- --issue <id>` absence reporting.
- [x] Manual `dispatch` validates matching handoff selection instead of relying on substring inference.
  - Evidence: `tests/ops-cli.test.mjs` covers exact handoff matching, missing handoff refusal, and wrong-issue handoff rejection.

## Gate Decision

The manual operating system is **accepted for pre-automation use** in the current working tree.

The acceptance is scoped to the manual OS contract: artifact-led planning, GitHub-backed tracking, handoff, dispatch preparation, review prep, targeted QA, feedback, and recovery guidance. It does not mean the later provider execution, DAG authority, Ralph orchestration, or workflow console layers are production-landed; those are tracked separately in `docs/agents/project-status.md`.
