# Project Status

Date: 2026-06-25
Repo: `D:\Projects\AutoPocock`

This artifact records the current working state of AutoPocock as a durable handoff for the Solo Operator. It separates three things that are easy to conflate:

- what is landed on `origin/main`
- what remains as local scratch/demo output
- what the live GitHub tracker and Project board currently know

For a map of where the project's durable language, command contracts, evidence artifacts, and continuation guidance live, use `docs/agents/knowledge-map.md`.

For a reviewable inventory of the landed automation layer and intentionally unstaged scratch artifacts, use `docs/agents/local-change-inventory.md`.

For the explicit completion audit against the active objective, use `docs/agents/completion-audit-2026-06-25.md`.

## Current Read

AutoPocock has crossed from a manual agentic repo template into a local, test-backed prototype of a provider-agnostic AI engineering operating system.

The committed baseline on `origin/main` now includes the manual OS and the provider/DAG/Ralph automation layer: PRD creation, issue decomposition, handoff artifacts, GitHub bootstrap/export, scheduling, dispatch artifacts, claiming, tracker-visible runner leases, runner preparation, Docker isolation planning and execution guards, completion reports, review prep, targeted QA, feedback classification, setup/context/PRD planes, layered DAG planning, DAG regeneration, DAG-to-GitHub sync and reconciliation, DAG quality gates, provider-neutral loop specs, wave approval, preflight validation, graph progression, repair insertion, Ralph pause/freeze policy, provider runs, Codex and Claude Code provider adapters, and an artifact-first workflow console.

## Verification Snapshot

Latest full local verification:

```bash
pnpm test
```

Observed result:

- 230 tests passed
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

- `verify:project -- --strict-external` reports local readiness passed, GitHub Project read path passed, Project write scope present, and issue `#45` in a closed terminal state outside the active queue.
- `setup` reports git, node, pnpm, GitHub CLI/auth, Codex provider readiness, Claude provider readiness, and workflow directories ready. `pnpm ops providers` is the direct provider inventory command for supported adapters, aliases, credential env hints, capabilities, and optional login readiness checks.
- `gh auth status` reports account `nithingm` with Project access sufficient for the strict verifier.
- `github:init` remains dry-run-first and reports existing label and Project field drift without mutating GitHub. The guarded `--apply --create-project` path now creates a fresh Project only when no Project reference is configured, and the explicit `--apply --create-project-fields` path created the missing configured optional Project fields on Project 1.
- `github:init` now inspects the live GitHub GraphQL mutation schema for ProjectV2 view mutation capability. The latest live report says schema inspected, view mutations unavailable, and no matching mutations.
- `github:init -- --write-view-plan` writes a Prepared Human Step for exact Project view workarounds with the same schema capability evidence. The latest live artifact reports all recommended views present except the existing leading-space name drift ` Validation` -> `Validation`, which still requires a manual UI rename because ProjectV2 view mutations are unavailable.
- `github:export -- --issue 45` writes a queue snapshot with 0 active non-Done items; issue `#45` is absent because it is closed and reconciled to Done.
- the workflow console starts on an ephemeral local port, serves `/`, returns `/api/state`, and closes cleanly.
- GitHub Actions CI on PR `#56` runs `pnpm install --frozen-lockfile`, `pnpm test`, and `pnpm smoke:console`; the latest run is green.
- Docker Desktop was started and live Docker validation now runs. `node:22-bookworm` passed a no-network probe for `node` and `git`; it failed the deployment-level probes for `pnpm` and `codex`, proving the stock Node image is not the hardened provider execution image. The repo now includes `docker/provider-runner/Dockerfile`; `pnpm ops docker:build-provider -- --tag autopocock-provider-runner:local --validate` built and validated the local provider image with no network for `node`, `pnpm`, `git`, `codex`, and `claude`. A follow-up live probe confirmed UID `10001`, user `runner`, `pnpm 10.13.1`, `codex-cli 0.142.2`, and Claude Code `2.1.193`. `pnpm ops docker:publish-provider -- --write-plan` is the dry-run-first path for production registry tagging/pushing after registry/tag and credential allowlist acceptance, and it can persist the publish plan under `docs/agents/hitl/`. Docker runner cleanup is dry-run-first through `pnpm ops docker:clean`; the live dry-run found no AutoPocock-managed containers to remove.

## Landed State

Current branch:

- `main`
- aligned with `origin/main`
- latest commits include the PR `#56` merge and post-merge status/verifier updates
- merged PR: `https://github.com/nithingm/AutoPocock/pull/56`

The landed baseline includes the manual OS, original GitHub-backed workflow hardening, automation-layer implementation, opt-in scheduler conflict inference, artifact and Provider Run mirror update/dedup behavior, durable memory proposal decision/apply flow, Codex plus Claude Code provider adapters, guarded fresh Project creation, dry-run-first Project field creation, tracker-visible claim leases, scheduler-enforced GitHub ref distributed claim locks plus text/JSON lock audit, scheduled audit workflow, and Actions run-summary dashboard, Docker isolation planning/guards, Docker image readiness validation, a repo-owned provider runner Docker image, Docker-managed container labels and dry-run-first cleanup, tests, CI workflow, and durable status/orientation artifacts.

Landed source/test/docs include:

- workflow command wiring, CI, and verification scripts
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

- 55 closed issues
- 0 open issues
- PR `#56` merged for the automation layer

Issues closed after PR `#56` landed:

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

The GitHub Project board has been reconciled for tracker closure. Issues `#44` through `#55` are closed, and their Project fields are set to Done/Closed.

The configured optional Project fields `Review Capacity Cost`, `Runner`, `Last Scheduler Plan`, and `PR` were created through `pnpm ops github:init -- --apply --create-project-fields`. The remaining live Project drift is the existing `Execution Stage` option spelling `Ready To Slice` versus the configured `Ready to Slice`; bootstrap reports that drift but does not rewrite existing fields.

The fresh Project creation path was implemented and tested locally, but it was not applied to this live repo because `.ai/ops.config.json` already points at Project 1 and the command correctly refuses duplicate Project creation when a Project reference exists.

The closed-issue Project field reconciliation for issues `#1` through `#32` was run before the open issue additions. Treat that as an applied reconciliation step, but continue to validate scheduler/export behavior through normal command output after source cleanup.

The active queue export now reports 0 non-Done items. Strict verification treats issue `#45` as reconciled when it is absent from the active queue and confirmed closed.

The former Project-scope HITL task is resolved. The recovery record remains at `docs/agents/hitl/2026-06-25-github-project-scope-needed.md`.

## Local Completion Evidence

Local completion reports exist for:

- `#49`
- `#51`
- `#53`
- `#54`
- `#55`

Those reports claim the later wave slices are implemented and tested locally. The test suite, PR `#56`, merge commit `06ac64c`, and green `main` CI support that the relevant contracts landed.

The local Ralph run state is stale: it still records `#45` as `in_progress` and later issues as `pending`. Treat that runtime state as an old execution record until it is intentionally regenerated or reconciled.

## Optional Follow-Up

The core landing and tracker reconciliation are complete. Remaining work is product hardening beyond the current local prototype:

1. GitHub Project view setup is inspectable through GraphQL, including missing-view/name-drift reports and live mutation-capability evidence. Creation and renaming remain manual while GitHub CLI/GraphQL expose no ProjectV2 view mutations, but `pnpm ops github:init -- --write-view-plan` now creates a durable Prepared Human Step with exact actions, verification guidance, and schema evidence.
2. Package the GitHub ref distributed lock path beyond the landed scheduler dispatch policy, `claim-locks` text/JSON audit, orphan cleanup command, scheduled GitHub Actions audit, and Actions run-summary dashboard: external operator dashboards only if needed.
3. Publish or deploy the repo-owned provider image where production runners can pull it. The local image `autopocock-provider-runner:local` is buildable and validated with pinned Codex and Claude Code CLIs, and `pnpm ops docker:publish-provider` now turns the remaining registry/tag plus credential-package decision into an explicit dry-run/apply command. Docker cleanup policy is implemented for stopped AutoPocock-managed containers; declared credential/cache volumes remain operator-owned and are intentionally not auto-deleted.
4. Add more provider adapters only when a concrete provider boundary is needed beyond Codex and Claude Code. Use `pnpm ops providers -- --json --require-login` as the current adapter inventory and readiness check.
5. Run a live end-to-end validation after any follow-up changes:
   - `pnpm verify:project -- --strict-external`
   - `pnpm ops setup`
   - `pnpm ops github:export -- --issue <target>`
   - scheduler or graph wave preview
   - `pnpm smoke:console`
   - at least one staged run path or fixture-backed equivalent

## Current Operating Guidance

Use `origin/main` when you need the stable manual OS or the landed provider/DAG/Ralph orchestration work.

Do not use the live GitHub Project board as the sole source of truth for implementation completeness. The board is reconciled, but source, tests, durable artifacts, and CI remain the implementation authority.
