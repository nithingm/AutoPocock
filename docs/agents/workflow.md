# Workflow

The Solo Operator can use the Umbrella CLI for Guided Flow or low-level commands for Manual Mode.

For the canonical end-to-end manual happy path, use `docs/agents/manual-walkthrough.md` as the primary **Workflow Artifact**. This file is the summary contract; the walkthrough owns the exact operator sequence.

## Canonical Story

The manual operating system is GitHub-backed but artifact-led.

- GitHub Issues and GitHub Projects carry live state.
- Repo markdown under `docs/` and `issues/` carries the rich working context.
- `pnpm ops` commands generate or validate those artifacts, but several GitHub setup steps remain manual in the current product shape.
- The documented split from issue #13 is final for this phase: TDD stays a doc contract, `skills/engineering/` owns reusable agent workflows, `.ai/prompts/` owns reusable prompt content, and `prompts/` stays the wrapper layer.

## Guided Flow

Use:

```bash
pnpm ops
```

The Umbrella CLI stages the workflow:

- `pnpm ops init`: provision local workflow structure and configuration without executing workers
- `pnpm ops prd -- --title "Feature Name"`: create a PRD artifact
- `pnpm ops issues`: create issue slices from the latest PRD
- `pnpm ops handoff -- --issue 123 --title "Implement slice"`: create a handoff artifact
- `pnpm ops hitl -- --issue 123 --title "Provision API token"`: create a prepared human step artifact
- `pnpm ops complete -- --issue 123 --status "needs human review"`: create a completion report
- `pnpm ops review-prep -- --issue 123 --pr 456 --completion docs/agents/completions/file.md --acceptance "criterion 1|criterion 2" --dependency-changes "None" --local-refactors "None"`: validate the Review Entry Gate and create advisory review prep only when required inputs are explicit
- `pnpm ops memory-propose -- --type workflow --title "Update workflow contract" --rationale "Why this belongs in durable memory" --target-files "docs/agents/workflow.md|CONTEXT.md" --suggested-text "Proposed durable memory text" --accept-risk "Risk if accepted" --reject-risk "Risk if rejected"`: create durable memory proposal artifacts without editing durable memory directly
- `pnpm ops mirror -- --artifact docs/agents/handoffs/file.md --issue 123`: dry-run a selective GitHub comment mirror for supported workflow artifacts
- `pnpm ops feedback -- --issue 123 --pr 456 --finding "QA finding text"`: classify a QA finding into a Same-PR Fix candidate or a new bug draft, and write a local feedback artifact without mutating GitHub
- `pnpm ops dispatch -- --issue 123 --title "Implement slice" --source manual --override-reason "Solo Operator approved"`: create dispatch-ready artifacts without calling a subagent
- `pnpm ops claim -- --dispatch docs/agents/dispatches/dispatch-id.json --claimed-by runner-name --isolation-mode worktree`: claim a queued dispatch artifact
- `pnpm ops claim-status -- --dispatch docs/agents/dispatches/dispatch-id.json --max-age-hours 24`: inspect whether a claimed dispatch looks stale
- `pnpm ops reclaim -- --dispatch docs/agents/dispatches/dispatch-id.json --approved-by solo-operator --reason "Runner abandoned work"`: explicitly return a claimed dispatch to `queued`
- `pnpm ops qa -- --issue 123 --pr 456`: generate targeted QA for tracked work
- `pnpm ops qa`: generate generic QA from recent commits
- `pnpm ops board`: print the board, lane, and scheduler contract
- `pnpm ops schedule -- --queue .ai/queue.example.json`: print a dry-run Scheduler Plan
- `pnpm ops schedule -- --queue .ai/queue.example.json --dispatch`: create dispatch artifacts for `DISPATCH` decisions in the generated Scheduler Plan
- `pnpm ops github:init`: print a dry-run GitHub Tracker Bootstrap report
- `pnpm ops github:export`: export non-`Done` GitHub Project issues into `.ai/queue.json`
- `pnpm ops run -- --dispatch docs/agents/dispatches/dispatch-id.json`: validate a claimed dispatch without invoking a provider
- `pnpm ops run -- --dispatch docs/agents/dispatches/dispatch-id.json --prepare-worktree`: prepare the local worktree directory for a claimed worktree dispatch, then print the Runner Plan

## GitHub Setup Requirements

GitHub-backed flow depends on a real project configuration, not just local files.

- `.ai/ops.config.json` must contain the intended GitHub owner, repo, and Project reference.
- `gh` must be installed and authenticated before `pnpm ops github:init`, `pnpm ops github:export`, or `pnpm ops mirror -- --apply`.
- `pnpm ops github:init` is a bootstrap report by default. With `-- --apply`, validated behavior is limited to creating missing canonical labels.
- GitHub Project creation, field creation, and view creation are still manual in this version.
- `pnpm ops board` prints the board contract only. It does not verify live GitHub schema drift.

The required GitHub Project fields for the manual OS are:

- `Execution Stage`
- `Execution Lane`
- `Queue Class`
- `Risk`
- `Dependency`
- `Conflict Surface`
- `Feature Track`
- `Dispatch ID`

The optional fields currently documented are `Review Capacity Cost`, `Runner`, `Last Scheduler Plan`, and `PR`.

## Artifact Chaining

The workflow is only coherent when each command hands off to the next artifact cleanly:

1. `pnpm ops prd` writes the PRD in `docs/PRDs/`.
2. `pnpm ops issues` turns that PRD into bounded slice drafts in `issues/`.
3. `pnpm ops handoff` creates the slice handoff in `docs/agents/handoffs/`.
4. `pnpm ops github:export` snapshots non-`Done` tracker items into `.ai/queue.json`.
5. `pnpm ops schedule -- --dispatch` writes a scheduler plan, then dispatch artifacts for `DISPATCH` decisions only.
6. `pnpm ops claim` and `pnpm ops run -- --prepare-worktree` move one dispatch into a claimed, locally prepared execution context.
7. `pnpm ops complete` writes the completion report for the implemented slice.
8. `pnpm ops review-prep` validates the Review Entry Gate and writes review prep only when the slice is fully described.
9. `pnpm ops qa` writes targeted QA output for the slice.
10. `pnpm ops feedback` classifies any finding as a Same-PR candidate or a new bug draft without mutating GitHub by default.

## TDD

TDD is part of implementation and bug-fix execution, not a separate Execution Stage. Use `docs/agents/tdd.md` when preparing or reviewing AFK implementation slices.

## Review Entry Gate

`pnpm ops review-prep` no longer writes a placeholder artifact unconditionally.

- It loads a completion report, validates acceptance criteria, changed areas, dependency changes, local refactors, verification, gaps, risks, and follow-ups.
- It fails with explicit missing-input messages when the Review Entry Gate is incomplete.
- It writes advisory Review Prep only when the gate passes.

## Targeted QA

`pnpm ops qa -- --issue <id> --pr <ref>` is strict by default for AFK workflow.

- Issue and PR identifiers are required unless `--manual` is supplied.
- Missing handoff or completion context is a workflow failure, not a soft warning.
- Missing Review Prep remains a warning.
- Oversized or unclear work is reported as needing slicing and blocks a strict QA pass.
- The command still writes a QA checklist artifact before failing so the operator can inspect the context and warnings.

## Artifact Mirroring

`pnpm ops mirror` is selective and dry-run by default.

- Supported artifacts include handoff, Prepared Human Step, Completion Report, Review Prep, QA summaries, feedback summaries, and durable memory proposal summaries.
- The command prints the target issue or PR and the summarized comment body before any posting behavior.
- Full Scheduler Plans are blocked by default because they are too noisy for issue comments.
- GitHub posting requires explicit `--apply`.

## Scheduler Dispatch

`pnpm ops schedule -- --dispatch` stays local-first.

- It still writes a Scheduler Plan before doing anything else.
- It creates Dispatch Artifacts only for items that resolved to `DISPATCH`.
- It does not mutate GitHub or invoke providers.
- Scheduler-sourced dispatch artifacts default to `worktree` isolation.
- Manual `pnpm ops dispatch` exists, but validated behavior is still rough. If you use it, pass `--handoff <exact path>` explicitly and inspect the generated JSON before treating it as dispatchable.

## What You Need To Do

To make the whole flow work end-to-end as the Solo Operator:

- Configure `.ai/ops.config.json` with the GitHub owner/repo/project reference when you want live tracker export/bootstrap behavior.
- Install and authenticate `gh` for any GitHub-backed step such as `github:init -- --apply`, `github:export`, or `mirror -- --apply`.
- Keep issue slices bounded enough that one handoff, one review, and one QA pass still make sense.
- Write real handoff, completion, and review-prep artifacts instead of placeholders, because strict QA now uses that context directly.
- Export or prepare `.ai/queue.json`, then run `pnpm ops schedule -- --dispatch` to create actual dispatch artifacts for eligible work.
- Claim dispatches with a stable runner identity using `pnpm ops claim`; for worktree isolation, keep the derived or explicit `worktree_path` available locally.
- Use `pnpm ops run -- --prepare-worktree` when a claimed dispatch is worktree-isolated and you want the local directory created before any future execution layer.
- Use `pnpm ops claim-status` to inspect old claims before restarting or recycling work.
- Use `pnpm ops reclaim` only when you have decided the old claim should be abandoned; the reclaim command records that approval locally.
- Use `pnpm ops run` as the final local validation step before any future provider execution layer.
- Use `pnpm ops qa` and `pnpm ops feedback` after implementation so QA context and bug-vs-same-PR decisions are explicit.

## Slice Completion Rules

A slice is complete enough to move through review and QA only when all of the following are true:

- The slice is still bounded enough that one handoff, one completion report, one review prep, and one targeted QA pass describe the same unit of work.
- The handoff, completion report, and review prep contain real content, not template placeholders.
- Acceptance criteria, changed areas, verification commands and outcomes, risks, gaps, and follow-ups are explicit.
- Scope-expanding defects are captured as new follow-up issues instead of being folded into the current slice.
- The GitHub issue can move to `Done` without hiding unresolved work behind vague artifacts or broad "cleanup later" assumptions.

## Feedback

`pnpm ops feedback` is local-first in this version.

- Minor findings may be classified as Same-PR Fix candidates, but Solo Operator approval is still required.
- Broader defects default to new bug drafts linked back to the original issue and PR.
- The command writes local JSON and markdown artifacts under `docs/agents/feedback/`.
- No GitHub issue or comment is created by default.

## Manual Mode

Use the lower-level scripts directly:

```bash
pnpm prd -- --title "Feature Name"
pnpm issues
pnpm qa
```

Manual Mode should produce the same artifact types as Guided Flow.

## Initialization Boundary

`init` sets up worker and automation-ready structure, but does not run workers, process backlog, or mutate issue state beyond creating configuration artifacts.

AFK execution begins only after PRDs, issue decomposition, and tracer bullets exist.
