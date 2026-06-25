import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCompletionEvidence,
  applyAutomaticBugLoopRepair,
  applyBugLoopOutcome,
  applyExecutionOutcome,
  applyQaOutcome,
  applyReclaimOutcome,
  applyReviewOutcome,
  recomputeGraphProgression,
} from "../scripts/lib/graph-progression.mjs";
import { DAG_NODE_LAYERS } from "../scripts/lib/layered-dag-schema.mjs";

function makeNode(overrides = {}) {
  return {
    id: "node-1",
    title: "Prove the tracer-bullet graph path",
    layer: DAG_NODE_LAYERS.tracerBullet,
    feature_track: "graph-progress",
    goal: "Use graph-native progression for execution outcomes.",
    depends_on: [],
    acceptance_criteria: ["Graph progression is deterministic."],
    verification_plan: {
      automated: ["node --test tests/graph-progression.test.mjs", "pnpm test:integration -- graph-progress"],
      manual: ["Inspect one progression trace."],
      evidence_expected: ["Test output summary", "Integration verification stays green."],
    },
    write_surface: ["scripts/lib/graph-progression.mjs", "tests/graph-progression.test.mjs"],
    conflict_surface: "low",
    conflict_reasoning: "Bounded to graph semantics.",
    provider_eligibility: {
      eligible: true,
      allowed_providers: ["codex"],
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
      validation_scope: "Prove graph-native progression before deeper execution.",
    },
    execution: {
      queue_class: "tracer-bullet",
      parallelizable: false,
      retry_budget: 1,
      stop_conditions: ["Acceptance criteria are satisfied."],
      escalation_rules: ["Escalate if graph truth drifts from runtime truth."],
    },
    tracker: {
      issue_number: "42",
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
      execution_status: "pending",
      bug_loop_status: "idle",
      reclaim_status: "none",
    },
    follow_up: {},
    bug_loop: {},
    metadata: {},
    ...overrides,
  };
}

function makeGraph() {
  return {
    graph_id: "graph-42",
    feature_track: "graph-progress",
    source: {
      prd_artifact: "docs/PRDs/2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md",
      context_artifact: "CONTEXT.md",
    },
    nodes: [
      makeNode({
        id: "tb-1",
      }),
      makeNode({
        id: "slice-1",
        title: "Implement the deeper slice",
        layer: DAG_NODE_LAYERS.implementationSlice,
        depends_on: ["tb-1"],
        tracer_bullet: {},
        execution: {
          queue_class: "routine-afk",
          parallelizable: true,
          retry_budget: 2,
          stop_conditions: ["Acceptance criteria are satisfied."],
          escalation_rules: ["Escalate if deeper execution widens scope."],
        },
      }),
      makeNode({
        id: "bug-1",
        title: "Repair the failed tracer bullet",
        layer: DAG_NODE_LAYERS.bugLoop,
        depends_on: [],
        tracer_bullet: {},
        execution: {
          queue_class: "bug-loop",
          parallelizable: false,
          retry_budget: 1,
          stop_conditions: ["Acceptance criteria are satisfied."],
          escalation_rules: ["Escalate if the regression is unclear."],
        },
        bug_loop: {
          source_node_id: "tb-1",
          trigger: "qa_fail",
          reentry_policy: "reopen tracer bullet after repair",
        },
      }),
      makeNode({
        id: "follow-1",
        title: "Human follow-up after successful tracer proof",
        layer: DAG_NODE_LAYERS.followUp,
        depends_on: ["tb-1"],
        provider_eligibility: {
          eligible: false,
          blocked_reason: "Human follow-up requires manual planning.",
        },
        human_gate: {
          required: true,
          reason: "Human clarification is required.",
          approval_scope: "node-progression",
        },
        tracer_bullet: {},
        execution: {
          queue_class: "hitl",
          parallelizable: false,
          retry_budget: 1,
          stop_conditions: ["Clarification captured."],
          escalation_rules: ["Escalate if clarification changes scope."],
        },
        follow_up: {
          source_node_id: "tb-1",
          trigger: "source_done",
        },
      }),
    ],
  };
}

function makeAutoRepairNode(overrides = {}) {
  return makeNode({
    id: "auto-repair-1",
    title: "Auto-inserted repair",
    layer: DAG_NODE_LAYERS.bugLoop,
    depends_on: ["tb-1"],
    tracer_bullet: {},
    execution: {
      queue_class: "bug-loop",
      parallelizable: false,
      retry_budget: 1,
      stop_conditions: ["Repair acceptance criteria are satisfied."],
      escalation_rules: ["Escalate when repair caps or scope rules are exceeded."],
    },
    bug_loop: {
      source_node_id: "slice-1",
      trigger: "validation_fail",
      reentry_policy: "Re-enter the source path after repair validation.",
    },
    metadata: {
      repair_context: {
        auto_inserted: true,
        primary_source_node_id: "slice-1",
        root_source_node_id: "slice-1",
        source_node_ids: ["slice-1"],
        failed_wave_id: "wave-1",
        failure_kind: "validation_fail",
        failed_acceptance_criteria: ["Graph progression is deterministic."],
      },
    },
    ...overrides,
  });
}

test("recomputeGraphProgression gates deeper layers behind tracer-bullet completion", () => {
  const graph = recomputeGraphProgression(makeGraph());

  assert.equal(graph.nodes.find((node) => node.id === "tb-1").state.progression_status, "ready_for_handoff");
  assert.equal(graph.nodes.find((node) => node.id === "slice-1").state.progression_status, "blocked_dependency");
  assert.equal(graph.nodes.find((node) => node.id === "bug-1").state.progression_status, "blocked_trigger");
  assert.equal(graph.nodes.find((node) => node.id === "follow-1").state.progression_status, "blocked_dependency");
  assert.deepEqual(graph.progression.runnable_nodes, ["tb-1"]);
});

test("execution success then review and QA pass unlocks deeper execution and human follow-up deterministically", () => {
  let graph = recomputeGraphProgression(makeGraph());
  graph = applyExecutionOutcome(graph, { nodeId: "tb-1", outcome: "succeeded", actor: "runner" });
  assert.equal(graph.nodes.find((node) => node.id === "tb-1").state.progression_status, "awaiting_validation");

  graph = applyCompletionEvidence(graph, {
    nodeId: "tb-1",
    actor: "runner",
    evidence: {
      changed_outputs: ["scripts/lib/graph-progression.mjs", "tests/graph-progression.test.mjs"],
      verification_commands: ["node --test tests/graph-progression.test.mjs", "pnpm test:integration -- graph-progress"],
      verification_results: ["Unit graph-progression tests passed.", "Integration graph progression checks passed."],
      acceptance_criteria_evidence: [
        {
          criterion: "Graph progression is deterministic.",
          evidence: "Unit and integration checks both passed.",
        },
      ],
      test_evidence: [
        { dimension: "unit", status: "pass", summary: "Unit graph-progression tests passed." },
        { dimension: "integration", status: "pass", summary: "Integration graph progression checks passed." },
      ],
    },
  });
  assert.equal(graph.nodes.find((node) => node.id === "tb-1").state.progression_status, "review");

  graph = applyReviewOutcome(graph, { nodeId: "tb-1", outcome: "approved", actor: "solo-operator" });
  assert.equal(graph.nodes.find((node) => node.id === "tb-1").state.progression_status, "qa");

  graph = applyQaOutcome(graph, { nodeId: "tb-1", outcome: "passed", actor: "solo-operator" });

  assert.equal(graph.nodes.find((node) => node.id === "tb-1").state.progression_status, "done");
  assert.equal(graph.nodes.find((node) => node.id === "slice-1").state.progression_status, "ready_for_handoff");
  assert.equal(graph.nodes.find((node) => node.id === "follow-1").state.progression_status, "blocked_human_gate");
  assert.deepEqual(graph.progression.runnable_nodes, ["slice-1"]);
});

test("validation failure keeps deeper layers blocked before review when integration evidence fails", () => {
  let graph = recomputeGraphProgression(makeGraph());
  graph = applyExecutionOutcome(graph, { nodeId: "tb-1", outcome: "succeeded", actor: "runner" });
  graph = applyCompletionEvidence(graph, {
    nodeId: "tb-1",
    actor: "runner",
    reason: "Local unit checks passed but integration failed.",
    evidence: {
      changed_outputs: ["scripts/lib/graph-progression.mjs"],
      verification_commands: ["node --test tests/graph-progression.test.mjs", "pnpm test:integration -- graph-progress"],
      verification_results: ["Unit graph-progression tests passed.", "Integration graph progression checks failed."],
      acceptance_criteria_evidence: [
        {
          criterion: "Graph progression is deterministic.",
          evidence: "Unit path passed but integration path regressed.",
        },
      ],
      test_evidence: [
        { dimension: "unit", status: "pass", summary: "Unit graph-progression tests passed." },
        { dimension: "integration", status: "fail", summary: "Integration graph progression checks failed." },
      ],
    },
  });

  assert.equal(graph.nodes.find((node) => node.id === "tb-1").state.progression_status, "validation_failed");
  assert.equal(graph.nodes.find((node) => node.id === "slice-1").state.progression_status, "blocked_dependency");
  assert.equal(graph.nodes.find((node) => node.id === "bug-1").state.progression_status, "blocked_trigger");
  assert.deepEqual(graph.progression.runnable_nodes, []);
});

test("QA failure after validated completion keeps deeper layers blocked and activates the bug-loop node", () => {
  let graph = recomputeGraphProgression(makeGraph());
  graph = applyExecutionOutcome(graph, { nodeId: "tb-1", outcome: "succeeded", actor: "runner" });
  graph = applyCompletionEvidence(graph, {
    nodeId: "tb-1",
    actor: "runner",
    evidence: {
      changed_outputs: ["scripts/lib/graph-progression.mjs"],
      verification_commands: ["node --test tests/graph-progression.test.mjs", "pnpm test:integration -- graph-progress"],
      verification_results: ["Unit graph-progression tests passed.", "Integration graph progression checks passed."],
      acceptance_criteria_evidence: [
        {
          criterion: "Graph progression is deterministic.",
          evidence: "Unit and integration checks both passed.",
        },
      ],
      test_evidence: [
        { dimension: "unit", status: "pass", summary: "Unit graph-progression tests passed." },
        { dimension: "integration", status: "pass", summary: "Integration graph progression checks passed." },
      ],
    },
  });
  graph = applyReviewOutcome(graph, { nodeId: "tb-1", outcome: "approved", actor: "solo-operator" });
  graph = applyQaOutcome(graph, { nodeId: "tb-1", outcome: "failed", actor: "solo-operator", reason: "Regression detected" });

  assert.equal(graph.nodes.find((node) => node.id === "tb-1").state.progression_status, "bug_loop");
  assert.equal(graph.nodes.find((node) => node.id === "slice-1").state.progression_status, "blocked_dependency");
  assert.equal(graph.nodes.find((node) => node.id === "bug-1").state.progression_status, "ready_for_handoff");
  assert.deepEqual(graph.progression.runnable_nodes, ["bug-1"]);
});

test("reclaim reopens completed work and re-blocks dependents", () => {
  let graph = recomputeGraphProgression(makeGraph());
  graph = applyExecutionOutcome(graph, { nodeId: "tb-1", outcome: "succeeded", actor: "runner" });
  graph = applyCompletionEvidence(graph, {
    nodeId: "tb-1",
    actor: "runner",
    evidence: {
      changed_outputs: ["scripts/lib/graph-progression.mjs"],
      verification_commands: ["node --test tests/graph-progression.test.mjs", "pnpm test:integration -- graph-progress"],
      verification_results: ["Unit graph-progression tests passed.", "Integration graph progression checks passed."],
      acceptance_criteria_evidence: [
        {
          criterion: "Graph progression is deterministic.",
          evidence: "Unit and integration checks both passed.",
        },
      ],
      test_evidence: [
        { dimension: "unit", status: "pass", summary: "Unit graph-progression tests passed." },
        { dimension: "integration", status: "pass", summary: "Integration graph progression checks passed." },
      ],
    },
  });
  graph = applyReviewOutcome(graph, { nodeId: "tb-1", outcome: "approved", actor: "solo-operator" });
  graph = applyQaOutcome(graph, { nodeId: "tb-1", outcome: "passed", actor: "solo-operator" });

  assert.equal(graph.nodes.find((node) => node.id === "slice-1").state.progression_status, "ready_for_handoff");

  graph = applyReclaimOutcome(graph, { nodeId: "tb-1", actor: "solo-operator", reason: "Need another pass" });

  assert.equal(graph.nodes.find((node) => node.id === "tb-1").state.progression_status, "ready_for_handoff");
  assert.equal(graph.nodes.find((node) => node.id === "slice-1").state.progression_status, "blocked_dependency");
  assert.equal(graph.nodes.find((node) => node.id === "tb-1").state.reclaim_status, "reclaimed");
});

test("resolving a bug-loop re-blocks the repair node until the source fails again", () => {
  let graph = recomputeGraphProgression(makeGraph());
  graph = applyExecutionOutcome(graph, { nodeId: "tb-1", outcome: "succeeded", actor: "runner" });
  graph = applyCompletionEvidence(graph, {
    nodeId: "tb-1",
    actor: "runner",
    evidence: {
      changed_outputs: ["scripts/lib/graph-progression.mjs"],
      verification_commands: ["node --test tests/graph-progression.test.mjs", "pnpm test:integration -- graph-progress"],
      verification_results: ["Unit graph-progression tests passed.", "Integration graph progression checks passed."],
      acceptance_criteria_evidence: [
        {
          criterion: "Graph progression is deterministic.",
          evidence: "Unit and integration checks both passed.",
        },
      ],
      test_evidence: [
        { dimension: "unit", status: "pass", summary: "Unit graph-progression tests passed." },
        { dimension: "integration", status: "pass", summary: "Integration graph progression checks passed." },
      ],
    },
  });
  graph = applyReviewOutcome(graph, { nodeId: "tb-1", outcome: "approved", actor: "solo-operator" });
  graph = applyQaOutcome(graph, { nodeId: "tb-1", outcome: "failed", actor: "solo-operator" });
  assert.equal(graph.nodes.find((node) => node.id === "bug-1").state.progression_status, "ready_for_handoff");

  graph = applyBugLoopOutcome(graph, { nodeId: "tb-1", outcome: "resolved", actor: "runner", reason: "Patch prepared" });

  assert.equal(graph.nodes.find((node) => node.id === "tb-1").state.progression_status, "ready_for_handoff");
  assert.equal(graph.nodes.find((node) => node.id === "bug-1").state.progression_status, "blocked_trigger");
});

test("validation failure can auto-insert a narrow repair node with source linkage and computed dependencies", () => {
  let graph = recomputeGraphProgression(makeGraph());
  graph = applyExecutionOutcome(graph, { nodeId: "tb-1", outcome: "succeeded", actor: "runner" });
  graph = applyCompletionEvidence(graph, {
    nodeId: "tb-1",
    actor: "runner",
    evidence: {
      changed_outputs: ["scripts/lib/graph-progression.mjs"],
      verification_commands: ["node --test tests/graph-progression.test.mjs", "pnpm test:integration -- graph-progress"],
      verification_results: ["Unit graph-progression tests passed.", "Integration graph progression checks passed."],
      acceptance_criteria_evidence: [
        {
          criterion: "Graph progression is deterministic.",
          evidence: "Unit and integration checks both passed.",
        },
      ],
      test_evidence: [
        { dimension: "unit", status: "pass", summary: "Unit graph-progression tests passed." },
        { dimension: "integration", status: "pass", summary: "Integration graph progression checks passed." },
      ],
    },
  });
  graph = applyReviewOutcome(graph, { nodeId: "tb-1", outcome: "approved", actor: "solo-operator" });
  graph = applyQaOutcome(graph, { nodeId: "tb-1", outcome: "passed", actor: "solo-operator" });
  graph = applyExecutionOutcome(graph, { nodeId: "slice-1", outcome: "succeeded", actor: "runner" });
  graph = applyCompletionEvidence(graph, {
    nodeId: "slice-1",
    actor: "runner",
    reason: "Integration regression detected.",
    evidence: {
      changed_outputs: ["scripts/lib/graph-progression.mjs"],
      verification_commands: ["node --test tests/graph-progression.test.mjs", "pnpm test:integration -- graph-progress"],
      verification_results: ["Unit graph-progression tests passed.", "Integration graph progression checks failed."],
      acceptance_criteria_evidence: [
        {
          criterion: "Graph progression is deterministic.",
          evidence: "Unit path passed but integration path regressed.",
        },
      ],
      test_evidence: [
        { dimension: "unit", status: "pass", summary: "Unit graph-progression tests passed." },
        { dimension: "integration", status: "fail", summary: "Integration graph progression checks failed." },
      ],
    },
  });

  graph = applyAutomaticBugLoopRepair(graph, {
    nodeId: "slice-1",
    failureKind: "validation_fail",
    failedWaveId: "wave-1",
    failedAcceptanceCriteria: ["Graph progression is deterministic."],
    actor: "runner",
    reason: "Integration regression detected.",
  });

  const repairNode = graph.nodes.find((node) => node.id === "slice-1-bug-loop-1");
  assert.ok(repairNode);
  assert.equal(repairNode.layer, DAG_NODE_LAYERS.bugLoop);
  assert.equal(repairNode.bug_loop.source_node_id, "slice-1");
  assert.deepEqual(repairNode.depends_on, ["tb-1"]);
  assert.deepEqual(repairNode.metadata.repair_context.source_node_ids, ["slice-1"]);
  assert.equal(repairNode.metadata.repair_context.failed_wave_id, "wave-1");
  assert.equal(repairNode.state.progression_status, "ready_for_handoff");
  assert.deepEqual(graph.progression.runnable_nodes, ["slice-1-bug-loop-1"]);
  assert.ok(graph.progression.repair_decisions.some((decision) =>
    decision.node_id === "slice-1"
    && decision.action === "create_repair_node"
    && decision.repair_node_id === "slice-1-bug-loop-1"
  ));
});

test("same-node repair cap escalates instead of creating another repair node", () => {
  const graphWithRepairs = makeGraph();
  graphWithRepairs.nodes.push(
    makeAutoRepairNode({
      id: "slice-1-bug-loop-1",
      metadata: {
        repair_context: {
          auto_inserted: true,
          primary_source_node_id: "slice-1",
          root_source_node_id: "slice-1",
          source_node_ids: ["slice-1"],
          failed_wave_id: "wave-1",
          failure_kind: "validation_fail",
          failed_acceptance_criteria: ["Criterion A"],
        },
      },
    }),
    makeAutoRepairNode({
      id: "slice-1-bug-loop-2",
      metadata: {
        repair_context: {
          auto_inserted: true,
          primary_source_node_id: "slice-1",
          root_source_node_id: "slice-1",
          source_node_ids: ["slice-1"],
          failed_wave_id: "wave-2",
          failure_kind: "validation_fail",
          failed_acceptance_criteria: ["Criterion B"],
        },
      },
    }),
  );

  const graph = applyAutomaticBugLoopRepair(recomputeGraphProgression(graphWithRepairs), {
    nodeId: "slice-1",
    failureKind: "validation_fail",
    failedWaveId: "wave-3",
    failedAcceptanceCriteria: ["Criterion C"],
    actor: "runner",
    reason: "A third repair attempt would exceed same-node limits.",
  });

  assert.equal(graph.nodes.filter((node) => node.id.startsWith("slice-1-bug-loop-")).length, 2);
  assert.ok(graph.progression.repair_decisions.some((decision) =>
    decision.node_id === "slice-1"
    && decision.action === "escalate"
    && decision.reason_code === "same_node_cap_exceeded"
  ));
});

test("wave-level repair cap records a durable escalation reason instead of inserting a new repair node", () => {
  const graphWithRepairs = makeGraph();
  graphWithRepairs.nodes.push(
    makeAutoRepairNode({
      id: "tb-1-bug-loop-1",
      bug_loop: {
        source_node_id: "tb-1",
        trigger: "validation_fail",
        reentry_policy: "Re-enter the source path after repair validation.",
      },
      metadata: {
        repair_context: {
          auto_inserted: true,
          primary_source_node_id: "tb-1",
          root_source_node_id: "tb-1",
          source_node_ids: ["tb-1"],
          failed_wave_id: "wave-shared",
          failure_kind: "validation_fail",
          failed_acceptance_criteria: ["Criterion A"],
        },
      },
    }),
    makeAutoRepairNode({
      id: "slice-1-bug-loop-1",
      metadata: {
        repair_context: {
          auto_inserted: true,
          primary_source_node_id: "slice-1",
          root_source_node_id: "slice-1",
          source_node_ids: ["slice-1"],
          failed_wave_id: "wave-shared",
          failure_kind: "validation_fail",
          failed_acceptance_criteria: ["Criterion B"],
        },
      },
    }),
  );

  const graph = applyAutomaticBugLoopRepair(recomputeGraphProgression(graphWithRepairs), {
    nodeId: "follow-1",
    primarySourceNodeId: "tb-1",
    sourceNodeIds: ["tb-1", "slice-1"],
    failureKind: "validation_fail",
    failedWaveId: "wave-shared",
    failedAcceptanceCriteria: ["Criterion C"],
    actor: "runner",
    reason: "The failed wave already consumed its repair budget.",
  });

  assert.equal(graph.nodes.filter((node) => node.metadata?.repair_context?.failed_wave_id === "wave-shared").length, 2);
  const decision = graph.progression.repair_decisions.find((entry) => entry.node_id === "tb-1");
  assert.equal(decision.action, "escalate");
  assert.equal(decision.reason_code, "wave_cap_exceeded");
  assert.match(decision.reason, /wave/i);
});
