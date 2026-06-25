# agentic-repo-template

This repository is the first cut of a reusable agentic engineering operating system.

The initial goal is not autonomy. The initial goal is a disciplined manual workflow:

1. Capture intent.
2. Turn intent into a PRD.
3. Break the PRD into bounded issues.
4. Implement one issue at a time.
5. Run QA.
6. Capture bugs as follow-up issues.
7. Repeat.

The first concrete command is:

```bash
pnpm ops
pnpm prd -- --title "Feature Name"
pnpm issues
pnpm qa
```

`pnpm ops` is the Guided Flow entrypoint. The lower-level commands remain available for Manual Mode.
`pnpm ops console -- --port 4173` launches a local artifact-first workflow console over Setup, Context, PRD, Graph, Execution, and Review.
`pnpm ops run -- --execute --live-provider` defaults to Codex and can use Claude Code with `--provider claude` when that CLI is installed and authenticated.
`pnpm ops run -- --prepare-docker` prints the Docker container boundary for a Docker-isolated dispatch and blocks provider execution until in-container execution is wired.
`pnpm ops worktree-clean` previews stale unreferenced `.worktrees` cleanup; add `--apply` only when you want deletion.
`pnpm verify:project` runs the repeatable readiness check: setup, tests, console smoke, GitHub auth, and Project export visibility.

The canonical operator walkthrough lives in `docs/agents/manual-walkthrough.md`. Use that file as the exact manual happy path. `README.md` is the top-level map; `docs/agents/workflow.md` is the contract summary.

For the current repo/tracker/working-tree split, use `docs/agents/project-status.md`. For the map of which artifact owns which project knowledge, use `docs/agents/knowledge-map.md`.

Two operator entry branches are now first-class:

- new-feature path: start with `prd` and `issues`
- existing-live-issue path: skip `prd` and `issues`, then start from `handoff` for the already-existing GitHub issue

The late-stage pre-PR path is also intentional:

- `pnpm ops review-prep` can run with `--issue` and the required review-gate inputs before a PR exists
- `pnpm ops qa` can run with `--issue` only before a PR exists
- `pnpm ops feedback` can run with `--issue` plus `--finding` before a PR exists
- add `--pr` only when a PR already exists and you want that reference captured in the artifacts

## GitHub Setup Requirements

The manual OS assumes GitHub is the live tracker, but the repo stays local-first.

- Configure `.ai/ops.config.json` with the target GitHub owner, repo, and Project reference.
- Install and authenticate `gh` before any GitHub-backed step such as `pnpm ops github:init`, `pnpm ops github:export`, `pnpm ops schedule -- --apply`, `pnpm ops mirror -- --apply`, or `pnpm ops feedback -- --apply`.
- Run `pnpm ops github:init` first as a dry run. The validated behavior is bootstrap reporting plus missing-label creation with `-- --apply`, fresh Project creation with `-- --apply --create-project --project-title "Name"` when no Project reference is configured, and missing configured Project field creation with `-- --apply --create-project-fields`.
- Create or connect the GitHub Project deliberately. `github:init` refuses to create a duplicate Project when `.ai/ops.config.json` already has a Project URL, ID, or number. It still does not create Project views for you.
- Keep the required Project fields aligned with `docs/agents/board.md` and `.ai/ops.config.json`: `Execution Stage`, `Execution Lane`, `Queue Class`, `Risk`, `Dependency`, `Conflict Surface`, `Feature Track`, and `Dispatch ID`.

## Structure

- `.ai/prompts/`: reusable prompt content for workflow tasks
- `.ai/memory/`: durable project memory and ubiquitous language
- `docs/agents/`: tracker, board, handoff, and workflow contracts
- `docs/agents/feedback/`: local QA feedback artifacts for Same-PR Fix proposals and bug drafts
- `docs/agents/memory-proposals/`: proposed durable memory changes plus recorded approve/reject/apply decisions
- `docs/PRDs/`: product requirement documents
- `docs/QA/`: generated and curated QA artifacts
- `issues/`: issue drafts and bug follow-ups
- `prompts/`: user-facing or script-facing prompt wrappers and entrypoints
- `scripts/`: local workflow scripts
- `skills/engineering/`: Matt-style `SKILL.md` files for reusable agent behavior

## Skills And Prompts Split

Issue #13's approved product shape is now the documented contract:

- Keep TDD as a doc-only execution contract in `docs/agents/tdd.md`.
- Keep `skills/engineering/` for reusable agent workflows and behavior.
- Keep `.ai/prompts/` for reusable prompt content.
- Keep `prompts/` for thin wrapper entrypoints that humans or scripts invoke directly.

## Current Scope

This scaffold deliberately stops before:

- multi-agent orchestration
- full in-container provider execution
- autonomous backlog processing
- true distributed claim arbitration
- memory synthesis loops
- commit automation

Those come after the manual loop is stable.

## Manual Loop

The canonical manual happy path lives in `docs/agents/manual-walkthrough.md`.

The artifact chain for one AFK-ready slice is:

1. PRD in `docs/PRDs/`
2. Issue decomposition in `issues/`
3. Handoff in `docs/agents/handoffs/`
4. Queue snapshot in `.ai/queue.json` when GitHub export is used
5. Scheduler plan in `docs/agents/schedules/`
6. Dispatch artifact in `docs/agents/dispatches/`
7. Completion report in `docs/agents/completions/`
8. Review prep in `docs/agents/reviews/`
9. QA artifact plus optional feedback artifact for same-PR or bug follow-up decisions

What counts as done for a slice in the manual OS:

- The change stays within the original slice boundary.
- The implementation and verification are complete enough to replace template placeholders with real artifact content.
- `pnpm ops review-prep` passes the Review Entry Gate with explicit acceptance, changed areas, verification, risks, and follow-ups.
- Targeted QA has run for that slice, and any defect that would widen scope is captured as a separate follow-up instead of being folded into the current slice.
- The operator can move the GitHub issue to `Done` because the slice no longer depends on unstated work.

1. Run `pnpm ops init`.
2. Create or refine a PRD with `pnpm ops prd -- --title "Feature Name"`.
3. Generate issue slices with `pnpm ops issues`.
4. Prepare AFK-ready work with `pnpm ops handoff -- --issue 123 --title "Implement slice"`.
5. Run `pnpm ops review-prep` only after the Review Entry Gate inputs are explicit.
6. Export or prepare queue input, then run `pnpm ops schedule -- --apply` to reserve eligible AFK work on the Project, `pnpm ops schedule -- --dispatch` to create dispatch artifacts, or both flags together when you want the generated `Dispatch ID` reflected in GitHub.
7. Add `--infer-conflicts` to scheduler runs when queue items include write surfaces and you want open PR file overlap to block risky dispatches.
8. Run `pnpm ops qa`.
9. Run `pnpm ops feedback` to classify QA findings before deciding on Same-PR fixes or bug follow-ups. Add `--apply` only when you intentionally want the PR comment or follow-up issue created in GitHub.
10. Use `pnpm ops mirror -- --apply --update-existing` when you want to refresh an existing marked GitHub artifact mirror instead of posting another copy.
11. Use `pnpm ops memory-propose` and `pnpm ops memory-decision` when a workflow decision should become repo-local durable memory.
12. Capture defects as new issues instead of widening the current change.
