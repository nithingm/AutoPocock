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

## Structure

- `.ai/prompts/`: reusable operating prompts for the day-shift workflow
- `.ai/memory/`: durable project memory and ubiquitous language
- `docs/agents/`: tracker, board, handoff, and workflow contracts
- `docs/agents/feedback/`: local QA feedback artifacts for Same-PR Fix proposals and bug drafts
- `docs/agents/memory-proposals/`: proposed durable memory changes awaiting Solo Operator approval
- `docs/PRDs/`: product requirement documents
- `docs/QA/`: generated and curated QA artifacts
- `issues/`: issue drafts and bug follow-ups
- `prompts/`: user-facing prompt entrypoints and wrappers
- `scripts/`: local workflow scripts
- `skills/engineering/`: Matt-style `SKILL.md` files for reusable agent behavior

## Current Scope

This scaffold deliberately stops before:

- multi-agent orchestration
- Docker worker isolation
- autonomous backlog processing
- memory synthesis loops
- commit automation

Those come after the manual loop is stable.

## Manual Loop

1. Run `pnpm ops init`.
2. Create or refine a PRD with `pnpm ops prd -- --title "Feature Name"`.
3. Generate issue slices with `pnpm ops issues`.
4. Prepare AFK-ready work with `pnpm ops handoff -- --issue 123 --title "Implement slice"`.
5. Run `pnpm ops review-prep` only after the Review Entry Gate inputs are explicit.
6. Run `pnpm ops qa`.
7. Run `pnpm ops feedback` to classify QA findings before deciding on Same-PR fixes or bug follow-ups.
8. Capture defects as new issues instead of widening the current change.
