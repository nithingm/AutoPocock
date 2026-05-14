# Workflow

The Solo Operator can use the Umbrella CLI for Guided Flow or low-level commands for Manual Mode.

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

## What You Need To Do

To make the whole flow work end-to-end as the Solo Operator:

- Configure `.ai/ops.config.json` with the GitHub owner/repo/project reference when you want live tracker export/bootstrap behavior.
- Install and authenticate `gh` for any GitHub-backed step such as `github:init -- --apply`, `github:export`, or `mirror -- --apply`.
- Keep issue slices bounded enough that one handoff, one review, and one QA pass still make sense.
- Write real handoff, completion, and review-prep artifacts instead of placeholders, because strict QA now uses that context directly.
- Export or prepare `.ai/queue.json`, then run `pnpm ops schedule -- --dispatch` to create actual dispatch artifacts for eligible work.
- Claim dispatches with a stable runner identity using `pnpm ops claim`; for worktree isolation, keep the derived or explicit `worktree_path` available locally.
- Use `pnpm ops claim-status` to inspect old claims before restarting or recycling work.
- Use `pnpm ops reclaim` only when you have decided the old claim should be abandoned; the reclaim command records that approval locally.
- Use `pnpm ops run` as the final local validation step before any future provider execution layer.
- Use `pnpm ops qa` and `pnpm ops feedback` after implementation so QA context and bug-vs-same-PR decisions are explicit.

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
