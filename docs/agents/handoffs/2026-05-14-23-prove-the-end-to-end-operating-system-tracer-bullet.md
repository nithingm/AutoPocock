# Context Handoff

## Issue

- Tracker: 23
- Title: Prove the end-to-end operating-system tracer bullet
- Labels: enhancement, ready-for-agent
- Execution stage: Ready for Handoff

## Goal

- Deliver one thin, demoable end-to-end path that proves AutoPocock can move from setup readiness through approved artifact generation, one provider-neutral execution contract, one Codex-backed isolated run, and one gated completion decision without collapsing into provider-specific workflow logic.

## Outcome

- The Solo Operator can run one bounded tracer bullet and inspect durable artifacts for Context, PRD, Issue DAG, Loop Spec, Provider Run, and Completion in the Artifact Layer.
- The tracer bullet proves the product center from parent issue `#22`: artifact-driven workflow, provider-pluggable execution, DAG-based planning, Ralph-loop execution, and approval gates at important boundaries.

## Boundaries

- In scope:
  - Define the smallest real vertical slice that exercises setup readiness, approved artifact flow, execution-contract generation, one isolated Codex-backed run path, and gated completion behavior.
  - Reuse the repo's existing GitHub-backed, artifact-led workflow where possible instead of inventing a second control plane.
  - Add or refine only the minimum code, docs, fixtures, and tests required to demonstrate the tracer bullet credibly.
  - Produce real durable artifacts for the slice, even if some are fixture-backed or generated through a no-op-safe execution path.
- Out of scope:
  - Full workflow-console UI work from issue `#32`.
  - Multi-provider support beyond the minimum Codex-backed tracer path.
  - Broad refactors of unrelated workflow commands.
  - High-concurrency scheduling, wave orchestration, or Docker isolation.
  - Tracker-model changes unrelated to proving this tracer bullet.
- Likely touched areas:
  - `scripts/ops.mjs`
  - `scripts/lib/`
  - `docs/agents/`
  - `docs/PRDs/`
  - `issues/`
  - `tests/`

## Acceptance Criteria

- The system can materialize one demo project path from setup through gated completion using durable artifacts at every step.
- The slice generates and preserves approved Context, PRD, Issue DAG, Loop Spec, Provider Run, and Completion artifacts.
- One Codex-backed run can execute inside the approved boundaries and return a durable completion result.
- Review and approval gates are explicit in the demonstrated path and block progression when not satisfied.
- The tracer bullet can be exercised without introducing provider-specific assumptions into the durable artifact model.

## Context

- Parent issue: `#22 Provider Agnostic AI Engineering Operating System`
- PRD: `docs/PRDs/2026-05-14-provider-agnostic-ai-engineering-operating-system.md`
- Issue decomposition: `issues/2026-05-14-provider-agnostic-ai-engineering-operating-system-issues.md`
- Workflow contract: `docs/agents/workflow.md`
- Handoff contract: `docs/agents/handoff.md`
- Domain terms:
  - Solo Operator
  - Agent Runtime
  - Workflow Artifact
  - Artifact Layer
  - Operational Tracker
  - Tracer Bullet
  - Context Handoff
  - Completion Report
  - Review Entry Gate
  - QA Gate
  - Isolation Mode
- ADRs: none referenced for this slice

## Dependencies

- Blockers: none declared on the tracker; this is the Feature Track tracer bullet.
- Related issues:
  - `#22` parent product brief
  - `#24`, `#25`, `#28` are likely follow-on deepening slices if this tracer bullet exposes gaps in setup, context, or workflow-core contracts.
- Conflict risks:
  - Medium conflict surface because this slice may touch shared workflow commands and docs.
  - Avoid widening into full Setup Plane, full Workflow Core, or full runtime-host implementation if a narrower proof path is sufficient.

## Implementation Guidance

- Prefer a narrow proof path over a broad architectural rollout. The purpose of this slice is to prove coherence, not to finish every downstream subsystem.
- Keep durable artifacts provider-neutral. Codex may be the first executor, but Context, PRD, Issue DAG, Loop Spec, Provider Run metadata, and Completion artifacts must not encode Codex-only workflow rules.
- Reuse the repo's existing Artifact Layer conventions and Guided Flow where possible.
- If a real Codex-backed execution path cannot be introduced safely within one bounded slice, stop and report `blocked: needs slicing` instead of silently downgrading the goal or expanding scope.
- Follow the repo's TDD contract when behavior can be tested through a public interface.

## Verification

- Automated:
  - Add or update tests that exercise the tracer-bullet flow through public workflow commands or deeper stable modules.
  - Cover artifact generation and gating behavior for Context, PRD, Issue DAG, Loop Spec, Provider Run, and Completion.
  - Cover at least one bounded Codex-backed launch-planning or fixture-backed execution path.
- Manual:
  - Run the documented tracer-bullet path and confirm the produced artifacts are inspectable in the repo.
  - Confirm review and approval gates block progression when required artifacts or approvals are missing.
  - Confirm the durable artifact model remains provider-neutral after the Codex-backed path is added.
- Evidence expected:
  - Commands run and results
  - Paths to generated artifacts
  - Test output summary
  - Clear statement of what was proved vs. what remains deferred
- TDD plan, when applicable:
  - Start with a failing test around the smallest public behavior that proves the tracer-bullet path.
  - Implement the minimum behavior to pass.
  - Refactor only where needed to keep workflow contracts clear and deterministic.

## Safe Failure Plan

- If the slice cannot keep one bounded handoff, one review pass, and one QA pass coherent, stop and report `blocked: needs slicing`.
- If a change would force Codex-specific rules into durable artifacts, stop and report the contract breach rather than merging the shortcut.
- If real provider execution requires credentials, environment control, or runtime complexity beyond the approved boundary, preserve artifact generation and launch-planning work, then report the remaining gap explicitly.
- Do not broaden into additional provider adapters, UI work, or unrelated cleanup to make the tracer bullet appear complete.
- Keep rollback simple: isolate new behavior behind the tracer-bullet flow, avoid destructive tracker mutations, and prefer additive artifacts and tests.

## Completion

- Report back:
  - Whether the tracer bullet is fully proven or blocked
  - Which acceptance criteria passed or failed
  - What exact artifact chain was produced
  - Any contract gaps exposed in setup, context, planning, execution, or review
- Artifacts to update:
  - Handoff Artifact: this file
  - Completion Report under `docs/agents/completions/`
  - Any new or updated tracer-bullet artifacts created by the flow
  - Workflow docs only if the tracer bullet changes the documented contract
- PR or commit expectation:
  - Keep the change set bounded to the tracer-bullet proof path and its tests
  - Summarize changed areas explicitly in the Completion Report
- Next suggested stage:
  - Human Review
