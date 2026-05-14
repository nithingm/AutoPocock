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

The canonical operator walkthrough lives in `docs/agents/manual-walkthrough.md`. Use that file as the exact manual happy path. `README.md` is the top-level map; `docs/agents/workflow.md` is the contract summary.

## GitHub Setup Requirements

The manual OS assumes GitHub is the live tracker, but the repo stays local-first.

- Configure `.ai/ops.config.json` with the target GitHub owner, repo, and Project reference.
- Install and authenticate `gh` before any GitHub-backed step such as `pnpm ops github:init`, `pnpm ops github:export`, or `pnpm ops mirror -- --apply`.
- Run `pnpm ops github:init` first as a dry run. The validated behavior is bootstrap reporting plus missing-label creation only when `-- --apply` is used.
- Create and maintain the GitHub Project manually in this version. `github:init` does not create Projects, fields, or views for you.
- Keep the required Project fields aligned with `docs/agents/board.md` and `.ai/ops.config.json`: `Execution Stage`, `Execution Lane`, `Queue Class`, `Risk`, `Dependency`, `Conflict Surface`, `Feature Track`, and `Dispatch ID`.

## Structure

- `.ai/prompts/`: reusable prompt content for workflow tasks
- `.ai/memory/`: durable project memory and ubiquitous language
- `docs/agents/`: tracker, board, handoff, and workflow contracts
- `docs/agents/feedback/`: local QA feedback artifacts for Same-PR Fix proposals and bug drafts
- `docs/agents/memory-proposals/`: proposed durable memory changes awaiting Solo Operator approval
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
- Docker worker isolation
- autonomous backlog processing
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
6. Export or prepare queue input, then run `pnpm ops schedule -- --dispatch` to create dispatch artifacts for eligible AFK work.
7. Run `pnpm ops qa`.
8. Run `pnpm ops feedback` to classify QA findings before deciding on Same-PR fixes or bug follow-ups.
9. Capture defects as new issues instead of widening the current change.
