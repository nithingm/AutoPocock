# Context Handoff

## Issue

- Tracker: 43
- Title: Expose graph quality, sync preview, and wave controls in the workflow console
- Labels: enhancement, ready-for-agent
- Execution stage: Ready for Handoff

## Goal

- Expose the new graph authority inside the workflow console so the Solo Operator can inspect layered graph quality, preview GitHub sync, inspect tracer-bullet waves, and operate graph-driven execution without losing artifact transparency.

## Outcome

- The workflow console surfaces graph quality signals, GitHub sync preview data, wave launch planning, and graph progression controls over the authoritative DAG instead of acting like a generic dashboard.

## Boundaries

- In scope:
  - Extend the workflow console state loader and UI surface.
  - Add graph quality, sync preview, and wave-control views or panels.
  - Keep direct artifact inspection/editing intact.
  - Add focused console tests for the new state and surface.
- Out of scope:
  - Building new orchestration logic.
  - Rewriting the CLI around the console.
  - Hiding artifact paths or making the UI the only source of truth.
- Likely touched areas:
  - `scripts/lib/workflow-console.mjs`
  - `tests/workflow-console.test.mjs`
- Owned files/modules:
  - `scripts/lib/workflow-console.mjs`
  - `tests/workflow-console.test.mjs`

## Acceptance Criteria

- The workflow console exposes layered graph quality and execution-eligibility signals directly from the authoritative DAG.
- The console can preview DAG-to-GitHub sync and wave launch decisions before mutation or execution.
- The console exposes graph-driven execution and progression controls without becoming the only source of truth.

## Context

- Parent issue: `#34`
- Blocked by: `#37`, `#39`, `#41`, `#42`
- PRD: `docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md`
- Existing console surface:
  - `scripts/lib/workflow-console.mjs`
  - `tests/workflow-console.test.mjs`

## Dependencies

- Blockers:
  - `#37`
  - `#39`
  - `#41`
  - `#42`
- Conflict risks:
  - Medium, because this slice depends on multiple new module outputs being present.

## Implementation Guidance

- Keep the console artifact-first. Show paths and underlying data instead of abstracting it away.
- Prefer additive UI panels over a broad redesign.
- Keep state loading resilient when some new graph modules are present and others are not yet integrated.

## Verification

- Automated:
  - Add tests for new console state loading and HTML output.
  - Verify graph quality and sync preview data are surfaced.
  - Verify wave/progression controls appear without breaking existing console behavior.
- Manual:
  - Inspect the console over HTTP and confirm the new graph panels are readable.
- Evidence expected:
  - New console sections or controls
  - Test output summary

## Safe Failure Plan

- If the console would need to own orchestration itself to satisfy the slice, stop and preserve the console as a view/control layer only.
- If downstream modules are still in flux, expose the most stable read-only previews first and report any control gaps explicitly.

## Completion

- Report back:
  - What graph-native signals are now visible in the console
  - Any control surface intentionally deferred
- Artifacts to update:
  - Workflow docs only if the console surface changes materially
- PR or commit expectation:
  - Keep the change set bounded to workflow console module plus tests
- Next suggested stage:
  - Human Review
