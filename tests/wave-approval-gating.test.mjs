import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyRalphRunAction,
  createRalphRunState,
} from "../scripts/lib/ralph-runner.mjs";

function makePlan() {
  return {
    schema_version: "ralph-run-plan/v1",
    plan_id: "plan-approval",
    control_policy: {
      approval_unit: "wave-bundle",
    },
    waves: [
      {
        wave_id: "wave-0",
        issues: [{ issue_id: "50", title: "Approve me", retry_budget: 2 }],
      },
    ],
  };
}

test("starting a wave issue requires an approved wave bundle by default", () => {
  const plan = makePlan();
  const state = createRalphRunState(plan);

  assert.throws(
    () =>
      applyRalphRunAction(plan, state, {
        kind: "start",
        issue_id: "50",
        actor: "runner-50",
      }),
    /wave-0 has not been approved/i,
  );
});

test("approve_wave unlocks start for issues inside that wave", () => {
  const plan = makePlan();
  let state = createRalphRunState(plan);
  state = applyRalphRunAction(plan, state, {
    kind: "approve_wave",
    wave_id: "wave-0",
    actor: "solo-operator",
    bundle_json_path: "docs/agents/approvals/plan-approval-wave-0.json",
    bundle_markdown_path: "docs/agents/approvals/plan-approval-wave-0.md",
  });

  state = applyRalphRunAction(plan, state, {
    kind: "start",
    issue_id: "50",
    actor: "runner-50",
  });

  assert.equal(state.issue_states["50"].status, "in_progress");
  assert.equal(state.wave_approvals["wave-0"].status, "approved");
});
