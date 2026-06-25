import assert from "node:assert/strict";
import { test } from "node:test";

import {
  approveWaveBundle,
  buildWaveApprovalBundle,
} from "../scripts/lib/wave-approval-plane.mjs";

function makePlan() {
  return {
    schema_version: "ralph-run-plan/v1",
    plan_id: "plan-50",
    parent_issue: "50",
    control_policy: {
      approval_unit: "wave-bundle",
      max_parallel_agents: 2,
      default_stop_conditions: ["Stop when acceptance checks are green."],
      default_escalation_conditions: ["Escalate when scope widens."],
    },
    waves: [
      {
        wave_id: "wave-4",
        parallel: true,
        rationale: "These graph-selected nodes are independent after the tracer bullet.",
        branch_local_pause_on: ["Shared contracts drift underneath the wave."],
        issues: [
          {
            issue_id: "50",
            dag_node_id: "node-wave-approval",
            title: "Add Wave-Bundle Approval",
            depends_on: ["node-loop-specs"],
            dependency_justification: "Depends on compiled loop-spec machinery from node-loop-specs.",
            parallelism_justification: "Safe alongside node-completion because write surfaces do not overlap.",
            verification_shape: ["node --test tests/wave-approval-plane.test.mjs"],
            feasibility_checks: ["No shared write surfaces with node-completion."],
            acceptance_checks: ["Approval bundle artifact is durable and machine-checkable."],
            loop_spec: {
              loop_spec_id: "loop-spec-wave-approval",
              goal: "Approve graph-selected execution waves as bundles.",
              owned_surface: ["scripts/lib/wave-approval-plane.mjs"],
              verification_plan: {
                automated: ["node --test tests/wave-approval-plane.test.mjs"],
                manual: ["Inspect one approval bundle artifact."],
              },
              execution_contract: {
                stop_conditions: ["Stop when approval preview and approval write path are both green."],
                escalation_rules: ["Escalate if the selected wave cannot explain its parallel safety."],
              },
            },
          },
          {
            issue_id: "52",
            dag_node_id: "node-completion",
            title: "Enforce Evidence-Based Completion",
            depends_on: ["node-loop-specs"],
            dependency_justification: "Consumes the same compiled loop-spec contract.",
            parallelism_justification: "Progression work stays in a separate execution-state surface.",
            verification_shape: ["node --test tests/graph-progression.test.mjs"],
            feasibility_checks: ["Completion vocabulary matches graph progression."],
            acceptance_checks: ["Validation-failed progression stays explicit."],
            approval_treatment: "heightened",
            approval_reason: "Touches progression semantics shared by later waves.",
            loop_spec: {
              loop_spec_id: "loop-spec-completion",
              goal: "Apply execution outcomes and evidence gates to graph progression.",
              owned_surface: ["scripts/lib/graph-progression.mjs"],
              execution_contract: {
                stop_conditions: ["Stop when progression transitions are deterministic."],
                escalation_rules: ["Escalate if review and QA semantics diverge."],
              },
            },
          },
        ],
      },
    ],
  };
}

function makeState() {
  return {
    schema_version: "ralph-run-state/v1",
    plan_id: "plan-50",
    source_plan: "docs/agents/loop-specs/plan-50.json",
    global: {
      status: "active",
      reason: "",
    },
    issue_states: {
      "50": { status: "pending", attempts: 0, updated_at: "", reason: "" },
      "52": { status: "pending", attempts: 0, updated_at: "", reason: "" },
    },
    wave_approvals: {
      "wave-4": {
        status: "pending",
        bundle_json_path: "",
        bundle_markdown_path: "",
        approved_by: "",
        approved_at: "",
      },
    },
    history: [],
  };
}

test("buildWaveApprovalBundle packages selected graph nodes, justifications, loop specs, and approval metadata", () => {
  const bundle = buildWaveApprovalBundle({
    plan: makePlan(),
    state: makeState(),
    waveId: "wave-4",
    sourcePlanPath: "docs/agents/loop-specs/plan-50.json",
  });

  assert.equal(bundle.schema_version, "wave-approval-bundle/v1");
  assert.equal(bundle.approval_unit, "wave-bundle");
  assert.equal(bundle.wave.parallel, true);
  assert.deepEqual(bundle.wave.selected_node_ids, ["node-wave-approval", "node-completion"]);
  assert.equal(bundle.parallelism.max_parallel, 2);
  assert.match(bundle.parallelism.justification.join("\n"), /write surfaces do not overlap/i);
  assert.equal(bundle.selected_nodes[0].loop_spec.loop_spec_id, "loop-spec-wave-approval");
  assert.deepEqual(bundle.selected_nodes[0].loop_spec.stop_conditions, [
    "Stop when approval preview and approval write path are both green.",
  ]);
  assert.deepEqual(bundle.selected_nodes[1].approval_treatment, {
    level: "heightened",
    reason: "Touches progression semantics shared by later waves.",
  });
  assert.deepEqual(bundle.expected_acceptance_checks, [
    "Approval bundle artifact is durable and machine-checkable.",
    "Validation-failed progression stays explicit.",
  ]);
  assert.match(bundle.feasibility_and_conflict_checks.join("\n"), /No shared write surfaces/i);
  assert.match(bundle.stop_and_escalation_conditions.escalation.join("\n"), /review and QA semantics diverge/i);
});

test("approveWaveBundle marks the durable artifact approved without changing the bundle model", () => {
  const bundle = approveWaveBundle(
    buildWaveApprovalBundle({
      plan: makePlan(),
      state: makeState(),
      waveId: "wave-4",
      sourcePlanPath: "docs/agents/loop-specs/plan-50.json",
    }),
    {
      approvedBy: "solo-operator",
      approvedAt: "2026-05-15T12:00:00.000Z",
    },
  );

  assert.equal(bundle.approval.status, "approved");
  assert.equal(bundle.approval.approved_by, "solo-operator");
  assert.equal(bundle.approval.approved_at, "2026-05-15T12:00:00.000Z");
  assert.equal(bundle.approval.unit, "wave-bundle");
});
