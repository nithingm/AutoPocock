# Agentic Repo Template Operating System

## Problem Statement

The Solo Operator wants a reusable agentic engineering operating system that can be dropped into real software projects, but the current template is still mostly a local scaffold. It has useful Workflow Artifacts, an Umbrella CLI, scheduler and dispatch stubs, and clear domain language, but it does not yet connect the Operational Tracker, GitHub-backed queue export, feedback loop, memory proposal workflow, or runner contract into a coherent end-to-end loop.

Without this system, AFK execution would either be too manual to scale or too autonomous to trust. The Solo Operator needs a workflow where human judgment owns product intent, review, QA, credentials, memory, and merge authority, while subagents receive narrow Context Handoffs and produce auditable Completion Reports.

## Solution

Build the template into a dry-run-first, GitHub-backed operating system for Solo Operators. The system should use GitHub as the Operational Tracker, keep repo markdown as the Artifact Layer, use Matt Pocock triage roles as labels, and use project fields for Execution Stages, Execution Lanes, Queue Class, Risk, Dependency, Conflict Surface, Feature Track, and Dispatch ID.

The first production-quality loop should let the Solo Operator initialize GitHub tracker readiness, export non-Done project issues into a local scheduler queue, generate Scheduler Plans, create Dispatch Artifacts, let future runners claim those artifacts, generate Review Prep and Targeted QA, process feedback into Same-PR Fix proposals or bug issues, and propose Durable Memory changes without applying them directly.

## User Stories

1. As a Solo Operator, I want one Umbrella CLI entrypoint, so that I can run the Guided Flow without learning every internal folder.
2. As a Solo Operator, I want Manual Mode commands to remain available, so that I can edit or generate individual Workflow Artifacts directly.
3. As a Solo Operator, I want GitHub to be the default Operational Tracker, so that issue state, ownership, prioritization, and workflow movement live in the same place as code review.
4. As a Solo Operator, I want repo markdown to remain the Artifact Layer, so that PRDs, handoffs, QA notes, and workflow decisions are durable and reviewable.
5. As a Solo Operator, I want Tracker Bootstrap to run dry by default, so that GitHub setup can be inspected before anything mutates.
6. As a Solo Operator, I want Tracker Bootstrap to use the `gh` CLI, so that GitHub integration is inspectable and avoids custom token handling.
7. As a Solo Operator, I want missing labels to be created only with an explicit apply flag, so that setup remains safe by default.
8. As a Solo Operator, I want Tracker Drift to be reported instead of automatically fixed, so that existing GitHub state is not silently renamed or deleted.
9. As a Solo Operator, I want GitHub Project creation deferred, so that permission-sensitive project setup does not make the first bootstrap brittle.
10. As a Solo Operator, I want the required GitHub Project field schema documented, so that the board can be configured consistently.
11. As a Solo Operator, I want all non-Done project issues exported into the scheduler queue, so that HITL blockers, Bug Loop work, skipped issues, and ready work are visible together.
12. As a Solo Operator, I want the scheduler queue to be a snapshot rather than source of truth, so that GitHub remains canonical.
13. As a Solo Operator, I want Scheduler Plans saved as artifacts, so that dispatch decisions and skip reasons are auditable.
14. As a Solo Operator, I want the scheduler to respect Review Capacity, so that AFK completions do not exceed what I can review.
15. As a Solo Operator, I want Bug Loop work to consume capacity before new AFK work, so that defects do not pile up behind new feature work.
16. As a Solo Operator, I want Conflict Surface to be manually declared first, so that the scheduler does not pretend it can perfectly infer merge risk.
17. As a Solo Operator, I want Tracer Bullets to gate routine AFK work per Feature Track, so that each feature proves its workflow before parallelizing.
18. As a Solo Operator, I want HITL blockers to be dependency-scoped, so that unrelated AFK slices can proceed when safe.
19. As a Solo Operator, I want dispatch to create Dispatch Artifacts before calling any provider, so that the system remains auditable and provider-agnostic.
20. As a future Agent Runtime, I want Dispatch Artifacts in canonical JSON, so that a runner can consume work without parsing prose.
21. As a Solo Operator, I want Dispatch Artifacts mirrored in markdown, so that I can inspect what a runner is about to do.
22. As a future runner, I want to claim queued Dispatch Artifacts, so that work is not started without identity, timestamp, and Isolation Mode.
23. As a Solo Operator, I want stale Dispatch Claims to require approval or future timeout policy, so that abandoned work is not silently restarted.
24. As a Solo Operator, I want Manual Dispatch to be audited, so that expert overrides are visible and cannot bypass gates.
25. As a Solo Operator, I want branch-only isolation to be acceptable for the current stub, so that early workflow development is not blocked.
26. As a Solo Operator, I want worktree-first isolation once the scheduler exists, so that parallel work has safer local boundaries.
27. As a Solo Operator, I want Docker isolation before high-concurrency execution, so that dependency and workspace damage is contained.
28. As a Subagent, I want a compact Context Handoff, so that I can work from explicit issue, context, dependency, verification, and completion expectations.
29. As a Solo Operator, I want Handoff Artifacts mirrored to GitHub comments, so that execution context is visible from the Operational Tracker.
30. As a Subagent, I want to produce a Completion Report, so that result, changes, verification, risks, follow-ups, and artifacts are explicit.
31. As a Solo Operator, I want Review Prep generated when work enters Human Review, so that review starts from a structured summary rather than raw diffs.
32. As a Solo Operator, I want Review Prep to remain non-authoritative, so that automated review support does not become automated approval.
33. As a Solo Operator, I want QA to happen after Human Review, so that code review does not replace product verification.
34. As a Solo Operator, I want Targeted QA for GitHub-backed AFK work, so that QA uses issue, PR, handoff, completion, review, and acceptance context.
35. As a Solo Operator, I want Targeted QA to fail when required context is missing, so that weak checklists do not pass as real verification.
36. As a Solo Operator, I want generic QA to remain available in Manual Mode, so that local untracked work can still be reviewed.
37. As a Solo Operator, I want QA defects classified as Same-PR Fix proposals or new bug issues, so that scope does not silently expand.
38. As a Solo Operator, I want to approve Same-PR Fix classification, so that scope decisions remain human-owned.
39. As a Solo Operator, I want subagents to propose Durable Memory updates without applying them, so that future agent behavior does not drift without approval.
40. As a Solo Operator, I want memory proposals to include rationale, target files, suggested text, and risk, so that they are reviewable.
41. As a Solo Operator, I want Credential Boundary tasks to stay HITL, so that secrets and privileged external accounts remain human-owned.
42. As a Solo Operator, I want Prepared Human Steps for credential or external-account work, so that human-only effort is minimized and exact.
43. As a Solo Operator, I want AFK work to allow only necessary Local Refactors, so that review stays bounded to the slice.
44. As a Solo Operator, I want Dependency Changes to require explicit scope or HITL approval, so that implementation work does not smuggle in broader risk.
45. As a Solo Operator, I want subagents to prepare PRs but not merge them, so that Merge Authority remains human-owned.
46. As a Solo Operator, I want failed AFK PRs to get at most one automated Fix Attempt, so that retry loops do not hide real uncertainty.
47. As a Solo Operator, I want issue slices to pass the Slice Size Gate, so that each item fits in one Context Handoff and one review session.
48. As a Solo Operator, I want oversized work to return to Ready to Slice, so that subagents stop instead of continuing through unclear scope.
49. As a Solo Operator, I want artifact mirroring to be selective, so that GitHub comments stay decision-useful rather than noisy.
50. As a Solo Operator, I want the roadmap to track future plans, so that decisions made during design are not lost.

## Implementation Decisions

- Build around the existing Umbrella CLI and keep low-level Manual Mode commands as stable building blocks.
- Keep GitHub as the default Operational Tracker and repo markdown as the Artifact Layer.
- Use Matt Pocock triage roles as labels, not board stages.
- Use GitHub Project fields for Execution Stage, Execution Lane, Queue Class, Risk, Dependency, Conflict Surface, Feature Track, and Dispatch ID.
- Start GitHub integration with the `gh` CLI instead of a custom API client.
- Make GitHub bootstrap dry-run by default, with mutation only behind explicit apply flags.
- Delay automatic GitHub Project creation until labels, schema reporting, and queue export are proven.
- Export all non-Done project issues into the scheduler queue so the scheduler can explain skip reasons and surface HITL work.
- Keep the scheduler as a dry-run planner before it mutates tracker state or creates dispatch work.
- Store Scheduler Plans in the Artifact Layer by default.
- Make Dispatch Artifacts provider-agnostic and artifact-only first.
- Store Dispatch Artifacts as canonical JSON plus readable markdown mirrors.
- Require runners to claim Dispatch Artifacts before execution.
- Treat branch isolation as acceptable for the current stub, worktree-first as the scheduler-era default, and Docker as required before high-concurrency execution.
- Generate Review Prep only after the Review Entry Gate passes.
- Treat Targeted QA as strict for AFK workflow and permissive only in Manual Mode.
- Keep Same-PR Fix approval, Durable Memory updates, Credential Boundary work, QA sign-off, and Merge Authority with the Solo Operator.
- Add new commands as vertical slices: Tracker Bootstrap, queue export, artifact mirroring, feedback classification, memory proposal, and runner stub.

## Testing Decisions

- Test command behavior through externally observable CLI output, generated artifacts, exit codes, and filesystem changes.
- Do not test private implementation details inside scripts unless the scripts are later refactored into deeper modules with stable interfaces.
- The first deeper module opportunity is a scheduler policy module that takes queue items and config, then returns dispatch/skip decisions.
- The second deeper module opportunity is a GitHub bootstrap reporter that turns tracker/config state into a dry-run report.
- The third deeper module opportunity is an artifact writer that consistently creates JSON and markdown pairs.
- The initial tests can be smoke-style Node syntax checks plus command runs against fixture files.
- Once behavior grows, add focused tests for scheduler decisions, strict Targeted QA artifact lookup, dispatch claim state transitions, and feedback classification.
- Tests should use local fixtures for queue snapshots and dispatch artifacts rather than real GitHub calls.
- GitHub integration should be tested first through dry-run behavior and missing-tool/auth scenarios.
- Any command that supports mutation should be testable in dry-run mode without network access.

## Out of Scope

- Automatic GitHub Project creation in the first GitHub bootstrap slice.
- Direct Codex, Claude Code, or other provider execution from the core CLI.
- Docker execution before worktree-first runner behavior exists.
- Automatic merge.
- Automatic Durable Memory edits.
- Handling or storing secrets.
- Silent retry loops beyond one automated Fix Attempt.
- Automatically renaming, deleting, or reshaping existing GitHub tracker objects.
- Treating `.ai/queue.json` as source of truth.
- Inferring Conflict Surface as an authoritative scheduler input in the first version.

## Further Notes

The current repo already contains much of the local Artifact Layer and early command surface. The next Feature Track should use this PRD as the parent and start with a Tracer Bullet for dry-run `github:init`, because it validates the `gh` path, configuration, board schema reporting, and no-hidden-mutation behavior without depending on GitHub Project mutation or provider execution.

The earlier implementation brief remains useful as a technical planning artifact, but this PRD should become the more canonical product-oriented source for issue slicing.
