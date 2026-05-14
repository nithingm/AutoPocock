---
name: agentic-ops
description: Run the Solo Operator workflow for PRDs, issue slicing, handoffs, QA, and GitHub-aligned operational tracking.
---

# Agentic Ops

Use this skill when the user wants to run or improve the repo's agentic engineering workflow.

## Process

1. Read `CONTEXT.md` and `docs/agents/*.md`.
2. Determine whether the user wants Guided Flow through `pnpm ops` or Manual Mode through low-level commands.
3. Keep GitHub as the Operational Tracker unless the user explicitly chooses a different tracker.
4. Keep repo markdown as the Artifact Layer for PRDs, QA notes, handoffs, and completion reports.
5. Respect Matt Pocock triage roles as labels, not board stages.
6. Do not start AFK execution unless PRDs, issue slices, tracer bullets, and strict handoff gates exist.
7. Use `docs/agents/tdd.md` for implementation and bug-fix slices where behavior can be tested through a public interface.

## Commands

- `pnpm ops init`
- `pnpm ops prd -- --title "Feature Name"`
- `pnpm ops issues`
- `pnpm ops handoff -- --issue 123 --title "Implement slice"`
- `pnpm ops hitl -- --issue 123 --title "Provision API token"`
- `pnpm ops complete -- --issue 123 --status "needs human review"`
- `pnpm ops review-prep -- --issue 123 --pr 456`
- `pnpm ops dispatch -- --issue 123 --title "Implement slice" --source manual --override-reason "Solo Operator approved"`
- `pnpm ops claim -- --dispatch docs/agents/dispatches/dispatch-id.json --claimed-by runner-name --isolation-mode worktree`
- `pnpm ops qa -- --issue 123 --pr 456`
- `pnpm ops qa`
- `pnpm ops board`
- `pnpm ops schedule -- --queue .ai/queue.example.json`
- `pnpm ops github:init`
- `pnpm ops github:export`
- `pnpm ops run -- --dispatch docs/agents/dispatches/dispatch-id.json`
