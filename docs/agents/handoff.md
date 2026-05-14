# Handoff Contract

Subagents receive bounded Context Handoffs and return structured Completion Reports.

## Strict Handoff Gate

An issue is AFK-ready only when all of these are explicit:

- outcome
- boundaries
- acceptance criteria
- verification path
- rollback or safe failure plan

## HITL Prepared Human Step Template

Use this whenever `Queue Class = hitl` or a task crosses the Credential Boundary.

```markdown
# Prepared Human Step

## Why This Is HITL

- Reason:

## What To Do

- Step 1:
- Step 2:

## Where To Do It

- URL, dashboard, command, file, or setting path:

## Required Value

- Environment variable or config key:
- Secret value: never write secret values here

## How To Verify

- Command or observable result:

## What To Report Back

- Confirmation needed:

## What Becomes AFK After This

- Next issue or handoff:
```

## Context Handoff Template

```markdown
# Context Handoff

## Issue

- Tracker:
- Title:
- Labels:
- Execution stage:

## Goal

- One sentence outcome:

## Boundaries

- In scope:
- Out of scope:
- Likely touched areas:

## Context

- PRD:
- Workflow artifacts:
- Domain terms:
- ADRs:

## Dependencies

- Blockers:
- Related issues:
- Conflict risks:

## Verification

- Automated:
- Manual:
- Evidence expected:
- TDD plan, when applicable:

## Completion

- Report back:
- Artifacts to update:
- PR or commit expectation:
- Next suggested stage:
```

## Completion Report Template

```markdown
# Completion Report

## Result

- Status:
- Summary:

## Changes

- Files or areas changed:
- Reason:

## Verification

- Commands run:
- Results:
- Gaps:

## Risks

- Residual risks:

## Follow-ups

- Bugs:
- Issues:

## Artifacts

- Updated:

## Next Stage

- Suggested stage:
```

## Review Entry Gate

AFK work can move to `Human Review` only when all of these are true:

- Issue acceptance criteria are addressed.
- Tests or checks were run, or unavailable checks are explicitly explained.
- TDD-relevant work explains the red-green-refactor path or why TDD did not apply.
- Completion Report is written.
- Changed files or areas are summarized.
- Risks and gaps are listed.
- Dependency changes are declared.
- Local refactors are declared.
- Follow-up issues are proposed where needed.
- No known failing checks are hidden.

When the Review Entry Gate passes and work moves to `Human Review`, generate Review Prep immediately. If the gate fails, do not generate Review Prep; move the item to `Bug Loop` or keep it in `AFK In Progress`.

## Review Prep Template

Review Prep is generated before the Solo Operator reviews an AFK PR. It is advisory and must not approve work.

```markdown
# Review Prep

## Issue And PR

- Issue:
- PR:
- Current stage:

## Boundary Check

- Declared boundaries:
- Changed areas:
- Possible boundary drift:

## Acceptance Criteria Check

- Criteria addressed:
- Missing or unclear:

## Verification Check

- Commands reported:
- Results:
- Gaps:

## Risk Summary

- Dependency changes:
- Local refactors:
- Conflict surface:
- Residual risks:

## Suggested Review Outcome

- Suggested next stage:
- Reason:

## Solo Operator Decisions Needed

- Same-PR fix decision:
- Memory update decision:
- Merge decision:
```

## Targeted QA Requirements

Targeted QA for AFK workflow is strict:

- Issue identifier is required.
- PR identifier is required.
- Handoff artifact is required.
- Completion Report is required.
- Review Prep is strongly expected; if missing, QA must warn.
- Missing handoff or completion context is a workflow failure, not a normal checklist gap.

Generic QA may be permissive in Manual Mode.

## Storage Rules

- Store handoff artifacts in `docs/agents/handoffs/`.
- Store completion reports in `docs/agents/completions/`.
- Store prepared human steps in `docs/agents/hitl/`.
- Store review prep artifacts in `docs/agents/reviews/`.
- Mirror both as GitHub issue comments when GitHub is configured.
- Keep reports short and link to PRs, commits, or generated artifacts.
