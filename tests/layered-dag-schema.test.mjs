import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AUTHORITATIVE_NODE_FIELDS,
  DAG_NODE_LAYERS,
  LAYERED_DAG_SCHEMA_VERSION,
  createLayeredDag,
  createLayeredDagNode,
  validateLayeredDag,
  validateLayeredDagNode,
} from "../scripts/lib/layered-dag-schema.mjs";

function makeNode(overrides = {}) {
  return {
    id: "node-1",
    title: "Define the foundational graph contract",
    layer: DAG_NODE_LAYERS.tracerBullet,
    feature_track: "dag-sync",
    goal: "Define a graph contract that can drive downstream planning and execution.",
    depends_on: [],
    acceptance_criteria: ["Graph contract fields are durable and provider-neutral."],
    verification_plan: {
      automated: ["node --test tests/layered-dag-schema.test.mjs"],
      manual: ["Inspect the schema for authoritative planning fields."],
      evidence_expected: ["Test output summary"],
    },
    write_surface: ["issues/**", "scripts/lib/**"],
    conflict_surface: "low",
    conflict_reasoning: "The tracer-bullet schema is isolated to planning contracts.",
    risk: "medium",
    confidence: "medium",
    ambiguity_signals: ["Downstream compiler expectations may still evolve."],
    provider_eligibility: {
      eligible: true,
      allowed_providers: ["codex", "claude-code"],
      execution_mode: "afk",
    },
    human_gate: {
      required: false,
      reason: "",
      approval_scope: "",
    },
    tracer_bullet: {
      is_tracer_bullet: true,
      gates_deeper_execution: true,
      validation_scope: "Prove DAG-to-GitHub flow before deeper orchestration.",
    },
    execution: {
      queue_class: "tracer-bullet",
      parallelizable: false,
      retry_budget: 1,
      stop_conditions: ["Acceptance criteria are satisfied."],
      escalation_rules: ["Escalate if graph semantics leak into provider-specific assumptions."],
    },
    tracker: {
      issue_number: "35",
      labels: ["enhancement", "ready-for-agent"],
      execution_stage: "Ready for Handoff",
      execution_lane: "Handoff",
      dependency_state: "unblocked",
      conflict_surface: "low",
    },
    state: {
      planning_status: "approved",
      review_status: "pending",
      qa_status: "pending",
      progression_status: "planned",
    },
    follow_up: {},
    bug_loop: {},
    metadata: {
      owner: "solo-operator",
    },
    ...overrides,
  };
}

test("layered DAG schema preserves layer-specific semantics across node kinds", () => {
  const initiative = createLayeredDagNode(makeNode({
    id: "initiative-1",
    layer: DAG_NODE_LAYERS.initiative,
    title: "Own the whole initiative",
    tracer_bullet: {},
    provider_eligibility: {
      eligible: false,
      blocked_reason: "Initiatives are planning containers, not AFK execution units.",
    },
    human_gate: {
      required: true,
      reason: "Initiative changes require Solo Operator approval.",
    },
    execution: {},
  }));
  const tracerBullet = createLayeredDagNode(makeNode());
  const implementationSlice = createLayeredDagNode(makeNode({
    id: "slice-1",
    layer: DAG_NODE_LAYERS.implementationSlice,
    title: "Implement the compiler-facing node shape",
    tracer_bullet: {},
    execution: {},
  }));
  const followUp = createLayeredDagNode(makeNode({
    id: "follow-up-1",
    layer: DAG_NODE_LAYERS.followUp,
    title: "Clarify unresolved graph ambiguity",
    provider_eligibility: {
      eligible: false,
      blocked_reason: "Follow-up planning requires human clarification.",
    },
    human_gate: {
      required: true,
      reason: "Needs explicit planning clarification.",
    },
    tracer_bullet: {},
    execution: {},
    follow_up: {
      source_node_id: "node-1",
      trigger: "Ambiguity threshold exceeded during review.",
    },
  }));
  const bugLoop = createLayeredDagNode(makeNode({
    id: "bug-loop-1",
    layer: DAG_NODE_LAYERS.bugLoop,
    title: "Fix graph regression exposed by QA",
    tracer_bullet: {},
    execution: {},
    bug_loop: {
      source_node_id: "node-1",
      trigger: "QA failed on graph progression semantics.",
      reentry_policy: "Return to the same feature track and block dependents.",
    },
  }));

  assert.equal(initiative.provider_eligibility.eligible, false);
  assert.equal(initiative.human_gate.required, true);
  assert.equal(initiative.execution.queue_class, "hitl");

  assert.equal(tracerBullet.tracer_bullet.is_tracer_bullet, true);
  assert.equal(tracerBullet.tracer_bullet.gates_deeper_execution, true);
  assert.equal(tracerBullet.execution.queue_class, "tracer-bullet");

  assert.equal(implementationSlice.execution.queue_class, "routine-afk");
  assert.equal(implementationSlice.tracer_bullet.is_tracer_bullet, false);

  assert.equal(followUp.follow_up.source_node_id, "node-1");
  assert.equal(followUp.human_gate.required, true);
  assert.equal(followUp.execution.queue_class, "hitl");

  assert.equal(bugLoop.bug_loop.source_node_id, "node-1");
  assert.equal(bugLoop.bug_loop.trigger, "QA failed on graph progression semantics.");
  assert.equal(bugLoop.execution.queue_class, "bug-loop");
});

test("layered DAG nodes expose the authoritative execution contract fields", () => {
  const node = createLayeredDagNode(makeNode());

  for (const field of AUTHORITATIVE_NODE_FIELDS) {
    assert.ok(field in node, `expected authoritative field ${field}`);
  }

  assert.deepEqual(node.write_surface, ["issues/**", "scripts/lib/**"]);
  assert.deepEqual(node.provider_eligibility.allowed_providers, ["codex", "claude-code"]);
  assert.deepEqual(node.execution.stop_conditions, ["Acceptance criteria are satisfied."]);
  assert.equal(node.tracker.execution_stage, "Ready for Handoff");
});

test("layered DAG graph contract stays provider-neutral while preserving dependency semantics", () => {
  const dag = createLayeredDag({
    graph_id: "dag-35",
    feature_track: "dag-sync",
    source: {
      prd_artifact: "docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md",
      context_artifact: "CONTEXT.md",
    },
    nodes: [
      makeNode({
        id: "node-1",
        layer: DAG_NODE_LAYERS.tracerBullet,
      }),
      makeNode({
        id: "node-2",
        layer: DAG_NODE_LAYERS.implementationSlice,
        title: "Compile the first layered graph artifact",
        depends_on: ["node-1"],
        tracer_bullet: {},
        execution: {},
      }),
    ],
  });

  assert.equal(dag.schema_version, LAYERED_DAG_SCHEMA_VERSION);
  assert.deepEqual(dag.layers, [
    DAG_NODE_LAYERS.tracerBullet,
    DAG_NODE_LAYERS.implementationSlice,
  ]);
  assert.deepEqual(dag.edges, [{ from: "node-1", to: "node-2" }]);
  assert.equal(dag.semantics.authoritative_contract, true);
  assert.equal(dag.semantics.provider_neutral, true);
  assert.equal(dag.wave_policy.gated_by_tracer_bullets, true);
});

test("layered DAG validation rejects nodes that are too weak for downstream compiler and sync slices", () => {
  const errors = validateLayeredDagNode(makeNode({
    feature_track: "",
    acceptance_criteria: [],
    write_surface: [],
    provider_eligibility: {
      eligible: true,
      allowed_providers: [],
    },
    human_gate: {
      required: true,
      reason: "",
    },
  }));

  assert.ok(errors.some((error) => error.includes("feature_track")));
  assert.ok(errors.some((error) => error.includes("acceptance_criteria")));
  assert.ok(errors.some((error) => error.includes("write_surface")));
  assert.ok(errors.some((error) => error.includes("allowed provider")));
  assert.ok(errors.some((error) => error.includes("human_gate reason")));
});

test("layered DAG validation catches graph-level referential and version errors", () => {
  const errors = validateLayeredDag({
    schema_version: "layered-dag/v0",
    graph_id: "dag-35",
    feature_track: "dag-sync",
    source: {
      prd_artifact: "docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md",
    },
    nodes: [
      makeNode({
        id: "node-1",
        layer: DAG_NODE_LAYERS.tracerBullet,
      }),
      makeNode({
        id: "node-1",
        layer: DAG_NODE_LAYERS.bugLoop,
        tracer_bullet: {},
        execution: {},
        bug_loop: {
          source_node_id: "missing-node",
          trigger: "QA failure",
          reentry_policy: "block dependents",
        },
      }),
    ],
    edges: [{ from: "node-1", to: "missing-node" }],
  });

  assert.ok(errors.some((error) => error.includes("Unsupported layered DAG schema version")));
  assert.ok(errors.some((error) => error.includes("Duplicate node id")));
  assert.ok(errors.some((error) => error.includes("unknown target node")));
});
