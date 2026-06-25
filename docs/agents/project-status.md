# Project Status

Date: 2026-06-25
Repo: `D:\Projects\AutoPocock`

This artifact records the current working state of AutoPocock as a durable handoff for the Solo Operator. It separates four things that are easy to conflate:

- what is landed on `origin/main`
- what is committed on the review branch
- what remains as local scratch/demo output
- what the live GitHub tracker and Project board currently know

For a map of where the project's durable language, command contracts, evidence artifacts, and continuation guidance live, use `docs/agents/knowledge-map.md`.

For a reviewable inventory of the committed automation layer and intentionally unstaged scratch artifacts, use `docs/agents/local-change-inventory.md`.

For the explicit completion audit against the active objective, use `docs/agents/completion-audit-2026-06-25.md`.

## Current Read

AutoPocock has crossed from a manual agentic repo template into a local, test-backed prototype of a provider-agnostic AI engineering operating system.

The committed baseline on `origin/main` proves the manual OS: PRD creation, issue decomposition, handoff artifacts, GitHub bootstrap/export, scheduling, dispatch artifacts, claiming, runner preparation, completion reports, review prep, targeted QA, feedback classification, and manual workflow documentation.

The review branch goes further. PR `#56` contains implementation and tests for setup/context/PRD planes, layered DAG planning, DAG regeneration, DAG-to-GitHub sync and reconciliation, DAG quality gates, provider-neutral loop specs, wave approval, preflight validation, graph progression, repair insertion, Ralph pause/freeze policy, provider runs, a Codex provider adapter, and an artifact-first workflow console.

## Verification Snapshot

Latest full local verification:

```bash
pnpm test
```

Observed result:

- 179 tests passed
- 0 tests failed

This proves the current local source tree is internally coherent.

Latest live readiness checks:

```bash
pnpm verify:project -- --strict-external
pnpm ops setup
gh auth status
pnpm ops github:init
pnpm ops github:export -- --issue 45
pnpm smoke:console
```

Observed result:

- `verify:project -- --strict-external` reports local readiness passed, GitHub Project read path passed, Project write scope present, and issue `#45` visible.
- `setup` reports git, node, pnpm, GitHub CLI/auth, Codex provider, and workflow directories ready.
- `gh auth status` reports account `nithingm` with Project access sufficient for the strict verifier.
- `github:init` remains dry-run-first and reports existing label drift without mutating GitHub.
- `github:export -- --issue 45` writes a queue snapshot and can see issue `#45` in the configured Project.
- the workflow console starts on an ephemeral local port, serves `/`, returns `/api/state`, and closes cleanly.
- GitHub Actions CI on PR `#56` runs `pnpm install --frozen-lockfile`, `pnpm test`, and `pnpm smoke:console`; the latest run is green.

## Landed Baseline

Stable baseline:

- `main`
- aligned with `origin/main`
- latest commit: `3c038eb Document and verify manual ops workflow`

The landed baseline includes the manual OS and the original GitHub-backed workflow hardening.

Review branch:

- `codex/land-automation-layer`
- pushed to `origin/codex/land-automation-layer`
- PR: `https://github.com/nithingm/AutoPocock/pull/56`
- latest commits add the automation layer, CI workflow, cross-platform test fixes, and this status refresh
- PR status: ready for review, mergeable, CI green

The review branch contains:

- workflow command wiring and verification scripts
- provider execution modules
- runtime host modules
- context and PRD plane modules
- layered DAG compiler, schema, regeneration, quality, sync, and reconciliation modules
- DAG wave orchestration and loop-spec compiler modules
- graph progression and Ralph runner modules
- workflow console modules
- regression tests for all of the above
- durable PRDs, issue decompositions, handoffs, loop specs, completion reports, status docs, and resolved HITL evidence

Local unstaged scratch/demo output remains outside the PR:

- demo PRDs such as `feature-name` and `my-feature`
- issue `123` and `my-feature` example issue artifacts
- transient dispatch, schedule, feedback, review, context, and memory-proposal artifacts

Those files were intentionally not staged for PR `#56`.

## Manual OS Gate

The manual operating system is accepted for pre-automation use in the current working tree.

The former blocking follow-ups are now closed:

- exact targeted-QA artifact matching
- existing-live-issue workflow branch
- scheduler mismatch recovery guidance
- pre-PR review/QA/feedback path
- requested-issue GitHub export absence reporting
- exact manual-dispatch handoff validation

Evidence is recorded in `docs/agents/manual-acceptance-checklist.md`, with coverage in `tests/qa-cli.test.mjs` and `tests/ops-cli.test.mjs`.

## GitHub Tracker State

Live GitHub Issues currently show:

- 43 closed issues
- 12 open issues
- PR `#56` open and ready for review for the automation layer

The open issues are `#44` through `#55`:

- `#44` Topologically Sorted DAG Planning and Graph-Driven Ralph Loop Orchestration
- `#45` Add PRD Tightness Validation Before DAG Compilation
- `#46` Regenerate DAGs With Diffing, Edit Preservation, and Provenance
- `#47` Make the DAG the Topologically Sorted Execution Authority
- `#48` Add Wave Planning With Write-Surface and Conflict-Safe Parallelism
- `#49` Compile Explicit Ralph Loop Specs From Approved DAG Nodes
- `#50` Add Wave-Bundle Approval for Graph-Driven Execution
- `#51` Add Preflight Feasibility Validation and Dynamic Wave Splitting
- `#52` Enforce Evidence-Based Completion, Multidimensional Testing, and Validation-Failed Progression
- `#53` Auto-Insert Bug-Loop Repair Issues With Escalation Caps
- `#54` Add Branch-Local Pause and Shared-Foundation Full-Run Freeze Rules
- `#55` Orchestrate Multi-Stage Single Runs From Connected Wave Bundles

The GitHub Project board has been reconciled far enough for tracker visibility. Issues `#45` through `#55` were added to Project 1 on 2026-06-25, and strict verification confirms issue `#45` is visible through the configured Project export.

The closed-issue Project field reconciliation for issues `#1` through `#32` was run before the open issue additions. Treat that as an applied reconciliation step, but continue to validate scheduler/export behavior through normal command output after source cleanup.

The former Project-scope HITL task is resolved. The recovery record remains at `docs/agents/hitl/2026-06-25-github-project-scope-needed.md`.

## Local Completion Evidence

Local completion reports exist for:

- `#49`
- `#51`
- `#53`
- `#54`
- `#55`

Those reports claim the later wave slices are implemented and tested locally. The test suite and PR `#56` support that the relevant contracts exist, but issue state should still move only after review.

The local Ralph run state is stale: it still records `#45` as `in_progress` and later issues as `pending`. Treat that runtime state as an old execution record until it is intentionally regenerated or reconciled.

## Remaining Work

The next work is review and merge discipline, not broad feature invention.

1. Review PR `#56`.
2. Decide whether any intentionally unstaged scratch/demo artifacts should be deleted, ignored, or promoted in a later artifact-only PR.
3. Update issue states only after the corresponding PR evidence is reviewed.
4. Run a live end-to-end validation before merge:
   - `pnpm verify:project -- --strict-external`
   - `pnpm ops setup`
   - `pnpm ops github:export -- --issue <target>`
   - scheduler or graph wave preview
   - `pnpm smoke:console`
   - at least one staged run path or fixture-backed equivalent
5. Merge PR `#56` when the Solo Operator accepts the diff.

## Current Operating Guidance

Use `origin/main` when you need the stable manual OS.

Use PR `#56` / branch `codex/land-automation-layer` when you need to inspect or continue the provider/DAG/Ralph orchestration work.

Do not use the live GitHub Project board as the sole source of truth for implementation completeness. Project visibility is now restored, but the automation layer still needs source/test/docs review before issue state should move.
