---
name: subagent-handoff
description: Create bounded context handoffs and completion reports for AFK subagents using strict readiness gates.
---

# Subagent Handoff

Use this skill when preparing work for a subagent or processing a subagent result.

## Handoff Rules

An issue is AFK-ready only when it has:

- outcome
- boundaries
- acceptance criteria
- verification path
- rollback or safe failure plan

If any part is missing, keep the work as a HITL task.

For HITL tasks, create a Prepared Human Step using `docs/agents/handoff.md`. Automate everything around the human-only step and tell the Solo Operator exactly what to do, where to do it, how to verify it, and what to report back.

## Handoff Process

1. Read the issue, linked PRD, relevant workflow artifacts, `CONTEXT.md`, and ADRs.
2. Create a Context Handoff using `docs/agents/handoff.md`.
3. Store the handoff in `docs/agents/handoffs/`.
4. Mirror the same handoff to the Operational Tracker as an issue comment when GitHub is configured.

## Completion Process

1. Require a Completion Report before moving the issue forward.
2. Store the report in `docs/agents/completions/`.
3. Mirror the report to the Operational Tracker as an issue comment when GitHub is configured.
4. Move the issue to the next recommended Execution Stage only after reviewing verification and residual risks.
