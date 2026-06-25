# Context Handoff

## Issue

- Tracker: 37
- Title: Add DAG quality scoring and execution-eligibility gating
- Labels: enhancement, ready-for-agent
- Execution stage: Ready for Handoff

## Goal

- Add a DAG quality pass that scores ambiguity, oversize risk, weak ownership boundaries, and execution readiness before nodes enter AFK orchestration.

## Outcome

- The planning layer can mark nodes execution-eligible or ineligible with explicit reasons, and later wave/Loop Spec work can consume that gating output directly.

## Boundaries

- In scope:
  - Add a DAG quality analysis module.
  - Define deterministic execution-eligibility outputs.
  - Add tests for broad, ambiguous, weakly-owned, and valid nodes.
- Out of scope:
  - GitHub sync
  - Loop Spec compilation
  - Actual wave launch
  - Console exposure
- Likely touched areas:
  - `scripts/lib/`
  - `tests/`
- Owned files/modules:
  - `scripts/lib/dag-quality.mjs`
  - `tests/dag-quality.test.mjs`

## Acceptance Criteria

- The planning system can score or classify nodes for ambiguity, oversize risk, weak ownership boundaries, and execution readiness.
- Nodes that are too broad or too ambiguous are marked ineligible for AFK execution through deterministic gating rules.
- Wave planning and later Loop Spec compilation can consume the graph's execution-eligibility output directly.

## Context

- Parent issue: `#34`
- Blocked by: `#36`
- PRD: `docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md`
- Related issues:
  - `#36` layered DAG compiler
  - `#40` Loop Spec compilation
  - `#41` tracer-bullet wave launch

## Dependencies

- Blockers:
  - `#36` layered DAG compiler
- Conflict risks:
  - Low-to-medium if kept in its own module.

## Implementation Guidance

- Keep the scoring and gating logic isolated from GitHub-specific or provider-specific behavior.
- Prefer explainable classifications over opaque numeric scoring if that keeps the model clearer for the Solo Operator.
- Do not widen into actual wave orchestration in this slice.

## Verification

- Automated:
  - Add tests for valid versus ineligible nodes.
  - Verify output is deterministic and machine-consumable.
- Manual:
  - Inspect one representative graph result with explicit eligibility reasons.
- Evidence expected:
  - Eligibility output examples
  - Test output summary

## Safe Failure Plan

- If the layered DAG compiler is not yet stable enough, stop at an analyzer that works against the emerging node contract and report the coupling explicitly.

## Completion

- Report back:
  - Final quality dimensions modeled
  - Any eligibility dimension intentionally deferred
- Artifacts to update:
  - This handoff if dimensions materially shift
- PR or commit expectation:
  - Keep the change set bounded to quality analysis and tests
- Next suggested stage:
  - Human Review
