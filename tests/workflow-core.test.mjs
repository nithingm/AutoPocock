import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildLoopSpec,
  providerRunLifecycle,
  reclaimDispatchArtifact,
  suggestedStageForResultStatus,
  validateClaimedDispatchForRun,
} from "../scripts/lib/workflow-core.mjs";

test("workflow core derives a provider-neutral Loop Spec from a dispatch and handoff", () => {
  const loopSpec = buildLoopSpec({
    dispatch: {
      dispatch_id: "dispatch-23",
      issue_id: "23",
      title: "Tracer bullet",
      handoff_artifact: "d:\\Projects\\AutoPocock\\docs\\agents\\handoffs\\2026-05-14-23.md",
      completion_report_target: "d:\\Projects\\AutoPocock\\docs\\agents\\completions\\dispatch-23.md",
      isolation_mode: "worktree",
      expected_branch: "agent/23-tracer-bullet",
      worktree_path: "d:\\Projects\\AutoPocock\\.worktrees\\23-tracer-bullet",
      source: "manual",
      created_from_scheduler_plan: "",
      forbidden_actions: ["merge PR", "handle secrets"],
      allowed_commands: ["run relevant tests"],
      claim: {
        claimed_by: "runner-23",
      },
    },
    handoffMarkdown: `# Context Handoff

## Goal

- Deliver one thin tracer bullet.

## Acceptance Criteria

- Persist a Loop Spec artifact.
- Render provider prompts from the Loop Spec.

## Boundaries

- In scope:
  - Runtime execution contract wiring.
  - Provider-neutral loop-spec artifact generation.
- Out of scope:
  - Multi-provider orchestration.
- Likely touched areas:
  - scripts/lib/workflow-core.mjs
  - scripts/lib/providers/

## Verification

- Automated:
  - node --test tests/workflow-core.test.mjs
- Manual:
  - Inspect the generated loop-spec artifact.
- Evidence expected:
  - Loop Spec path

## Completion

- Report back:
  - State whether the Loop Spec remained provider-neutral.
- Artifacts to update:
  - docs/agents/loop-specs/
`,
  });

  assert.equal(loopSpec.schema_version, "loop-spec/v1");
  assert.equal(loopSpec.goal, "Deliver one thin tracer bullet.");
  assert.deepEqual(loopSpec.acceptance_criteria, [
    "Persist a Loop Spec artifact.",
    "Render provider prompts from the Loop Spec.",
  ]);
  assert.deepEqual(loopSpec.owned_surface, [
    "scripts/lib/workflow-core.mjs",
    "scripts/lib/providers/",
  ]);
  assert.deepEqual(loopSpec.verification_plan.automated, [
    "node --test tests/workflow-core.test.mjs",
  ]);
  assert.deepEqual(loopSpec.boundaries.forbidden_actions, ["merge PR", "handle secrets"]);
  assert.equal(loopSpec.execution_contract.isolation_mode, "worktree");
});

test("workflow core owns lifecycle and stage progression rules", () => {
  assert.equal(providerRunLifecycle("running"), "active");
  assert.equal(providerRunLifecycle("succeeded"), "completed");
  assert.equal(providerRunLifecycle("blocked"), "blocked");
  assert.equal(suggestedStageForResultStatus("needs human review"), "Human Review");
  assert.equal(suggestedStageForResultStatus("blocked"), "Ready for Handoff");
  assert.equal(suggestedStageForResultStatus("cancelled"), "Ready for Handoff");
});

test("workflow core owns reclaim and runnable-dispatch validation rules", () => {
  const claimedArtifact = {
    dispatch_id: "dispatch-23",
    status: "claimed",
    isolation_mode: "worktree",
    worktree_path: "d:\\Projects\\AutoPocock\\.worktrees\\23-tracer-bullet",
    forbidden_actions: ["merge PR"],
    claim: {
      claimed_by: "runner-23",
      claimed_at: "2026-05-14T00:00:00.000Z",
      isolation_mode: "worktree",
    },
  };

  assert.deepEqual(validateClaimedDispatchForRun(claimedArtifact), []);

  const reclaimed = reclaimDispatchArtifact(claimedArtifact, {
    claimed_by: "runner-23",
    reclaimed_by: "solo-operator",
    reclaimed_at: "2026-05-14T01:00:00.000Z",
    reclaim_reason: "Runner abandoned work",
  });

  assert.equal(reclaimed.status, "queued");
  assert.equal(reclaimed.claim, null);
  assert.equal(reclaimed.claim_history.length, 1);
  assert.equal(reclaimed.claim_history[0].reclaimed_by, "solo-operator");
});
