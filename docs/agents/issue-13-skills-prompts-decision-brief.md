# Issue 13 Decision Brief: Skills And Prompts Product Shape

## Decision Needed

Decide the intended split between:

- `skills/engineering`
- `.ai/prompts`
- `prompts`

Also decide whether the TDD contract should remain a doc-only contract or become a repo-local skill.

## Current Repo State

- `skills/engineering/` currently contains two repo-local skills:
  - `agentic-ops`
  - `subagent-handoff`
- `.ai/prompts/` contains reusable operating prompts for workflow tasks:
  - `bugfix.md`
  - `grill-me.md`
  - `prd-to-issues.md`
  - `qa-plan.md`
  - `write-prd.md`
- `prompts/` currently contains only `README.md`, which describes that directory as prompt wrappers intended for direct human or script invocation.
- TDD currently lives in `docs/agents/tdd.md` and is referenced from `docs/agents/workflow.md` and `skills/engineering/agentic-ops/SKILL.md`.

## Observations

- The current structure is internally consistent, but only partially documented.
- `skills/engineering/` is being used for reusable agent behavior, not for every workflow rule.
- `.ai/prompts/` is being used for reusable prompt content rather than first-class skills.
- `prompts/` is a thin wrapper layer today, not a substantive content layer.
- TDD is currently a workflow contract and execution discipline, not a reusable agent capability bundle.

## Options

### Option A: Keep TDD As A Doc-Only Contract

- `skills/engineering/`: reusable agent behaviors and workflows
- `.ai/prompts/`: reusable operating prompts
- `prompts/`: human-facing wrappers and entrypoints
- `docs/agents/tdd.md`: authoritative TDD contract

Pros:

- Matches the repo as it exists today
- Avoids inventing a repo-local skill just for discoverability
- Keeps TDD framed as a cross-cutting execution rule rather than a command surface

Cons:

- TDD is less visible than a first-class repo-local skill
- Future maintainers may expect all repeatable agent behavior to live under `skills/engineering/`

### Option B: Promote TDD To A Repo-Local Skill

- Add `skills/engineering/tdd/SKILL.md`
- Keep `docs/agents/tdd.md` as the detailed contract behind that skill

Pros:

- Makes TDD more discoverable as an explicit agent workflow
- Aligns better with environments that surface repo-local skills directly

Cons:

- Adds a new skill layer without changing the underlying repo behavior
- Risks duplicating or drifting from `docs/agents/tdd.md`
- Suggests TDD is a distinct workflow product surface rather than a discipline used within other slices

## Recommendation

Choose **Option A** for now:

- Keep TDD as a doc-only workflow contract in `docs/agents/tdd.md`
- Keep `skills/engineering/` for reusable agent workflows
- Keep `.ai/prompts/` for reusable prompt content
- Keep `prompts/` for direct invocation wrappers

Reasoning:

- This matches the repo’s current implementation and avoids speculative structure changes.
- The current problem is documentation clarity, not a missing TDD runtime capability.
- If future usage shows repeated direct invocation of TDD behavior, a repo-local `tdd` skill can be added later as a thin wrapper over the existing contract.

## If Approved

- Document this split explicitly in README and workflow documentation during the docs consolidation slice.
- Reference `docs/agents/tdd.md` as the canonical TDD source of truth.
- Do not add a repo-local `tdd` skill in the current manual-OS hardening phase.

## If Rejected

- Create a follow-up issue to add `skills/engineering/tdd/SKILL.md`
- Define the non-duplicative relationship between that skill and `docs/agents/tdd.md`
- Update docs so the new skill becomes the discoverability layer and the doc remains the contract layer
