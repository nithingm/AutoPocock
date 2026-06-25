import assert from "node:assert/strict";
import { test } from "node:test";

import {
  compileLoopSpecFromDagNode,
  compileLoopSpecsFromDag,
} from "../scripts/lib/dag-loop-spec-compiler.mjs";

function makeDag() {
  return {
    schema_version: "layered-issue-dag/v1",
    dag_id: "dag-34",
    source_prd: "docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md",
    source_prd_status: "approved",
    source_context: "docs/agents/contexts/2026-05-14-dag-initiative.md",
    feature_track: "dag-driven-orchestration",
    nodes: [
      {
        id: "node-1",
        issue_id: "40",
        title: "Compile Loop Specs from approved DAG nodes",
        type: "execution-contract",
        layer: "implementation-slice",
        queue_class: "tracer-bullet",
        tracer_bullet: true,
        wave: 1,
        goal: "Compile provider-neutral Loop Specs directly from approved graph nodes.",
        depends_on: ["node-0"],
        acceptance_criteria: [
          "Approved graph nodes compile into provider-neutral Loop Specs.",
          "Loop Specs preserve ownership boundaries, tracer-bullet semantics, stop conditions, and escalation rules.",
        ],
        verification_plan: {
          automated: ["node --test tests/dag-loop-spec-compiler.test.mjs"],
          manual: ["Inspect one representative Loop Spec output."],
          evidence_expected: ["Compiled Loop Spec example", "Test output summary"],
        },
        write_surface: ["scripts/lib/dag-loop-spec-compiler.mjs", "tests/dag-loop-spec-compiler.test.mjs"],
        conflict_surface: "low",
        conflict_reasoning: "This slice stays inside the compiler boundary.",
        provider_eligible: true,
        human_gate_required: false,
        approved: true,
        execution_eligibility: {
          eligible: true,
          reasons: [],
        },
        boundaries: {
          in_scope: [
            "Compile Loop Specs directly from DAG nodes.",
            "Preserve graph-level ownership and tracer semantics.",
          ],
          out_of_scope: [
            "Actual provider launch behavior.",
            "Wave orchestration.",
          ],
          forbidden_actions: ["launch a provider", "mutate graph progression"],
          allowed_commands: ["node --test tests/dag-loop-spec-compiler.test.mjs"],
        },
        execution_contract: {
          retry_budget: 2,
          stop_conditions: [
            "Stop when acceptance criteria are satisfied and verification is complete.",
            "Stop if tracer-bullet proof would require widening scope beyond the declared minimal slice.",
          ],
          escalation_rules: [
            "Escalate when the DAG contract cannot map cleanly into a provider-neutral Loop Spec.",
            "Escalate when ownership boundaries are ambiguous.",
          ],
        },
        completion_contract: {
          report_back: [
            "Which handoff-first behaviors remain.",
            "Any Loop Spec semantics intentionally deferred.",
          ],
          artifacts_to_update: ["docs/agents/loop-specs/"],
        },
        context_artifacts: [
          "docs/agents/handoffs/2026-05-14-40-compile-provider-neutral-loop-specs-from-approved-dag-nodes.md",
        ],
      },
      {
        id: "node-2",
        title: "Human-gated graph review",
        type: "review",
        layer: "follow-up",
        goal: "Require human review before execution.",
        acceptance_criteria: ["Human review remains required."],
        verification_plan: {
          automated: [],
          manual: ["Review manually."],
          evidence_expected: [],
        },
        write_surface: ["docs/**"],
        provider_eligible: false,
        human_gate_required: true,
        approval_status: "approved",
        execution_eligibility: {
          eligible: false,
          reasons: ["Human gate remains unresolved."],
        },
      },
    ],
  };
}

test("compileLoopSpecFromDagNode preserves provider-neutral contract semantics from an approved DAG node", () => {
  const loopSpec = compileLoopSpecFromDagNode({
    dag: makeDag(),
    nodeId: "node-1",
    dispatch: {
      dispatch_id: "dispatch-40",
      issue_id: "40",
      isolation_mode: "worktree",
      expected_branch: "agent/40-compile-loop-specs",
      worktree_path: "d:\\Projects\\AutoPocock\\.worktrees\\40-compile-loop-specs",
      claim: { claimed_by: "runner-40" },
      completion_report_target: "d:\\Projects\\AutoPocock\\docs\\agents\\completions\\dispatch-40.md",
      source: "manual",
    },
  });

  assert.equal(loopSpec.schema_version, "loop-spec/v1");
  assert.equal(loopSpec.loop_spec_id, "loop-spec-dispatch-40");
  assert.equal(loopSpec.dag_node_id, "node-1");
  assert.equal(loopSpec.issue_id, "40");
  assert.equal(loopSpec.layer, "implementation-slice");
  assert.equal(loopSpec.tracer_bullet.is_tracer_bullet, true);
  assert.equal(loopSpec.tracer_bullet.queue_class, "tracer-bullet");
  assert.equal(loopSpec.tracer_bullet.feature_track, "dag-driven-orchestration");
  assert.equal(loopSpec.dependencies.wave, 1);
  assert.deepEqual(loopSpec.owned_surface, [
    "scripts/lib/dag-loop-spec-compiler.mjs",
    "tests/dag-loop-spec-compiler.test.mjs",
  ]);
  assert.deepEqual(loopSpec.boundaries.forbidden_actions, [
    "launch a provider",
    "mutate graph progression",
  ]);
  assert.deepEqual(loopSpec.execution_contract.stop_conditions, [
    "Stop when acceptance criteria are satisfied and verification is complete.",
    "Stop if tracer-bullet proof would require widening scope beyond the declared minimal slice.",
  ]);
  assert.deepEqual(loopSpec.execution_contract.escalation_rules, [
    "Escalate when the DAG contract cannot map cleanly into a provider-neutral Loop Spec.",
    "Escalate when ownership boundaries are ambiguous.",
  ]);
  assert.equal(loopSpec.execution_contract.retry_budget, 2);
  assert.equal(loopSpec.execution_contract.provider_eligible, true);
  assert.equal(loopSpec.execution_contract.human_gate_required, false);
  assert.match(loopSpec.context_artifacts.source_prd, /dag-driven-github-issue-synthesis-and-ralph-orchestration/);
  assert.match(
    loopSpec.context_artifacts.supporting_artifacts[0],
    /2026-05-14-40-compile-provider-neutral-loop-specs-from-approved-dag-nodes\.md/,
  );
});

test("compileLoopSpecFromDagNode synthesizes default tracer-bullet stop and escalation rules when the DAG omits them", () => {
  const dag = makeDag();
  delete dag.nodes[0].execution_contract;

  const loopSpec = compileLoopSpecFromDagNode({
    dag,
    nodeId: "node-1",
  });

  assert.equal(loopSpec.execution_contract.retry_budget, 1);
  assert.match(
    loopSpec.execution_contract.stop_conditions.join("\n"),
    /tracer-bullet proof fails or the minimal vertical slice is not demonstrated/i,
  );
  assert.match(
    loopSpec.execution_contract.escalation_rules.join("\n"),
    /tracer-bullet proof would require widening scope/i,
  );
  assert.match(
    loopSpec.execution_contract.escalation_rules.join("\n"),
    /dependency node-0 is unresolved/i,
  );
});

test("compileLoopSpecFromDagNode rejects nodes that are not execution-eligible", () => {
  assert.throws(
    () =>
      compileLoopSpecFromDagNode({
        dag: makeDag(),
        nodeId: "node-2",
      }),
    /not execution-eligible: Human gate remains unresolved\./,
  );
});

test("compileLoopSpecsFromDag compiles multiple approved nodes with per-node dispatch context", () => {
  const dag = makeDag();
  dag.nodes.push({
    id: "node-3",
    title: "Compile follow-up loop spec",
    type: "follow-up",
    layer_kind: "follow-up",
    goal: "Produce a second provider-neutral Loop Spec.",
    acceptance_criteria: ["Follow-up Loop Spec compiles cleanly."],
    verification_plan: {
      automated: ["node --test tests/dag-loop-spec-compiler.test.mjs"],
      manual: [],
      evidence_expected: [],
    },
    owned_surface: ["docs/agents/loop-specs/**"],
    provider_eligible: true,
    human_gate_required: false,
    approval_status: "approved",
  });

  const loopSpecs = compileLoopSpecsFromDag({
    dag,
    nodeIds: ["node-1", "node-3"],
    dispatchByNodeId: {
      "node-1": { dispatch_id: "dispatch-40" },
      "node-3": { dispatch_id: "dispatch-43", issue_id: "43" },
    },
  });

  assert.equal(loopSpecs.length, 2);
  assert.equal(loopSpecs[0].loop_spec_id, "loop-spec-dispatch-40");
  assert.equal(loopSpecs[1].loop_spec_id, "loop-spec-dispatch-43");
  assert.deepEqual(loopSpecs[1].owned_surface, ["docs/agents/loop-specs/**"]);
  assert.equal(loopSpecs[1].source.dag_id, "dag-34");
});
