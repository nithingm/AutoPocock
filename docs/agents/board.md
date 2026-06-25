# Board Model

The board separates Matt Pocock triage labels from delivery execution fields.

## Labels

Use the canonical triage roles in `docs/agents/triage-labels.md`.

## Execution Stages

- `Inbox`
- `Clarifying`
- `Ready to Slice`
- `Ready for Handoff`
- `AFK In Progress`
- `Human Review`
- `QA`
- `Bug Loop`
- `Done`

## Execution Lanes

- `Intake`: `Inbox`, `Clarifying`
- `Planning`: `Ready to Slice`
- `Handoff`: `Ready for Handoff`
- `Execution`: `AFK In Progress`
- `Validation`: `Human Review`, `QA`, `Bug Loop`
- `Closed`: `Done`

## Required Project Fields

- `Execution Stage`: `Inbox`, `Clarifying`, `Ready to Slice`, `Ready for Handoff`, `AFK In Progress`, `Human Review`, `QA`, `Bug Loop`, `Done`
- `Execution Lane`: `Intake`, `Planning`, `Handoff`, `Execution`, `Validation`, `Closed`
- `Queue Class`: `tracer-bullet`, `routine-afk`, `hitl`
- `Risk`: `low`, `medium`, `high`
- `Dependency`: `unblocked`, `blocked`
- `Conflict Surface`: `none`, `low`, `medium`, `high`
- `Feature Track`: text
- `Dispatch ID`: text

The canonical schema lives in `.ai/ops.config.json` under `projectSchema.requiredFields`. This documentation explains the same contract for the Solo Operator.

## Optional Project Fields

- `Review Capacity Cost`: number
- `Runner`: text
- `Last Scheduler Plan`: text
- `PR`: text or link, depending on the GitHub Project setup

## Recommended Project Views

- `Intake`
- `Handoff`
- `AFK Ready`
- `Human Attention`
- `Validation`
- `Done`

## Scheduler Signals

The Concurrency Scheduler should use five simple signals:

- `risk`: low, medium, high
- `dependency`: blocked or unblocked
- `review_capacity`: number of items the Solo Operator can review
- `conflict_surface`: none, low, medium, high
- `queue_class`: tracer-bullet or routine-afk

## Pickup Rules

- Only `ready-for-agent` issues in `Ready for Handoff` may enter AFK execution.
- A task that lacks the strict handoff gate remains a HITL task.
- The scheduler limits concurrent AFK work based on risk, review capacity, dependency status, and conflict surface.
- With `schedule -- --infer-conflicts`, the scheduler can also raise conflict risk for a run when queue item write surfaces overlap files changed by open PRs.
- High-risk or high-conflict issues require Solo Operator approval before dispatch.
- HITL tasks block only dependent work, unless they block the tracer bullet for a feature track.
- Non-dependent AFK slices may proceed when tracer-bullet coverage for their feature track is complete.

## Local Scheduler Plan

The scheduler is dry-run by default:

- It reads `.ai/ops.config.json`.
- It reads `.ai/queue.json` or a file passed with `--queue`.
- It prints planned dispatches and skipped reasons.
- It stores Scheduler Plans in `docs/agents/schedules/`.
- It does not call subagents.

`pnpm ops schedule -- --apply` is the explicit tracker mutation bridge:

- It still generates and stores a Scheduler Plan first.
- It updates GitHub Project fields only for entries that resolved to `DISPATCH`.
- It moves selected Project items to `Execution Stage = AFK In Progress` and `Execution Lane = Execution`.
- It writes `Last Scheduler Plan` when that optional Project field exists.
- It requires queue items with GitHub Project item IDs, so regenerate `.ai/queue.json` with `pnpm ops github:export` before applying.

`pnpm ops schedule -- --dispatch` is the first bridge out of pure dry-run:

- It still generates and stores a Scheduler Plan first.
- It creates Dispatch Artifacts only for plan entries that resolved to `DISPATCH`.
- It remains local-only and does not invoke providers or mutate GitHub.
- When combined with `--apply`, the generated `Dispatch ID` is written back to the Project item.

## Queue Export

- `pnpm ops github:export` writes `.ai/queue.json`.
- The export includes all non-`Done` Project issues.
- The queue file is a snapshot cache, not the source of truth.
- Missing project configuration should fail with a clear setup message.

## Dispatch Artifacts

Initial dispatch creates artifacts only:

- JSON is canonical for a future runner.
- Markdown is the readable mirror for the Solo Operator.
- Dispatch artifacts live in `docs/agents/dispatches/`.
- Direct provider-specific subagent calls belong in the runner layer.

## Dispatch Claims

The claim implementation is file-backed and locally locked:

- It creates an exclusive sidecar lock before claim/reclaim mutation.
- It re-reads dispatch JSON inside the lock before changing state.
- It updates dispatch JSON from `queued` to `claimed`.
- It records `claimed_by`, `claimed_at`, `lease_hours`, `expires_at`, and `isolation_mode`.
- It refuses to claim dispatches that are not `queued`.
- `pnpm ops claim -- --apply-tracker` writes the claimed runner into the GitHub Project `Runner` field when the dispatch artifact has `project_item_id`.
- `pnpm ops claim -- --apply-lock-ref` creates an atomic GitHub branch ref under `refs/heads/autopocock-locks/` before local mutation; duplicate ref creation fails the claim and leaves the dispatch queued.
- `pnpm ops claim-status` reports claim age, lease expiry, and whether the claim appears stale.
- `pnpm ops claim-locks` lists remote GitHub lock refs, matches them to local claimed dispatches, and reports active, stale, and orphaned locks.
- `pnpm ops claim-locks -- --apply --approved-by <operator> --reason "<reason>"` deletes orphaned remote lock refs only; matched stale claims should be reclaimed through `reclaim-expired --apply-lock-ref` so local state and remote refs stay aligned.
- `pnpm ops reclaim` returns a claimed dispatch to `queued` only with explicit Solo Operator approval and a recorded reason.
- `pnpm ops reclaim -- --apply-tracker` clears the GitHub Project `Runner` field when the dispatch artifact has `project_item_id`.
- `pnpm ops reclaim -- --apply-lock-ref` deletes the recorded GitHub lock ref during approved recovery.
- `pnpm ops reclaim-expired` dry-runs expired lease enforcement across claimed dispatches; `--apply` reclaims expired dispatches with recorded approval, `--apply-tracker` clears visible Project runner leases, and `--apply-lock-ref` deletes recorded GitHub lock refs.

## Runner Stub

- `pnpm ops run` consumes claimed Dispatch Artifacts only.
- It validates claim metadata, Isolation Mode, and forbidden actions.
- It prints a Runner Plan and does not invoke providers, create worktrees, or change code.
