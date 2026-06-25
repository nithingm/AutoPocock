# Workflow

The Solo Operator can use the Umbrella CLI for Guided Flow or low-level commands for Manual Mode.

For the canonical end-to-end manual happy path, use `docs/agents/manual-walkthrough.md` as the primary **Workflow Artifact**. This file is the summary contract; the walkthrough owns the exact operator sequence.

For the current distinction between landed code, local implementation work, and live GitHub tracker state, use `docs/agents/project-status.md`. For a concise map of which Workflow Artifact owns which kind of project knowledge, use `docs/agents/knowledge-map.md`.

## Canonical Story

The manual operating system is GitHub-backed but artifact-led.

- GitHub Issues and GitHub Projects carry live state.
- Repo markdown under `docs/` and `issues/` carries the rich working context.
- `pnpm ops` commands generate or validate those artifacts, but several GitHub setup steps remain manual in the current product shape.
- The documented split from issue #13 is final for this phase: TDD stays a doc contract, `skills/engineering/` owns reusable agent workflows, `.ai/prompts/` owns reusable prompt content, and `prompts/` stays the wrapper layer.

The operator has two valid entry branches:

- new-feature planning path: `setup -> context -> context-approve -> prd -> prd-approve -> issues -> handoff -> ...`
- existing-live-issue path: `setup -> handoff -> ...` when the GitHub issue already exists and PRD/issues creation is intentionally skipped

## Guided Flow

Use:

```bash
pnpm ops
```

The Umbrella CLI stages the workflow:

- `pnpm ops init`: provision local workflow structure and configuration without executing workers
- `pnpm ops setup`: report OS, shell, provider readiness, GitHub readiness, runtime prerequisites, and workflow-structure status in one dry-run-first flow; add `--apply-init` to materialize missing local directories
- `pnpm ops context -- --title "Feature Name"`: create a durable shared-context artifact in draft state
- `pnpm ops context-approve -- --context docs/agents/contexts/file.md --approved-by solo-operator`: mark a shared-context artifact approved so planning may continue
- `pnpm ops prd -- --context docs/agents/contexts/file.md --title "Feature Name"`: create a PRD artifact from approved context
- `pnpm ops prd-approve -- --prd docs/PRDs/file.md --approved-by solo-operator`: mark a PRD approved so issue planning may continue
- `pnpm ops issues -- --prd docs/PRDs/file.md`: create an Issue DAG markdown artifact plus canonical JSON from an approved PRD
- `pnpm ops handoff -- --issue 123 --title "Implement slice"`: create a handoff artifact
- `pnpm ops hitl -- --issue 123 --title "Provision API token"`: create a prepared human step artifact
- `pnpm ops complete -- --issue 123 --status "needs human review"`: create a completion report
- `pnpm ops review-prep -- --issue 123 --completion docs/agents/completions/file.md --acceptance "criterion 1|criterion 2" --dependency-changes "None" --local-refactors "None"`: validate the Review Entry Gate and create advisory review prep only when required inputs are explicit; add `--pr 456` only when a PR already exists
- `pnpm ops review-decision -- --dag issues/file.json --issue 123 --node node-1 --decision approve --approved-by solo-operator`: apply an explicit review approval or rejection to a DAG node and write a durable review decision artifact
- `pnpm ops qa-decision -- --dag issues/file.json --issue 123 --node node-1 --decision pass --approved-by solo-operator`: apply an explicit QA pass or fail to a DAG node, write a QA decision artifact, and create a follow-up bug draft automatically on QA failure
- `pnpm ops memory-propose -- --type workflow --title "Update workflow contract" --rationale "Why this belongs in durable memory" --target-files "docs/agents/workflow.md|CONTEXT.md" --suggested-text "Proposed durable memory text" --accept-risk "Risk if accepted" --reject-risk "Risk if rejected"`: create durable memory proposal artifacts without editing durable memory directly
- `pnpm ops memory-decision -- --proposal docs/agents/memory-proposals/file.json --decision approve --approved-by solo-operator --reason "Accepted"`: record approval or rejection for a durable memory proposal; add `--apply` with approval to append the proposal text to repo target files using an idempotent marker
- `pnpm ops mirror -- --artifact docs/agents/handoffs/file.md --issue 123`: dry-run a selective GitHub comment mirror for supported workflow artifacts; add `--apply --update-existing` to refresh an existing marked mirror comment instead of posting a duplicate
- `pnpm ops feedback -- --issue 123 --finding "QA finding text"`: classify a QA finding into a Same-PR Fix candidate or a new bug draft, and write a local feedback artifact without mutating GitHub; add `--pr 456` only when a PR already exists, and add `--apply` only when you intentionally want the GitHub mutation
- `pnpm ops dispatch -- --issue 123 --title "Implement slice" --source manual --override-reason "Solo Operator approved"`: create dispatch-ready artifacts without calling a subagent
- `pnpm ops claim -- --dispatch docs/agents/dispatches/dispatch-id.json --claimed-by runner-name --isolation-mode worktree`: claim a queued dispatch artifact with an exclusive local artifact lock
- `pnpm ops claim-status -- --dispatch docs/agents/dispatches/dispatch-id.json --max-age-hours 24`: inspect whether a claimed dispatch looks stale
- `pnpm ops reclaim -- --dispatch docs/agents/dispatches/dispatch-id.json --approved-by solo-operator --reason "Runner abandoned work"`: explicitly return a claimed dispatch to `queued`
- `pnpm ops qa -- --issue 123`: generate targeted QA for tracked work; add `--pr 456` only when a PR already exists and you want it called out in the checklist
- `pnpm ops qa`: generate generic QA from recent commits
- `pnpm ops board`: print the board, lane, and scheduler contract
- `pnpm ops schedule -- --queue .ai/queue.example.json`: print a dry-run Scheduler Plan
- `pnpm ops schedule -- --queue .ai/queue.json --infer-conflicts`: use queue item write surfaces and active PR file paths to infer high-conflict overlaps before dispatch
- `pnpm ops schedule -- --queue .ai/queue.json --apply`: update GitHub Project fields for selected `DISPATCH` decisions without creating dispatch artifacts
- `pnpm ops schedule -- --queue .ai/queue.example.json --dispatch`: create dispatch artifacts for `DISPATCH` decisions in the generated Scheduler Plan
- `pnpm ops github:init`: print a dry-run GitHub Tracker Bootstrap report
- `pnpm ops github:export`: export non-`Done` GitHub Project issues into `.ai/queue.json`
- `pnpm ops run -- --dispatch docs/agents/dispatches/dispatch-id.json`: validate a claimed dispatch without invoking a provider
- `pnpm ops run -- --dispatch docs/agents/dispatches/dispatch-id.json --prepare-worktree`: prepare the local worktree directory for a claimed worktree dispatch, then print the Runner Plan
- `pnpm ops run -- --dispatch docs/agents/dispatches/dispatch-id.json --execute`: execute from the approved Loop Spec, persist Provider Run metadata plus stdout/stderr logs, and enforce runtime stop/escalation conditions
- `pnpm ops run-mirror -- --run .ai/provider-runs/provider-run-id.json --issue 123`: dry-run a Provider Run update for a GitHub issue; add `--apply --update-existing` to refresh an existing marked Provider Run comment instead of posting a duplicate
- `pnpm ops console -- --port 4173 --host 127.0.0.1`: launch the local workflow console UI over the same artifact and gate contracts the CLI uses

## GitHub Setup Requirements

GitHub-backed flow depends on a real project configuration, not just local files.

- `pnpm ops setup` is the top-level readiness check for local structure, host environment, provider availability, and GitHub config/auth state.
- `.ai/ops.config.json` must contain the intended GitHub owner, repo, and Project reference.
- `gh` must be installed and authenticated before `pnpm ops github:init`, `pnpm ops github:export`, `pnpm ops schedule -- --apply`, `pnpm ops mirror -- --apply`, or `pnpm ops feedback -- --apply`.
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

1. `pnpm ops context` writes draft shared context in `docs/agents/contexts/`.
2. `pnpm ops context-approve` marks that context approved.
3. `pnpm ops prd` writes the PRD in `docs/PRDs/` from approved context only.
4. `pnpm ops prd-approve` marks that PRD approved.
5. `pnpm ops issues` turns that approved PRD into an Issue DAG with node metadata, dependency edges, and execution waves in `issues/`.
6. `pnpm ops handoff` creates the slice handoff in `docs/agents/handoffs/`.
7. `pnpm ops github:export` snapshots non-`Done` tracker items into `.ai/queue.json`.
8. `pnpm ops schedule -- --apply` writes a scheduler plan, then updates tracker fields for `DISPATCH` decisions only.
9. `pnpm ops schedule -- --dispatch` writes a scheduler plan, then dispatch artifacts for `DISPATCH` decisions only.
10. `pnpm ops claim` and `pnpm ops run -- --prepare-worktree` move one dispatch into a claimed, locally prepared execution context.
11. `pnpm ops complete` writes the completion report for the implemented slice.
12. `pnpm ops review-prep` validates the Review Entry Gate and writes review prep only when the slice is fully described.
13. `pnpm ops review-decision` records Solo Operator review approval or rejection against the DAG node.
14. `pnpm ops qa` writes targeted QA output for the slice.
15. `pnpm ops qa-decision` records QA pass or fail against the DAG node, reopens failed work into a bug loop, and unlocks dependents only when progression rules are satisfied.
16. `pnpm ops feedback` classifies any finding as a Same-PR candidate or a new bug draft without mutating GitHub by default.
17. `pnpm ops console` provides an artifact-first UI over Setup, Context, PRD, Graph, Execution, and Review without replacing repo truth.

The late-stage pre-PR path is intentional:

- `review-prep` can run with `--issue` only plus the required gate inputs
- `qa` can run with `--issue` only for strict targeted QA
- `feedback` can run with `--issue` plus `--finding`
- add `--pr` to any of those commands only after a PR exists

## TDD

TDD is part of implementation and bug-fix execution, not a separate Execution Stage. Use `docs/agents/tdd.md` when preparing or reviewing AFK implementation slices.

## Review Entry Gate

`pnpm ops review-prep` no longer writes a placeholder artifact unconditionally.

- It loads a completion report, validates acceptance criteria, changed areas, dependency changes, local refactors, verification, gaps, risks, and follow-ups.
- It fails with explicit missing-input messages when the Review Entry Gate is incomplete.
- It writes advisory Review Prep only when the gate passes.

## Decision Gates

Review and QA progression are now durable workflow transitions, not implicit human memory.

- `pnpm ops review-decision` requires `--approved-by` and records either `approve` or `reject` on the target DAG node.
- Review approval moves a node into `qa`.
- Review rejection reopens the node to `ready_for_handoff`.
- `pnpm ops qa-decision` requires prior review approval and records either `pass` or `fail`.
- QA pass moves the node to `done` and unlocks dependents only when all dependencies are complete.
- QA fail moves the node to `bug_loop` and creates a follow-up bug draft under `docs/agents/feedback/`.

## Durable Memory Proposal Decisions

`pnpm ops memory-propose` is local-first and writes proposal JSON plus markdown under `docs/agents/memory-proposals/`.

- `pnpm ops memory-decision -- --proposal <proposal.json> --decision approve --approved-by <operator> --reason "<reason>"` records approval without changing target files.
- `pnpm ops memory-decision -- --proposal <proposal.json> --decision reject --approved-by <operator> --reason "<reason>"` records rejection and leaves target files unchanged.
- `pnpm ops memory-decision -- --proposal <proposal.json> --decision approve --approved-by <operator> --reason "<reason>" --apply` approves and appends the proposal text to each repo target file with an idempotent `memory-proposal` marker.
- `pnpm ops memory-decision -- --proposal <approved-proposal.json> --approved-by <operator> --apply` applies an already approved proposal.
- The apply path edits only repo target files named by the proposal. It does not mutate external Codex memory or any user-level memory store.

## Targeted QA

`pnpm ops qa -- --issue <id>` is strict by default for AFK workflow.

- `--issue` is required unless `--manual` is supplied.
- `--pr` is optional late-stage context when a PR already exists.
- Missing handoff or completion context is a workflow failure, not a soft warning.
- Missing Review Prep remains a warning.
- Oversized or unclear work is reported as needing slicing and blocks a strict QA pass.
- The command still writes a QA checklist artifact before failing so the operator can inspect the context and warnings.

## Artifact Mirroring

`pnpm ops mirror` is selective and dry-run by default.

- Supported artifacts include handoff, Prepared Human Step, Completion Report, Review Prep, QA summaries, feedback summaries, and durable memory proposal summaries.
- The command prints the target issue or PR and the summarized comment body before any posting behavior.
- Mirror comments include a stable `autopocock:artifact-mirror` marker derived from the artifact path and kind.
- `--apply` posts a new GitHub issue or PR comment.
- `--apply --update-existing` first searches existing target comments for the marker and edits the matching comment when present; if no match exists, it posts a new comment.
- Full Scheduler Plans are blocked by default because they are too noisy for issue comments.
- GitHub posting requires explicit `--apply`.

`pnpm ops run-mirror` uses the same marked-comment update behavior for Provider Run metadata mirrored to GitHub issues.

## Scheduler Apply And Dispatch

`pnpm ops schedule` is dry-run-first.

- It writes a Scheduler Plan before doing anything else.
- Without `--apply` or `--dispatch`, it does not mutate GitHub or create dispatch artifacts.
- `--infer-conflicts` is advisory and opt-in. It compares queue item `writeSurface`/`write_surface` entries against changed files from open PRs, or from `--active-prs-input <json>` for fixture-backed/offline checks.
- Inferred overlap is treated as high conflict for that run and skips the item with an explicit active-PR/file/path reason.
- `--apply` updates GitHub Project fields only for items that resolved to `DISPATCH`: `Execution Stage = AFK In Progress`, `Execution Lane = Execution`, and `Last Scheduler Plan` when that optional field exists.
- `--apply` requires queue items with GitHub Project item IDs, so use `pnpm ops github:export` for the queue snapshot before applying live scheduler state.

`pnpm ops schedule -- --dispatch` stays local-first.

- It still writes a Scheduler Plan before doing anything else.
- It creates Dispatch Artifacts only for items that resolved to `DISPATCH`.
- It does not mutate GitHub or invoke providers.
- Scheduler-sourced dispatch artifacts default to `worktree` isolation.
- If `--dispatch` is combined with `--apply`, the generated `Dispatch ID` is written back to the Project item.
- Manual `pnpm ops dispatch` requires an exact matching handoff artifact. If auto-resolution cannot find one unambiguous issue-matching handoff, pass `--handoff <exact path>` explicitly or create the handoff first.

## What You Need To Do

To make the whole flow work end-to-end as the Solo Operator:

- Configure `.ai/ops.config.json` with the GitHub owner/repo/project reference when you want live tracker export/bootstrap behavior.
- Install and authenticate `gh` for any GitHub-backed step such as `github:init -- --apply`, `github:export`, `schedule -- --apply`, `mirror -- --apply`, or `feedback -- --apply`.
- Keep issue slices bounded enough that one handoff, one review, and one QA pass still make sense.
- Write real handoff, completion, and review-prep artifacts instead of placeholders, because strict QA now uses that context directly.
- Export or prepare `.ai/queue.json`, then run `pnpm ops schedule -- --apply` to reserve eligible work on the Project, `pnpm ops schedule -- --dispatch` to create dispatch artifacts, or both flags together when you want the generated `Dispatch ID` reflected in GitHub.
- Claim dispatches with a stable runner identity using `pnpm ops claim`; the command uses an exclusive local dispatch-artifact lock and re-reads state before mutation. For worktree isolation, keep the derived or explicit `worktree_path` available locally.
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

`pnpm ops feedback` is local-first by default.

- Minor findings may be classified as Same-PR Fix candidates, but Solo Operator approval is still required.
- Broader defects default to new bug drafts linked back to the original issue and PR.
- The command writes local JSON and markdown artifacts under `docs/agents/feedback/`.
- No GitHub issue or comment is created by default.
- With explicit `--apply`, Same-PR Fix candidates are posted to the PR and broader bug drafts create follow-up GitHub issues. The persisted feedback artifact records the mutation result.

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
