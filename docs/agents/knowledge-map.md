# AutoPocock Knowledge Map

Date: 2026-06-25
Repo: `D:\Projects\AutoPocock`

This is the operator-facing map of where the project's knowledge lives and how to read the current state without mixing up local implementation evidence, durable Workflow Artifacts, and live GitHub tracker state.

## Current Position

AutoPocock is no longer just a manual repo template. The accepted manual operating system is present, documented, and test-backed in the current working tree. On top of that, the local tree now contains a broader provider/DAG/Ralph orchestration layer with test coverage.

The automation layer is now landed on `origin/main` through PR `#56`, with follow-up memory proposal decision/apply, mirror update, scheduler conflict inference, and Claude Code provider adapter work added on `main`. It is committed, CI-backed, and reconciled in GitHub Issues and Project fields.

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
- landed automation-layer source/test/docs work
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
- durable memory proposals and decisions: `docs/agents/memory-proposals/`

These are durable Workflow Artifacts when they explain a decision, handoff, review, or validation. Runtime scratch files under `.ai/` should not become durable truth unless explicitly promoted.

## System Shape

The current local implementation is organized around these planes:

- Setup/runtime host: validates OS, shell, command availability, provider readiness, GitHub readiness, and workflow directories.
- Context and PRD planes: create and approve shared context, then convert approved context into approved PRDs.
- Issue/DAG planning: compiles approved PRDs into issue DAGs with node metadata, dependencies, execution waves, quality gates, and regeneration support.
- GitHub bridge: initializes tracker labels, exports project queue state, mirrors selected artifacts, and reconciles DAG work with GitHub issue/project state.
- Scheduler and dispatch: creates scheduler plans, dispatch artifacts, claims, reclaim decisions, and runner-ready execution packages.
- Provider execution: validates claimed dispatches, prepares worktrees, lists provider adapter readiness with `pnpm ops providers`, runs provider-neutral loop specs through Codex or Claude Code provider adapters, and records provider run evidence.
- Ralph/graph progression: models wave approval, pause/freeze policy, bug-loop repair insertion, QA/review decisions, and dependency unlocking.
- Review and QA: enforces Review Entry Gate, targeted QA, QA decisions, Same-PR Fix classification, and bug follow-up creation.
- Workflow console: exposes setup, context, PRD, graph, execution, and review state through an artifact-first local UI.

## Proven State

Latest local verification recorded in `docs/agents/project-status.md`:

```bash
pnpm test
```

Observed:

- 217 tests passed
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

- `pnpm verify:project -- --strict-external` passes for local readiness, Project read path, Project write scope, and issue `#45` closed terminal state
- local setup reports git, node, pnpm, GitHub CLI/auth, Codex provider readiness, Claude provider readiness, and workflow directories ready; `pnpm ops providers` exposes the direct provider inventory
- `github:init -- --apply --create-project` is now a guarded fresh-setup path that refuses duplicate Project creation when a Project reference exists
- `github:init -- --apply --create-project-fields` created the missing configured optional Project fields, and `github:init -- --apply --update-project-fields` repaired the supported `Execution Stage` option-name drift after a dry-run report
- `run -- --prepare-docker` exposes Docker image/workspace/network/env/volume isolation plans, and `run -- --execute --execute-docker` launches the rendered container command after explicit approval
- `docker:validate` probes proposed Docker execution images with no network and checks required commands, provider CLIs, and explicit credential env allowlists before live use
- `claim -- --apply-tracker` can write the runner lease to the GitHub Project `Runner` field when a scheduler-created dispatch retained its `project_item_id`
- claims now record explicit lease expiry metadata, and `claim-status` uses `expires_at` when present before falling back to max-age inspection
- `reclaim -- --apply-tracker` can clear that Project `Runner` lease during approved reclaim recovery
- `reclaim-expired` can dry-run expired-lease enforcement, reclaim expired local dispatches with approval, and optionally clear tracker-visible runner leases
- GitHub auth is live for account `nithingm` and has sufficient Project access for the strict verifier
- GitHub bootstrap remains dry-run-first and reports drift instead of destructive mutation
- issue `#45` is confirmed closed and absent from the active non-Done Project export after issues `#44` through `#55` were closed and reconciled
- the workflow console can serve the current workspace state on an ephemeral local port and close cleanly
- PR `#56` exists, is merged, and GitHub Actions CI is green for frozen install, `pnpm test`, and `pnpm smoke:console`

## Trust Rules

- Use `origin/main` when you need the stable, landed manual OS baseline or the provider/DAG/Ralph orchestration work.
- Use GitHub Issues for live issue existence, ownership, and eventual stage movement.
- Do not use the GitHub Project board as the sole source of truth for implementation completeness; use landed source, tests, durable artifacts, and CI as the implementation authority.
- Issues `#44` through `#55` are closed based on PR `#56`, merge commit `06ac64c`, local strict verification, and green `main` CI.
- Treat old `.ai/` runtime records as execution history, not current authority.
- Keep runtime output out of commits unless it is intentionally promoted as evidence.

## Optional Follow-Up

The core landing and tracker reconciliation are complete. Remaining work is product hardening beyond the current local prototype:

1. GitHub Project views are now inspected and drift-reported through GraphQL, and `github:init` checks the live GraphQL mutation schema for ProjectV2 view capability; creation and renaming remain manual while no matching mutations are exposed.
2. Distributed claim locking now has a GitHub ref CAS path, scheduler dispatch policy, `claim-locks` text/JSON audit plus orphan cleanup, scheduled GitHub Actions audit, and an Actions run-summary dashboard; remaining deployment work is external operator dashboards only if needed.
3. Build and validate the default provider image with `pnpm ops docker:build-provider -- --tag autopocock-provider-runner:local --validate`; use `pnpm ops docker:publish-provider` for dry-run-first registry tag/push planning, and `pnpm ops docker:validate` for any alternate deployment image or credential package.
4. Re-run full local tests plus strict live tracker verification after any follow-up updates.

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
