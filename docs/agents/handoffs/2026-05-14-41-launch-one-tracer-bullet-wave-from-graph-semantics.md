# Context Handoff

## Issue

- Tracker: 41
- Title: Launch one tracer-bullet wave from graph semantics
- Labels: enhancement, ready-for-agent
- Execution stage: Ready for Handoff

## Goal

- Prove one real tracer-bullet-first execution wave can be selected from graph semantics so orchestration follows the layered DAG instead of manual issue picking.

## Outcome

- The repo has a graph-driven orchestration module that can select a tracer-bullet-first wave from a quality-gated DAG, respect dependency and tracker constraints, and compile one bounded Ralph-loop launch plan from graph-derived Loop Specs.

## Boundaries

- In scope:
  - Add a dedicated graph-wave orchestration module.
  - Select tracer-bullet-first runnable waves from layered graph semantics.
  - Consume quality gating, reconciliation state, and graph-compiled Loop Specs to build one launch plan.
  - Add focused tests for wave selection and bounded launch planning.
- Out of scope:
  - Mutating graph progression after execution.
  - Workflow-console exposure.
  - Broad command-surface integration in `ops.mjs`.
- Likely touched areas:
  - `scripts/lib/`
  - `tests/`
- Owned files/modules:
  - `scripts/lib/dag-wave-orchestrator.mjs`
  - `tests/dag-wave-orchestrator.test.mjs`

## Acceptance Criteria

- The system can select a tracer-bullet-first wave from graph semantics rather than manual issue picking.
- The selected wave respects execution eligibility, dependency order, tracer-bullet policy, and synchronized tracker state.
- At least one bounded Ralph loop launch path is driven from the graph-compiled execution plan end to end.

## Context

- Parent issue: `#34`
- Blocked by: `#37`, `#39`, `#40`
- PRD: `docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md`
- Related delivered slices:
  - `#37` DAG quality scoring
  - `#39` DAG-to-GitHub reconciliation
  - `#40` graph-to-Loop-Spec compilation

## Dependencies

- Blockers:
  - `#37`
  - `#39`
  - `#40`
- Related issues:
  - `#42` graph progression mutation
  - `#43` console exposure
- Conflict risks:
  - Medium, because this slice composes outputs from several new modules.

## Implementation Guidance

- Keep the orchestration surface as a deep planning module, not a CLI-heavy command wrapper.
- Prefer returning a deterministic launch plan object over directly invoking providers here.
- Treat tracker sync state as an input to orchestration, not something this slice mutates.

## Verification

- Automated:
  - Add tests for tracer-bullet-first wave selection.
  - Add tests that reject ineligible or dependency-blocked nodes from the launch plan.
  - Add tests that show one bounded Ralph-loop launch path compiled from graph semantics.
- Manual:
  - Inspect one launch plan object for readability and boundedness.
- Evidence expected:
  - Launch-plan examples
  - Test output summary

## Safe Failure Plan

- If the orchestration path starts requiring broad CLI rewiring, stop at a reusable module boundary and report the integration gap explicitly.
- If reconciliation or Loop Spec assumptions are still unstable, keep adapters narrow and report exact contract mismatches.

## Completion

- Report back:
  - How the tracer-bullet wave is selected
  - What execution constraints are enforced before launch
- Artifacts to update:
  - This handoff if orchestration scope shifts materially
- PR or commit expectation:
  - Keep the change set bounded to orchestration module plus tests
- Next suggested stage:
  - Human Review
