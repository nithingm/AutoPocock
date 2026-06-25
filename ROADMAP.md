# Roadmap

This roadmap captures the operating-system direction decided during the initial design session.

## Current Foundation

- Solo Operator is the primary user.
- Agent Runtime is a later execution layer, not the owner of product intent.
- GitHub is the default Operational Tracker.
- Repo markdown is the Artifact Layer.
- Matt Pocock triage roles stay as labels.
- GitHub Project fields carry execution stages, lanes, queue class, risk, dependency, review capacity, and conflict surface.
- `pnpm ops` is the Umbrella CLI for Guided Flow.
- Low-level commands remain available for Manual Mode.
- `pnpm ops github:init` provides the first dry-run Tracker Bootstrap tracer bullet.
- `.ai/ops.config.json` contains the canonical local GitHub Project schema under `projectSchema`.

## Current Status Snapshot

As of 2026-06-25, the manual operating system is accepted for pre-automation use and the provider/DAG/Ralph orchestration layer is landed on `origin/main`, CI-backed, and reconciled with the GitHub Project board for the completed `#44` through `#55` slice set. The live provider adapter boundary now supports Codex and Claude Code behind the same provider-neutral Loop Spec contract.

Use `docs/agents/project-status.md` as the current operational read before deciding whether to continue implementation, review local changes, or reconcile tracker state. Use `docs/agents/knowledge-map.md` to orient across domain language, command contracts, Workflow Artifacts, live tracker state, and remaining work.

## Board Model

Execution stages:

- `Inbox`
- `Clarifying`
- `Ready to Slice`
- `Ready for Handoff`
- `AFK In Progress`
- `Human Review`
- `QA`
- `Bug Loop`
- `Done`

Execution lanes:

- `Intake`: `Inbox`, `Clarifying`
- `Planning`: `Ready to Slice`
- `Handoff`: `Ready for Handoff`
- `Execution`: `AFK In Progress`
- `Validation`: `Human Review`, `QA`, `Bug Loop`
- `Closed`: `Done`

## Workflow Rules

- `init` provisions the workflow but starts no workers.
- GitHub setup is dry-run by default and mutates only with `--apply`.
- Existing tracker conflicts are Tracker Drift and require Solo Operator action.
- Tracer bullets gate routine AFK work per Feature Track.
- Queue classes are `tracer-bullet`, `routine-afk`, and `hitl`.
- HITL blockers are dependency-scoped unless they block a Feature Track tracer bullet.
- Credential Boundary work stays HITL, but agents prepare exact human steps.
- Same-PR fixes are allowed only before merge and only when acceptance criteria, architecture, and product intent do not change.
- Solo Operator owns Same-PR Fix approval, Durable Memory updates, Merge Authority, and final QA/merge decisions.

## Scheduler Direction

- Scheduler is dry-run by default and writes Scheduler Plans.
- Scheduler Plans are stored in `docs/agents/schedules/`.
- `pnpm ops schedule -- --apply` updates GitHub Project tracker fields for `DISPATCH` decisions only.
- `pnpm ops schedule -- --dispatch` converts `DISPATCH` decisions into local Dispatch Artifacts.
- Review Capacity defaults to config and can be overridden per run.
- Bug Loop work consumes capacity before new AFK dispatch.
- Conflict Surface is manually declared first, with opt-in CLI inference from queue write surfaces and active PR files.
- Initial dispatch creates Dispatch Artifacts instead of calling subagents.
- Dispatch Artifacts are JSON canonical plus markdown mirror.
- Dispatch Claims use local filesystem locks around claim/reclaim mutations. Claims record explicit lease expiry metadata, `claim --apply-tracker` publishes the runner lease to the GitHub Project `Runner` field for external visibility, `reclaim --apply-tracker` clears that visible lease during approved recovery, and `reclaim-expired` enforces expired leases with dry-run-first local mutation plus optional tracker clearing. True distributed arbitration remains a future hardening layer.

## Agent Execution Direction

- Current runner supports branch, worktree, guarded Docker isolation planning, and explicit Docker container launch.
- Once the scheduler exists, default to worktree-first isolation.
- Docker-isolated dispatches have an explicit image/workspace/network/env/volume contract, a `--prepare-docker` plan, and an explicit `--execute --execute-docker` launch path that runs the provider command inside the declared container boundary.
- Provider-specific subagent execution belongs in a runner layer.
- Runners must claim Dispatch Artifacts before execution.
- Stale claims return to `queued` only with Solo Operator approval or future timeout policy.
- Max automated fix attempts default to `1`; after that, work becomes HITL.

## QA And Review Direction

- TDD is an execution discipline for implementation and bug-fix work, not a separate board stage.
- Handoffs should include a TDD plan when behavior can be verified through a public interface.
- Completion Reports should state tests added, red-green evidence when applicable, and verification commands.
- Review Entry Gate must pass before Human Review.
- Review Prep is generated when work enters Human Review.
- Human Review has three outcomes: move to QA, move to Bug Loop, or move back to Ready to Slice/Clarifying.
- QA is mandatory after Human Review before Done.
- Targeted QA is primary for GitHub-backed AFK work.
- Targeted QA is strict for AFK workflow and permissive only in Manual Mode.
- Missing handoff or completion context is a workflow failure.

## Current Commands And Future Extensions

- `pnpm ops github:init`: dry-run GitHub tracker setup using the `gh` CLI.
- `pnpm ops github:init -- --apply`: create missing labels and verify local issue templates.
- `pnpm ops github:init`: report required GitHub Project fields/views and Project field drift without mutating by default.
- `pnpm ops github:init -- --apply --create-project --project-title "Name"`: create a fresh GitHub Project only when no Project reference is already configured.
- `pnpm ops github:init -- --apply --create-project-fields`: create missing configured GitHub Project fields while leaving existing drift untouched.
- `pnpm ops github:export`: export GitHub issue/project metadata into `.ai/queue.json`.
- `pnpm ops mirror`: summarize supported local workflow artifacts into dry-run GitHub comment bodies; `--apply` posts with an explicit GitHub mutation, and `--update-existing` refreshes a matching marked comment when present.
- `pnpm ops memory-propose`: create durable memory proposal artifacts without editing durable memory directly.
- `pnpm ops memory-decision`: record Durable Memory proposal approval/rejection and optionally apply approved repo-local target-file updates.
- `pnpm ops schedule -- --apply`: update GitHub Project fields for `DISPATCH` decisions without creating dispatch artifacts.
- `pnpm ops schedule -- --dispatch`: create dispatch artifacts from a Scheduler Plan.
- `pnpm ops dispatch`: create audited manual dispatch artifacts, while scheduler-sourced dispatches are created by `schedule -- --dispatch`.
- `pnpm ops claim`: local file-backed claiming uses an exclusive dispatch-artifact lock and re-reads state before mutation.
- `pnpm ops run`: validate claimed dispatches, prepare worktrees, prepare Docker isolation plans, and execute through stub/live provider boundaries; Codex is the default live provider and Claude Code can be selected with `--provider claude`; Docker-isolated execution requires explicit `--execute-docker` approval after plan inspection.
- `pnpm ops worktree-clean`: dry-run-first cleanup for stale unreferenced `.worktrees` directories; deletion requires `--apply`.
- `pnpm ops review-prep`: validate Review Entry Gate inputs and generate advisory Review Prep when the gate passes.
- `pnpm ops qa`: load issue, PR, handoff, completion, and review prep context from GitHub.
- `pnpm ops feedback`: classify QA defects locally by default; `--apply` either posts Same-PR Fix candidates to the PR or creates follow-up GitHub issues for broader bugs.

## Open Design Questions

- How much of GitHub Project view setup should be automated beyond the current report-first contract; Project creation and field creation now have explicit apply paths.
- Additional provider adapters beyond Codex and Claude Code, if the product boundary expands to more CLIs or hosted runners.
- Docker runtime policy is accepted in `docs/adr/2026-06-25-docker-runtime-policy.md`; future work should validate concrete hardened images and provider credential packages, not change the default safety boundary.
- How to extend tracker-visible claim leases into true distributed compare-and-swap locking for multiple runners.
- External/user-level memory sync is intentionally outside the current product boundary; approved Durable Memory decisions stay repo-local unless a future explicit connector boundary is designed and approved.

## Locked GitHub Bootstrap Decisions

- Use the `gh` CLI first.
- Do not handle GitHub tokens inside this repo.
- Store optional GitHub owner, repo, project URL, project ID, and project number in `.ai/ops.config.json`.
- Allow CLI overrides for one-off GitHub runs.
- If `gh` is missing, print install instructions.
- If `gh` is unauthenticated, print `gh auth login`.
- Dry-run inspects existing labels when possible.
- `--apply` creates missing labels by default.
- Existing label drift is reported, not automatically rewritten.
- Local issue templates are verified from the working tree.
- Fresh Project creation is allowed only with `--apply --create-project` and no existing configured Project reference.
- Project fields are reported by default and created only with `--apply --create-project-fields`.
- Project views are reported, not created, in the first version.
