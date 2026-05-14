# GitHub backed operational workflow

## Problem

- The template has a strong local workflow model, but GitHub is not yet connected as the Operational Tracker.
- The Solo Operator needs dry-run-first GitHub bootstrap, queue export, feedback handling, memory proposals, and runner stubs before real AFK loops are safe.
- Without these contracts, the template cannot reliably move from local artifacts to GitHub-backed kanban and subagent handoff.

## User Value

- The Solo Operator can initialize, inspect, and evolve a GitHub-backed agentic workflow without hidden mutation.
- The scheduler can reason from exported GitHub state instead of hand-written queue files.
- AFK work remains bounded by handoff, review, QA, memory, and merge gates.

## Scope

- In scope: GitHub bootstrap dry-run/apply for labels and schema reporting.
- In scope: GitHub queue export shape for all non-`Done` project issues.
- In scope: artifact mirroring rules for issue/PR comments.
- In scope: feedback classification into Same-PR Fix proposals or bug issue drafts.
- In scope: memory proposal artifacts that do not directly edit durable memory.
- In scope: runner stub that validates claimed dispatch artifacts without invoking providers.
- Out of scope: automatic GitHub Project creation.
- Out of scope: direct Codex/Claude provider execution.
- Out of scope: Docker execution.
- Out of scope: automatic merge, memory writes, or secret handling.

## Acceptance Criteria

- [ ] `github:init` has a documented dry-run-first contract using the `gh` CLI.
- [ ] GitHub Project field schema is recorded in docs and config.
- [ ] Queue export rules are documented for all non-`Done` project issues.
- [ ] Artifact mirroring rules are documented for handoffs, HITL steps, completion reports, review prep, QA summaries, feedback, and memory proposals.
- [ ] `feedback` behavior is specified for Same-PR Fix proposals and new bug issues.
- [ ] `memory-propose` behavior is specified for context, ADR, workflow, and roadmap proposals.
- [ ] `run` stub behavior is specified for claimed dispatch validation without provider execution.
- [ ] The work is decomposed into tracer-bullet slices with HITL/AFK queue classes.

## Constraints

- Technical constraints: use local Node scripts and `gh` CLI first; avoid custom GitHub API clients for now.
- Product constraints: optimize for the Solo Operator first, future Agent Runtime second.
- Operational constraints: dry-run by default; `--apply` and dispatch behavior must be explicit.

## Risks

- Risk: GitHub Project APIs and permissions make early implementation brittle.
- Mitigation: report project schema first; delay project creation.
- Risk: queue export loses scheduler context if it exports only ready work.
- Mitigation: export all non-`Done` project issues.
- Risk: automation bypasses human authority.
- Mitigation: keep merge, memory, credential, same-PR fix, and final QA decisions with the Solo Operator.

## Open Questions

- What exact local snapshot format should `github:export` use for project fields that are missing or not configured yet?
- Should `feedback` create local bug issue drafts first, with GitHub creation behind `--apply`?
- Should `memory-propose --apply` exist later, or should memory application remain manual?

## Notes For Issue Decomposition

- Start with a tracer bullet for `github:init` dry-run because it validates `gh` detection, config, docs, and reporting without mutating GitHub.
- Then add queue export, artifact mirroring, feedback, memory proposals, and runner stub as separate slices.
- Keep all direct GitHub mutation behind `--apply`.
- Keep provider execution out of these slices.
