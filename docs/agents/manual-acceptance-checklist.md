# Manual Acceptance Checklist

Date: 2026-05-14
Repo: `D:\Projects\AutoPocock`
Parent issue: `#16` `Manual acceptance checklist`

## Purpose

This checklist is the hard gate for the manual operating system before provider-execution automation work begins.

A fresh **Solo Operator** should be able to satisfy every required item below without guessing file paths, hand-editing generated artifacts blindly, or relying on undocumented workflow state.

## Required Pass Criteria

### 1. GitHub CLI readiness

- [ ] The Solo Operator can run `gh auth status` successfully in the intended shell environment.
- [ ] The repo docs explain the immediate shell fix and the permanent environment fix when `gh` is missing.
- [ ] The repo docs explain that GitHub-backed flow requires authenticated `gh`.

Evidence:

- `gh auth status`
- `docs/agents/manual-walkthrough.md`
- `docs/agents/workflow.md`

### 2. GitHub project configuration

- [ ] The Solo Operator can identify the required GitHub config fields from repo docs.
- [ ] The docs explain the required Project fields and the role of `.ai/ops.config.json`.
- [ ] `pnpm ops github:init` and `pnpm ops github:export` provide actionable guidance when project configuration is incomplete.

Evidence:

- `README.md`
- `docs/agents/workflow.md`
- `.ai/ops.config.json`

### 3. Canonical manual walkthrough exists

- [ ] A single canonical walkthrough exists and is the primary operator-facing workflow artifact.
- [ ] The walkthrough covers `init`, `github:init`, `prd`, `issues`, `handoff`, `github:export`, `schedule --dispatch`, `claim`, `run --prepare-worktree`, `complete`, `review-prep`, `qa`, and `feedback`.
- [ ] Each step includes prerequisites, exact command text, expected artifact or output, common failure modes, and exact next command.

Evidence:

- `docs/agents/manual-walkthrough.md`

### 4. Artifact chain works locally

- [ ] The manual OS has a scripted local smoke test that chains artifacts end to end.
- [ ] The smoke test uses fixture-backed GitHub export where live GitHub is unnecessary.
- [ ] The smoke test is suitable as a future gating check.

Evidence:

- `tests/issue17-manual-smoke.test.mjs`
- passing `pnpm test`

### 5. Review-entry workflow is hardened

- [ ] `complete` generates a Completion Report template with explicit required and optional markers.
- [ ] `review-prep` resolves the latest issue-matching completion report when safe.
- [ ] `review-prep` fails with explicit missing-input guidance when the review gate is incomplete.

Evidence:

- `scripts/ops.mjs`
- `scripts/lib/review-gate.mjs`
- `tests/issue6-review-entry.test.mjs`
- `tests/ops-workflow-extensions.test.mjs`

### 6. Dispatch workflow is hardened

- [ ] `schedule -- --dispatch` creates Dispatch Artifacts only for dispatchable queue items.
- [ ] `claim`, `run`, `claim-status`, and `reclaim` support safer artifact resolution and give exact follow-up commands on ambiguity.
- [ ] Missing queue and dispatch artifacts produce recovery guidance with exact commands.

Evidence:

- `scripts/ops.mjs`
- `tests/ops-cli.test.mjs`
- `tests/issue9-artifact-recovery.test.mjs`

### 7. GitHub export is stable against real shapes

- [ ] `github:export` supports nested, flattened, empty-field, and alternate top-level item shapes from `gh project item-list`.
- [ ] Export preserves scheduler-critical queue fields for non-`Done` items.
- [ ] Missing `gh` and missing project-reference errors provide actionable recovery guidance.

Evidence:

- `scripts/ops.mjs`
- `tests/ops-cli.test.mjs`

### 8. Tracker and artifact command validation exists

- [ ] Real-repo validation notes exist for tracker-facing commands.
- [ ] Real-repo validation notes exist for artifact-oriented commands.
- [ ] Each note records prerequisites, outputs/artifacts, readiness, and rough edges.

Evidence:

- `docs/agents/validations/2026-05-14-issue-11-tracker-commands.md`
- `docs/agents/manual-artifact-command-validation-2026-05-14.md`

### 9. Product shape is documented

- [ ] The skills/prompts split is explicitly documented.
- [ ] The TDD contract placement is explicitly decided.
- [ ] The docs reflect the approved decision that TDD remains a doc-only contract in this phase.

Evidence:

- `docs/agents/issue-13-skills-prompts-decision-brief.md`
- `README.md`
- `docs/agents/workflow.md`
- `docs/agents/tdd.md`

### 10. Remaining rough edges are explicit

- [ ] Remaining operator-guesswork gaps are documented rather than implicit.
- [ ] The reconciliation artifact distinguishes eliminated gaps from unresolved follow-up work.
- [ ] No unresolved rough edge is silently treated as “done”.

Evidence:

- `docs/agents/validations/2026-05-14-issue-4-real-run-happy-path-audit.md`
- `docs/agents/validations/2026-05-14-issue-15-audit-reconciliation-pass.md`

## Current Status

### Checklist Result

- [ ] Manual OS is accepted as complete for pre-automation use

### Blocking Follow-Up Items Before Full Acceptance

- [ ] Exact targeted-QA artifact matching replaces current substring-based artifact resolution in `scripts/qa.mjs`.
- [ ] The canonical walkthrough documents the existing-live-issue path as explicitly as the new-feature path.
- [ ] The docs define recovery when export/schedule selects a different issue than the one under active ownership.
- [ ] The docs define the intended pre-PR path for `review-prep`, `qa`, and `feedback`.
- [ ] `github:export` provides clearer issue-level exclusion reporting when the intended issue is absent from the configured project.
- [ ] Manual `dispatch` validates matching handoff selection rather than relying on substring-based inference.

## Gate Decision

The manual operating system is **substantially hardened and test-backed**, but it is **not yet fully accepted** for automation handoff because the blocking follow-up items above are still open.

The next acceptable automation step should happen only after those follow-up items are either fixed or consciously accepted as residual risk.
