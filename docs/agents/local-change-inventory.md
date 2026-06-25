# Local Change Inventory

Date: 2026-06-25
Repo: `D:\Projects\AutoPocock`

This inventory explains what was landed through PR `#56` and what remains as intentionally unstaged scratch/demo output so the Solo Operator or a follow-on agent can avoid confusing source changes, durable Workflow Artifacts, and runtime records.

## Current Snapshot

Branch state:

- `main`
- aligned with `origin/main`
- PR `#56` merged: `https://github.com/nithingm/AutoPocock/pull/56`
- follow-up memory proposal decision/apply flow is part of the current source review surface
- local working tree may still have untracked scratch/demo artifacts outside the landed source work

External tracker state:

- GitHub auth is live for `nithingm`
- strict Project verification reports write scope present
- issues `#44` through `#55` are closed
- Project items `#44` through `#55` are set to Done/Closed
- `pnpm ops github:export -- --issue 45` writes a queue snapshot with 0 active non-Done items because `#45` is closed and reconciled

Latest local verification:

```bash
pnpm verify:project -- --strict-external
pnpm ops setup
pnpm test
pnpm ops github:export -- --issue 45
pnpm smoke:console
```

Observed:

- strict project verification passed for local readiness, Project read path, Project write scope, and issue `#45` closed terminal state
- setup ready
- 203 tests passed
- export wrote `.ai/queue.json` with 0 active non-Done items
- workflow console smoke passed on an ephemeral local port and closed cleanly
- GitHub Actions CI passed for PR `#56` and for `main` after the merge

## Committed Review Surface

PR `#56` landed the current manual-OS hardening, automation layer, tests, and durable orientation artifacts:

- `.ai/ops.config.json`
- `.gitignore`
- `README.md`
- `ROADMAP.md`
- `docs/agents/manual-acceptance-checklist.md`
- `docs/agents/manual-artifact-command-validation-2026-05-14.md`
- `docs/agents/manual-walkthrough.md`
- `docs/agents/validations/2026-05-14-issue-15-audit-reconciliation-pass.md`
- `docs/agents/workflow.md`
- `issues/2026-05-14-github-backed-operational-workflow-issues.md`
- `package.json`
- `scripts/issues.mjs`
- `scripts/lib/artifact-mirror.mjs`
- `scripts/ops.mjs`
- `scripts/prd.mjs`
- `scripts/qa.mjs`
- `tests/issue17-manual-smoke.test.mjs`
- `tests/issue5-artifact-mirror.test.mjs`
- `tests/ops-cli.test.mjs`
- `tests/ops-workflow-extensions.test.mjs`
- `tests/qa-cli.test.mjs`

Review meaning:

- The docs and tests support the manual OS acceptance gate.
- The CLI changes support context/PRD approval, exact artifact matching, strict targeted QA, GitHub export reporting, dispatch validation, review/QA decisions, provider execution entrypoints, and workflow console wiring.
- `.ai/ops.config.json` now points at the real `nithingm/AutoPocock` repository and Project 1. Treat that as useful local configuration, but review whether the template should commit real project defaults.

## Source Modules In PR `#56`

The implementation modules are the bulk of the automation layer:

- `scripts/lib/codex-exec.mjs`
- `scripts/lib/completion-evidence.mjs`
- `scripts/lib/context-plane.mjs`
- `scripts/lib/dag-github-reconcile.mjs`
- `scripts/lib/dag-github-sync.mjs`
- `scripts/lib/dag-loop-spec-compiler.mjs`
- `scripts/lib/dag-planner.mjs`
- `scripts/lib/dag-quality.mjs`
- `scripts/lib/dag-wave-orchestrator.mjs`
- `scripts/lib/graph-progression.mjs`
- `scripts/lib/layered-dag-compiler.mjs`
- `scripts/lib/layered-dag-regeneration.mjs`
- `scripts/lib/layered-dag-schema.mjs`
- `scripts/lib/memory-proposals.mjs`
- `scripts/lib/prd-plane.mjs`
- `scripts/lib/project-verifier.mjs`
- `scripts/lib/provider-runner.mjs`
- `scripts/lib/providers/codex-provider.mjs`
- `scripts/lib/providers/index.mjs`
- `scripts/lib/ralph-runner.mjs`
- `scripts/lib/review-plane.mjs`
- `scripts/lib/runtime-host.mjs`
- `scripts/lib/setup-plane.mjs`
- `scripts/lib/wave-approval-plane.mjs`
- `scripts/lib/workflow-console.mjs`
- `scripts/lib/workflow-core.mjs`
- `scripts/verify-project.mjs`
- `scripts/smoke-console.mjs`
- `scripts/provider-run-worker.mjs`

Review meaning:

- These should be reviewed as real source code, not generated evidence.
- They are covered by the full test suite, local strict verification, and GitHub Actions CI, and they are landed on `origin/main`.
- `runtime-host.mjs` contains the Windows command-shim fix that makes `pnpm ops setup` correctly detect `pnpm` and `codex` on this machine.

## Test Modules In PR `#56`

The tests are the strongest implementation evidence for the automation layer:

- `tests/dag-github-reconcile.test.mjs`
- `tests/dag-github-sync.test.mjs`
- `tests/dag-loop-spec-compiler.test.mjs`
- `tests/dag-quality.test.mjs`
- `tests/dag-wave-orchestrator.test.mjs`
- `tests/graph-progression.test.mjs`
- `tests/layered-dag-compiler.test.mjs`
- `tests/layered-dag-regeneration.test.mjs`
- `tests/layered-dag-schema.test.mjs`
- `tests/prd-plane.test.mjs`
- `tests/project-verifier.test.mjs`
- `tests/provider-adapter.test.mjs`
- `tests/provider-runner-staged.test.mjs`
- `tests/ralph-runner.test.mjs`
- `tests/runtime-host.test.mjs`
- `tests/wave-approval-gating.test.mjs`
- `tests/wave-approval-plane.test.mjs`
- `tests/workflow-console.test.mjs`
- `tests/workflow-core.test.mjs`
- `tests/issue9-memory-propose.test.mjs`

Review meaning:

- Keep source and tests together by feature slice.
- Do not treat the green full suite as a substitute for reviewing scope boundaries, generated artifacts, or Project reconciliation.

## Durable Workflow Artifacts In PR `#56`

These artifacts were promoted as durable project evidence or workflow history:

- current status/orientation: `docs/agents/project-status.md`, `docs/agents/knowledge-map.md`, this inventory
- resolved HITL blocker record: `docs/agents/hitl/2026-06-25-github-project-scope-needed.md`
- PRDs for the provider/DAG/Ralph work under `docs/PRDs/`
- issue decompositions and DAG JSON under `issues/`
- handoffs for issues `#23`, `#35` through `#43`, and related manual validation handoffs
- loop specs for issue `#44`
- completion reports for `#49`, `#51`, `#53`, `#54`, and `#55`
- review prep, feedback, schedules, and dispatch artifacts that demonstrate the manual OS flow

Review meaning:

- PR `#56` landed artifacts that explain durable decisions, evidence, or handoffs.
- Generated examples such as `feature-name`, `my-feature`, issue `123`, and local placeholder contexts were left untracked. They may be useful fixtures or may be noise.
- Dispatch and scheduler artifacts are often useful audit evidence, but they can become clutter if they are only transient run output.

## Runtime Or Scratch State

The following are intentionally ignored by `.gitignore`:

- `.ai/provider-runs/`
- `.ai/ralph-runs/`
- `.ai/queue.json`
- `.ai/tmp-*.mjs`

Review meaning:

- Do not commit those files by default.
- Promote only a specific runtime record if it is needed as durable evidence, and explain why in the commit or artifact that references it.

The following untracked files are also intentionally outside PR `#56`:

- `docs/PRDs/2026-05-14-feature-name.md`
- `docs/PRDs/2026-05-14-my-feature.md`
- issue `123`, issue `3`, issue `4`, and `my-feature` generated artifacts
- local placeholder context artifacts
- transient dispatch, schedule, feedback, review-prep, and memory-proposal artifacts

## Suggested Review Order

### Slice 1: Manual OS Acceptance And Windows Readiness

Purpose:

- land exact artifact matching, pre-PR QA/review/feedback behavior, manual dispatch validation, export absence reporting, and setup readiness

Likely files:

- `.gitignore`
- `scripts/ops.mjs`
- `scripts/qa.mjs`
- `scripts/lib/artifact-mirror.mjs`
- `scripts/lib/runtime-host.mjs`
- `scripts/lib/setup-plane.mjs`
- `tests/ops-cli.test.mjs`
- `tests/qa-cli.test.mjs`
- `tests/runtime-host.test.mjs`
- `tests/issue17-manual-smoke.test.mjs`
- `docs/agents/manual-acceptance-checklist.md`
- `docs/agents/manual-walkthrough.md`
- `docs/agents/workflow.md`

### Slice 2: Context, PRD, And Issue DAG Planning

Purpose:

- land approved context, approved PRD generation, layered DAG compilation, PRD tightness validation, and DAG regeneration

Likely files:

- `scripts/prd.mjs`
- `scripts/issues.mjs`
- `scripts/lib/context-plane.mjs`
- `scripts/lib/prd-plane.mjs`
- `scripts/lib/layered-dag-schema.mjs`
- `scripts/lib/layered-dag-compiler.mjs`
- `scripts/lib/layered-dag-regeneration.mjs`
- `tests/prd-plane.test.mjs`
- `tests/layered-dag-schema.test.mjs`
- `tests/layered-dag-compiler.test.mjs`
- `tests/layered-dag-regeneration.test.mjs`

### Slice 3: GitHub DAG Bridge And Tracker Drift Handling

Purpose:

- land DAG-to-GitHub issue synthesis, reconciliation, export compatibility, and drift reporting

Likely files:

- `scripts/lib/dag-github-sync.mjs`
- `scripts/lib/dag-github-reconcile.mjs`
- `scripts/lib/dag-planner.mjs`
- GitHub export paths inside `scripts/ops.mjs`
- `tests/dag-github-sync.test.mjs`
- `tests/dag-github-reconcile.test.mjs`
- relevant issue decomposition artifacts under `issues/`

### Slice 4: Wave, Ralph, Graph Progression, And Repair Policy

Purpose:

- land graph quality gates, loop specs, wave approval, preflight splitting, review/QA progression, repair insertion, and pause/freeze policy

Likely files:

- `scripts/lib/dag-quality.mjs`
- `scripts/lib/dag-loop-spec-compiler.mjs`
- `scripts/lib/dag-wave-orchestrator.mjs`
- `scripts/lib/graph-progression.mjs`
- `scripts/lib/ralph-runner.mjs`
- `scripts/lib/review-plane.mjs`
- `scripts/lib/wave-approval-plane.mjs`
- `scripts/lib/workflow-core.mjs`
- `tests/dag-quality.test.mjs`
- `tests/dag-loop-spec-compiler.test.mjs`
- `tests/dag-wave-orchestrator.test.mjs`
- `tests/graph-progression.test.mjs`
- `tests/ralph-runner.test.mjs`
- `tests/wave-approval-gating.test.mjs`
- `tests/wave-approval-plane.test.mjs`
- `tests/workflow-core.test.mjs`

### Slice 5: Provider Runner And Workflow Console

Purpose:

- land provider-neutral execution, Codex and Claude Code provider adapters, detached run status/cancel/mirror behavior, and artifact-first console UI

Likely files:

- `scripts/lib/provider-runner.mjs`
- `scripts/lib/providers/codex-provider.mjs`
- `scripts/lib/providers/index.mjs`
- `scripts/lib/codex-exec.mjs`
- `scripts/lib/completion-evidence.mjs`
- `scripts/provider-run-worker.mjs`
- `scripts/lib/workflow-console.mjs`
- `scripts/smoke-console.mjs`
- provider execution paths inside `scripts/ops.mjs`
- `tests/provider-adapter.test.mjs`
- `tests/provider-runner-staged.test.mjs`
- `tests/workflow-console.test.mjs`

### Slice 6: Durable Evidence And Operator Knowledge

Purpose:

- land the docs and Workflow Artifacts that make the repo understandable and auditable after the implementation slices are reviewed

Likely files:

- `README.md`
- `ROADMAP.md`
- `docs/agents/project-status.md`
- `docs/agents/knowledge-map.md`
- `docs/agents/local-change-inventory.md`
- `docs/agents/workflow.md`
- `docs/agents/manual-walkthrough.md`
- `docs/agents/manual-acceptance-checklist.md`
- `docs/agents/hitl/2026-06-25-github-project-scope-needed.md`
- durable PRDs, issue DAGs, handoffs, loop specs, completions, review prep, and validation notes selected during review

## Commit Guardrails

- Keep `.ai/provider-runs/`, `.ai/ralph-runs/`, `.ai/queue.json`, and `.ai/tmp-*.mjs` out of normal commits.
- Issues `#44` through `#55` are already closed from landed PR `#56` evidence.
- Re-run `pnpm test` after each slice.
- Run `pnpm verify:project -- --strict-external` after each slice when the external checks should be reported with the local readiness state.
- Re-run `pnpm ops github:export -- --issue 45` after tracker-affecting changes.
- Run `pnpm smoke:console` after console or artifact-loading changes.
- Treat PR `#56` as the landed review surface for the automation layer.
