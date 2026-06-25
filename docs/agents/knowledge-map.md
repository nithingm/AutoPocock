# AutoPocock Knowledge Map

Date: 2026-06-25
Repo: `D:\Projects\AutoPocock`

This is the operator-facing map of where the project's knowledge lives and how to read the current state without mixing up local implementation evidence, durable Workflow Artifacts, and live GitHub tracker state.

## Current Position

AutoPocock is no longer just a manual repo template. The accepted manual operating system is present, documented, and test-backed in the current working tree. On top of that, the local tree now contains a broader provider/DAG/Ralph orchestration layer with test coverage.

The automation layer is now on review branch `codex/land-automation-layer` under draft PR `#56`. It is committed, pushed, CI-backed, and reconciled far enough for Project visibility, but it is not landed on `origin/main` until the PR is accepted and merged.

## Read These First

- `CONTEXT.md`: the domain language. Use it to preserve terms like Solo Operator, Operational Tracker, Workflow Artifact, Execution Stage, and HITL Task.
- `README.md`: the repo entry map and command overview.
- `ROADMAP.md`: the intended operating-system direction and unresolved design questions.
- `docs/agents/workflow.md`: the command and artifact contract for Guided Flow and Manual Mode.
- `docs/agents/manual-walkthrough.md`: the exact manual happy path.
- `docs/agents/manual-acceptance-checklist.md`: acceptance evidence for the manual OS gate.
- `docs/agents/project-status.md`: the current repo, tracker, and working-tree split.
- `docs/agents/local-change-inventory.md`: the current dirty-tree inventory and suggested review slices.
- `docs/agents/completion-audit-2026-06-25.md`: the requirement-by-requirement audit of what is proven and what remains incomplete.
- `docs/agents/hitl/2026-06-25-github-project-scope-needed.md`: the resolved human-step record for the former GitHub Project blocker.

## Knowledge Layers

### Durable Language

`CONTEXT.md` is the vocabulary source. If an agent needs to explain the project, update workflows, or create new artifacts, it should use that language rather than inventing synonyms.

### Operator Contract

`docs/agents/workflow.md`, `docs/agents/manual-walkthrough.md`, and `README.md` define the operator path. Together they answer:

- which commands exist
- what each command should create or validate
- which steps are Guided Flow versus Manual Mode
- where the artifact chain starts and ends

### Current Truth

`docs/agents/project-status.md` is the current operating read. It separates:

- landed `origin/main`
- committed review-branch source/test/docs work
- live GitHub Issues and Project board state

Use it before deciding whether to continue implementation, review local changes, reconcile tracker state, or prepare a PR.

### Evidence Artifacts

The artifact layer under `docs/agents/` and `issues/` records the workflow history:

- PRDs: `docs/PRDs/`
- issue decompositions and DAG JSON: `issues/`
- handoffs: `docs/agents/handoffs/`
- scheduler plans: `docs/agents/schedules/`
- dispatch artifacts: `docs/agents/dispatches/`
- completion reports: `docs/agents/completions/`
- review prep: `docs/agents/reviews/`
- QA feedback and bug drafts: `docs/agents/feedback/`
- HITL tasks: `docs/agents/hitl/`

These are durable Workflow Artifacts when they explain a decision, handoff, review, or validation. Runtime scratch files under `.ai/` should not become durable truth unless explicitly promoted.

## System Shape

The current local implementation is organized around these planes:

- Setup/runtime host: validates OS, shell, command availability, provider readiness, GitHub readiness, and workflow directories.
- Context and PRD planes: create and approve shared context, then convert approved context into approved PRDs.
- Issue/DAG planning: compiles approved PRDs into issue DAGs with node metadata, dependencies, execution waves, quality gates, and regeneration support.
- GitHub bridge: initializes tracker labels, exports project queue state, mirrors selected artifacts, and reconciles DAG work with GitHub issue/project state.
- Scheduler and dispatch: creates scheduler plans, dispatch artifacts, claims, reclaim decisions, and runner-ready execution packages.
- Provider execution: validates claimed dispatches, prepares worktrees, runs provider-neutral loop specs through provider adapters, and records provider run evidence.
- Ralph/graph progression: models wave approval, pause/freeze policy, bug-loop repair insertion, QA/review decisions, and dependency unlocking.
- Review and QA: enforces Review Entry Gate, targeted QA, QA decisions, Same-PR Fix classification, and bug follow-up creation.
- Workflow console: exposes setup, context, PRD, graph, execution, and review state through an artifact-first local UI.

## Proven State

Latest local verification recorded in `docs/agents/project-status.md`:

```bash
pnpm test
```

Observed:

- 179 tests passed
- 0 tests failed

Latest readiness checks recorded there:

```bash
pnpm verify:project -- --strict-external
pnpm ops setup
gh auth status
pnpm ops github:init
pnpm ops github:export -- --issue 45
pnpm smoke:console
```

Observed:

- `pnpm verify:project -- --strict-external` passes for local readiness, Project read path, Project write scope, and issue `#45` visibility
- local setup reports git, node, pnpm, GitHub CLI/auth, Codex provider, and workflow directories ready
- GitHub auth is live for account `nithingm` and has sufficient Project access for the strict verifier
- GitHub bootstrap remains dry-run-first and reports drift instead of destructive mutation
- issue `#45` is visible in the configured GitHub Project export after issues `#45` through `#55` were added
- the workflow console can serve the current workspace state on an ephemeral local port and close cleanly
- PR `#56` exists and GitHub Actions CI is green for frozen install, `pnpm test`, and `pnpm smoke:console`

## Trust Rules

- Use `origin/main` when you need the stable, landed manual OS baseline.
- Use branch `codex/land-automation-layer` / PR `#56` when continuing provider/DAG/Ralph orchestration work.
- Use GitHub Issues for live issue existence, ownership, and eventual stage movement.
- Do not use the GitHub Project board as the sole source of truth for implementation completeness; use it for restored tracker visibility.
- Do not close `#45` through `#55` based only on local completion reports. Review the corresponding source/test/docs evidence first.
- Treat old `.ai/` runtime records as execution history, not current authority.
- Keep runtime output out of commits unless it is intentionally promoted as evidence.

## Current Open Work

The work left is mostly operational hardening and reconciliation:

1. Review PR `#56`.
2. Decide whether intentionally unstaged scratch/demo artifacts should be deleted, ignored, or promoted separately.
3. Re-run full local tests plus strict live tracker verification after any review updates.
4. Move issue state only after reviewed evidence supports each transition.
5. Merge PR `#56` when accepted.

## Continuation Brief

When another agent continues this project, start with:

```bash
git status --short --branch
pnpm verify:project -- --strict-external
pnpm ops setup
gh auth status
pnpm test
pnpm ops github:export -- --issue 45
pnpm smoke:console
```

Then read, in order:

1. `CONTEXT.md`
2. `docs/agents/project-status.md`
3. `docs/agents/knowledge-map.md`
4. `docs/agents/local-change-inventory.md`
5. `docs/agents/completion-audit-2026-06-25.md`
6. `docs/agents/workflow.md`
7. `docs/agents/hitl/2026-06-25-github-project-scope-needed.md` if you need the resolved Project-scope history

If strict verification regresses, update the resolved HITL record with the new failure evidence. Otherwise, continue with local cleanup, review, and verification.
