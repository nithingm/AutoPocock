# Context Handoff

## Issue

- Tracker: 42
- Title: Make execution, review, QA, reclaim, and bug-loop outcomes mutate graph progression
- Labels: enhancement, ready-for-agent
- Execution stage: Ready for Handoff

## Goal

- Make the layered DAG the live progression model by having execution and validation outcomes mutate graph state directly instead of leaving progression spread across ad hoc metadata.

## Outcome

- The repo has a graph progression module that applies execution, review, QA, reclaim, and bug-loop outcomes across multiple graph layers and re-computes dependent eligibility deterministically.

## Boundaries

- In scope:
  - Add a dedicated graph progression module.
  - Mutate node state from execution/review/QA/reclaim/bug-loop outcomes.
  - Recompute dependent unlocking and re-blocking from graph rules.
  - Add focused tests for progression and follow-up consequences.
- Out of scope:
  - Workflow-console exposure.
  - Full CLI rewiring across all existing commands.
  - Provider-launch behavior.
- Likely touched areas:
  - `scripts/lib/`
  - `tests/`
- Owned files/modules:
  - `scripts/lib/graph-progression.mjs`
  - `tests/graph-progression.test.mjs`

## Acceptance Criteria

- Execution and validation outcomes can move graph nodes through deterministic progression states across multiple layers.
- Review rejection, QA failure, reclaim, and bug-loop outcomes re-block or reopen dependent work through graph rules instead of ad hoc metadata updates.
- Follow-up consequences from failed work become first-class graph state transitions rather than side artifacts only.

## Context

- Parent issue: `#34`
- Blocked by: `#40`, `#41`
- PRD: `docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md`
- Related current behavior:
  - `scripts/lib/review-plane.mjs`
  - `scripts/lib/workflow-core.mjs`

## Dependencies

- Blockers:
  - `#40`
  - `#41`
- Related issues:
  - `#43` console exposure
- Conflict risks:
  - Medium, because this slice overlaps conceptually with existing review-plane progression logic.

## Implementation Guidance

- Do not rip through every existing command surface. Prefer a new graph progression module that can be integrated incrementally.
- Preserve the current explicit approval model; this slice is about graph truth, not approval removal.
- Keep follow-up bug consequences as graph state first, artifact side effects second.

## Verification

- Automated:
  - Add tests for execution success, review rejection, QA failure, reclaim, and bug-loop progression.
  - Add tests for dependent unlocking and re-blocking across multiple graph layers.
- Manual:
  - Inspect one progression trace from initial runnable state through failure and reopen.
- Evidence expected:
  - Progression trace examples
  - Test output summary

## Safe Failure Plan

- If integrating with existing review-plane code would widen the slice too much, keep the new module additive and report the remaining adoption gap explicitly.

## Completion

- Report back:
  - Which progression transitions are now graph-native
  - Which legacy progression paths remain outside the graph
- Artifacts to update:
  - This handoff if graph-state semantics materially shift
- PR or commit expectation:
  - Keep the change set bounded to graph progression module plus tests
- Next suggested stage:
  - Human Review
