import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyRalphRunAction,
  buildRalphRunSnapshot,
  createRalphRunState,
  validateRalphRunPlan,
} from "../scripts/lib/ralph-runner.mjs";

function makePlan() {
  return {
    schema_version: "ralph-run-plan/v1",
    plan_id: "plan-44",
    parent_issue: "44",
    control_policy: {
      shared_foundation_triggers: [
        "shared schema instability",
        "unstable shared contracts",
        "broken global build or runtime environment",
        "architecture contradiction",
        "missed broad write-surface overlap",
        "incorrect accepted dependency structure",
      ],
    },
    waves: [
      {
        wave_id: "wave-0",
        issues: [
          {
            issue_id: "45",
            title: "Validation gate",
            worker_mode: "single",
            retry_budget: 3,
            verification_shape: ["node --test tests/validator.test.mjs"],
          },
        ],
        rationale: "Hard gate first.",
      },
      {
        wave_id: "wave-1",
        parallel: true,
        issues: [
          {
            issue_id: "46",
            title: "Regeneration sidecar",
            worker_mode: "parallel-worker-a",
            retry_budget: 3,
            verification_shape: ["node --test tests/regen.test.mjs"],
          },
          {
            issue_id: "48",
            title: "Wave planner",
            worker_mode: "parallel-worker-b",
            retry_budget: 3,
            verification_shape: ["node --test tests/wave.test.mjs"],
          },
        ],
        rationale: "Parallel sidecar wave.",
        branch_local_pause_on: ["Canonical node fields drift underneath scheduling."],
      },
    ],
  };
}

test("validateRalphRunPlan rejects duplicate issues", () => {
  const plan = makePlan();
  plan.waves[1].issues[1].issue_id = "46";

  const errors = validateRalphRunPlan(plan);

  assert.match(errors.join("\n"), /Issue 46 appears multiple times/);
});

test("buildRalphRunSnapshot exposes the first incomplete wave", () => {
  const plan = makePlan();
  const state = createRalphRunState(plan);

  const snapshot = buildRalphRunSnapshot(plan, state);

  assert.equal(snapshot.current_wave.wave_id, "wave-0");
  assert.deepEqual(snapshot.runnable.map((issue) => issue.issue_id), ["45"]);
});

test("completing a wave advances the snapshot to the next wave", () => {
  const plan = makePlan();
  let state = createRalphRunState(plan);
  state = applyRalphRunAction(plan, state, {
    kind: "complete",
    issue_id: "45",
    actor: "solo-operator",
  });

  const snapshot = buildRalphRunSnapshot(plan, state);

  assert.equal(snapshot.current_wave.wave_id, "wave-1");
  assert.deepEqual(snapshot.runnable.map((issue) => issue.issue_id), ["46", "48"]);
  assert.equal(snapshot.current_wave.parallel, true);
});

test("freeze suppresses runnable issues until unfreeze", () => {
  const plan = makePlan();
  let state = createRalphRunState(plan);
  state = applyRalphRunAction(plan, state, {
    kind: "complete",
    issue_id: "45",
    actor: "solo-operator",
  });
  state = applyRalphRunAction(plan, state, {
    kind: "freeze",
    reason: "Shared foundation instability",
    actor: "solo-operator",
  });

  let snapshot = buildRalphRunSnapshot(plan, state);
  assert.equal(snapshot.global_status, "frozen");
  assert.deepEqual(snapshot.runnable, []);

  state = applyRalphRunAction(plan, state, {
    kind: "unfreeze",
    actor: "solo-operator",
  });
  snapshot = buildRalphRunSnapshot(plan, state);
  assert.deepEqual(snapshot.runnable.map((issue) => issue.issue_id), ["46", "48"]);
});

test("blocking one issue in a parallel wave preserves the other runnable issue", () => {
  const plan = makePlan();
  let state = createRalphRunState(plan);
  state = applyRalphRunAction(plan, state, {
    kind: "complete",
    issue_id: "45",
    actor: "solo-operator",
  });
  state = applyRalphRunAction(plan, state, {
    kind: "block",
    issue_id: "46",
    reason: "Needs graph contract clarification",
    actor: "solo-operator",
  });

  const snapshot = buildRalphRunSnapshot(plan, state);

  assert.deepEqual(snapshot.runnable.map((issue) => issue.issue_id), ["48"]);
  assert.deepEqual(snapshot.blocked.map((issue) => issue.issue_id), ["46"]);
});

test("failure policy pauses only the affected branch for local repair escalation", () => {
  const plan = makePlan();
  let state = createRalphRunState(plan);
  state = applyRalphRunAction(plan, state, {
    kind: "complete",
    issue_id: "45",
    actor: "solo-operator",
  });
  state = applyRalphRunAction(plan, state, {
    kind: "failure_policy",
    issue_id: "46",
    actor: "solo-operator",
    failure_kind: "validation_fail",
    reason_code: "same_node_cap_exceeded",
    reason: "Automatic repair escalated because node dag-node-46 already reached the same-node repair cap.",
  });

  const snapshot = buildRalphRunSnapshot(plan, state);

  assert.equal(snapshot.global_status, "active");
  assert.deepEqual(snapshot.runnable.map((issue) => issue.issue_id), ["48"]);
  assert.deepEqual(snapshot.blocked.map((issue) => issue.issue_id), ["46"]);
  assert.equal(snapshot.blocked[0].decision_scope, "branch_local_pause");
  assert.equal(snapshot.blocked[0].reason_code, "same_node_cap_exceeded");
  assert.equal(state.issue_states["46"].decision_scope, "branch_local_pause");
  assert.equal(state.history.at(-1).decision_scope, "branch_local_pause");
});

test("failure policy freezes the full run for shared-foundation failures with durable reasons", () => {
  const plan = makePlan();
  let state = createRalphRunState(plan);
  state = applyRalphRunAction(plan, state, {
    kind: "complete",
    issue_id: "45",
    actor: "solo-operator",
  });
  state = applyRalphRunAction(plan, state, {
    kind: "failure_policy",
    issue_id: "46",
    actor: "solo-operator",
    failure_kind: "execution_blocked",
    reason_code: "unstable_shared_contracts",
    shared_foundation_kind: "unstable shared contracts",
    reason: "Shared API contract drift invalidated the approved bundle assumptions.",
  });

  const snapshot = buildRalphRunSnapshot(plan, state);

  assert.equal(snapshot.global_status, "frozen");
  assert.deepEqual(snapshot.runnable, []);
  assert.equal(snapshot.global_reason_code, "unstable_shared_contracts");
  assert.equal(snapshot.global_decision_scope, "full_run_freeze");
  assert.equal(snapshot.global_shared_foundation_kind, "unstable_shared_contracts");
  assert.equal(state.issue_states["46"].decision_scope, "full_run_freeze");
  assert.equal(state.history.at(-1).decision_scope, "full_run_freeze");
});
