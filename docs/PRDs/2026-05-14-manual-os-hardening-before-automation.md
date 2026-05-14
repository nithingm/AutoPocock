# Manual OS Hardening Before Automation

## Problem Statement

The Solo Operator can exercise most of the manual operating system, but the workflow still depends on guesswork at several critical points. Generated artifacts do not always lead cleanly into the next command, some templates are too easy to leave incomplete, and several failure modes require repo-specific knowledge to recover from. That makes the Guided Flow brittle for a fresh operator and prevents the manual operating system from being a trustworthy foundation for later Agent Runtime automation.

## Solution

Strengthen the manual operating system until a fresh Solo Operator can run the full GitHub-backed workflow without guessing file paths, missing labels, project configuration, or required artifact content. The system should provide one canonical walkthrough, generate artifacts that chain cleanly into later steps, surface actionable recovery guidance when validation fails, and prove the end-to-end path through a smoke test before any runner automation work begins.

## User Stories

1. As a Solo Operator, I want one canonical walkthrough for the full manual loop, so that I can run the workflow from initialization through QA without relying on tribal knowledge.
2. As a Solo Operator, I want every workflow step to state its prerequisites, so that I can tell whether the command is safe to run before I invoke it.
3. As a Solo Operator, I want every workflow step to show the exact command to run next, so that generated artifacts naturally chain into the next stage.
4. As a Solo Operator, I want generated artifact paths to be reusable without manual lookup, so that I do not have to inspect directories between commands.
5. As a Solo Operator, I want `review-prep` to resolve the latest relevant Completion Report from an issue reference when possible, so that review entry does not depend on hand-copied file paths.
6. As a Solo Operator, I want dispatch-oriented commands to support issue-based or latest-artifact resolution where safe, so that claim and run flows remain usable in Manual Mode.
7. As a Solo Operator, I want Completion Report templates to make required fields visually explicit, so that I do not accidentally leave review-critical sections blank.
8. As a Solo Operator, I want downstream parsing to remain reliable even after template improvements, so that stronger UX does not weaken the Review Entry Gate.
9. As a Solo Operator, I want missing `gh` guidance to explain both the immediate shell fix and the permanent environment fix, so that I can recover quickly and stop repeating setup work.
10. As a Solo Operator, I want missing `ready-for-agent` failures to distinguish between a missing repo label and a missing issue label, so that I can correct the true tracker problem on the first attempt.
11. As a Solo Operator, I want missing GitHub project configuration errors to name the accepted config fields directly, so that I know exactly how to satisfy the requirement.
12. As a Solo Operator, I want queue, dispatch, and completion file errors to suggest the command that generates or locates the missing artifact, so that recovery stays inside the Guided Flow.
13. As a Solo Operator, I want GitHub export to handle real `gh project item-list` shapes, so that queue export does not silently lose scheduler-critical fields.
14. As a Solo Operator, I want regression tests for each discovered GitHub project item shape, so that export compatibility does not regress as the workflow evolves.
15. As a Solo Operator, I want the remaining manual commands validated in real repo state, so that the documented workflow reflects actual behavior rather than fixture-only assumptions.
16. As a Solo Operator, I want `board`, `mirror`, `memory-propose`, `hitl`, `dispatch`, and `github:init -- --apply` documented with their readiness level, so that I know which parts of the manual operating system are production-ready and which are still rough.
17. As a Solo Operator, I want the intended split between repo-local skills, reusable prompts, and user-facing prompt wrappers to be documented, so that the workflow surface is understandable to future maintainers.
18. As a Solo Operator, I want the TDD contract placement to be intentional and documented, so that implementation guidance is discoverable in the right layer.
19. As a Solo Operator, I want the README to explain GitHub setup requirements, required project fields, artifact chaining, and slice completion, so that onboarding does not depend on prior conversations.
20. As a Solo Operator, I want a manual acceptance checklist, so that the team can declare the manual operating system complete with objective criteria.
21. As a Solo Operator, I want one end-to-end smoke test that chains generated artifacts together, so that the manual loop is protected before provider execution is automated.
22. As a future Agent Runtime integrator, I want the manual operating system to be stable first, so that later automation builds on proven workflow contracts instead of compensating for manual UX gaps.

## Implementation Decisions

- Treat this work as hardening the current manual operating system, not expanding into runner automation.
- Preserve GitHub as the Operational Tracker and repo markdown as the Artifact Layer.
- Keep the Umbrella CLI as the primary Guided Flow while improving Manual Mode ergonomics where artifact chaining currently requires guesswork.
- Add one canonical walkthrough artifact for the full happy path:
  `init` -> `github:init` -> `prd` -> `issues` -> `handoff` -> `complete` -> `review-prep` -> `github:export` -> `schedule --dispatch` -> `claim` -> `run --prepare-worktree` -> `qa` -> `feedback`.
- For each walkthrough step, document prerequisites, exact command, expected output or Workflow Artifact, common failure modes, and exact next command.
- Use real repo-state validation, not only fixtures, to audit the workflow and record every point where the Solo Operator had to infer file paths, issue numbers, labels, project configuration, or required artifact content.
- Prefer safe artifact auto-discovery when the user provides an issue reference and there is one unambiguous latest artifact of the required type.
- When safe auto-discovery is not possible, commands should print explicit next-step guidance that includes the generated artifact path and a ready-to-run follow-up command.
- Harden Completion Report templates so required sections are obvious to the Solo Operator before Review Prep validation fails.
- Keep the Review Entry Gate strict; improve the guidance, not the enforcement standard.
- Extend GitHub export compatibility to real flattened `gh project item-list` output and preserve label, stage, lane, risk, dependency, conflict surface, queue class, and feature-track data even when GitHub returns empty or top-level fields.
- Add regression coverage for every real GitHub export shape discovered during manual validation.
- Manually validate remaining commands that have fixture coverage or partial docs but have not yet been exercised in a real workflow.
- Classify each validated manual command as ready for normal use or still rough, and publish that status in the docs.
- Clarify the product shape between `skills/engineering`, `.ai/prompts`, and `prompts`, including whether TDD remains a doc-only contract or becomes a repo-local skill.
- Define a hard manual acceptance checklist before any provider-specific runner automation is allowed.
- Add an end-to-end smoke test that chains generated artifacts together locally and uses GitHub fixtures wherever live GitHub access is unnecessary.

## Testing Decisions

- A good test should verify external workflow behavior: generated artifacts, CLI output, exit codes, recovery guidance, and artifact chaining. It should not lock onto internal implementation details or private helper structure.
- Test modules around the Umbrella CLI workflow, especially artifact discovery, review-prep resolution, dispatch lookup, GitHub export normalization, and generated template parsing.
- Preserve integration-style CLI tests as the primary test shape because this repo’s value is in Workflow Artifact generation and command contracts.
- Add one end-to-end smoke test for the canonical manual path that runs locally with fixtures where possible and uses real command chaining semantics.
- Keep network dependence out of default tests except where manual validation explicitly documents live GitHub behavior.
- Use existing CLI-oriented prior art in the codebase, especially the `ops-cli`, `ops-workflow-extensions`, `qa-cli`, and GitHub export tests, as the model for new coverage.

## Out of Scope

- Provider execution from `run`
- Multi-agent orchestration
- Docker-based Isolation Mode
- Autonomous backlog processing
- Automatic commit, PR merge, or memory writes
- Broad changes to the tracker model beyond what is necessary to make the manual operating system predictable and testable

## Further Notes

- This PRD should decompose into bounded slices in the following order:
  canonical walkthrough, happy-path audit, CLI artifact-resolution fixes, template hardening, actionable error guidance, GitHub export shape coverage, remaining command validation, docs cleanup, skills/prompts clarification, manual acceptance checklist, end-to-end smoke test.
- The acceptance standard for this PRD is that a fresh Solo Operator can complete the full manual GitHub-backed loop without guessing paths or editing generated artifacts blindly.
