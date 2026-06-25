import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTracerBulletLaunchPlan,
  preflightApprovedWaveBundle,
  planDagExecutionWave,
  selectTracerBulletWave,
} from "../scripts/lib/dag-wave-orchestrator.mjs";

function makeDag() {
  return {
    schema_version: "issue-dag/v1",
    dag_model: "layered-dag/v1",
    dag_id: "dag-41",
    feature_track: "graph-orchestration",
    progression: {
      completed_nodes: [],
    },
    nodes: [
      {
        id: "tracer-bullet-a",
        title: "Tracer bullet A",
        layer: "tracer_bullet",
        layer_index: 1,
        queue_class: "tracer-bullet",
        feature_track: "graph-orchestration",
        provider_eligible: true,
        human_gate_required: false,
        execution_eligible: true,
        tracker: {
          execution_stage: "Ready for Handoff",
          dependency_state: "unblocked",
        },
      },
      {
        id: "tracer-bullet-b",
        title: "Tracer bullet B",
        layer: "tracer_bullet",
        layer_index: 1,
        queue_class: "tracer-bullet",
        feature_track: "graph-orchestration",
        provider_eligible: true,
        human_gate_required: false,
        execution_eligible: false,
        execution_eligibility_reasons: ["ambiguity score is too high"],
        tracker: {
          execution_stage: "Ready for Handoff",
          dependency_state: "unblocked",
        },
      },
      {
        id: "implementation-a",
        title: "Implementation A",
        layer: "implementation",
        layer_index: 2,
        queue_class: "routine-afk",
        depends_on: ["tracer-bullet-a"],
        provider_eligible: true,
        human_gate_required: false,
        execution_eligible: true,
        tracker: {
          execution_stage: "Ready for Handoff",
          dependency_state: "unblocked",
        },
      },
    ],
  };
}

function makeReconciliation() {
  return {
    mappings: [
      { node_id: "tracer-bullet-a", issue_number: 101 },
      { node_id: "tracer-bullet-b", issue_number: 102 },
      { node_id: "implementation-a", issue_number: 103 },
    ],
    drift: [],
  };
}

function makeLoopSpecs() {
  return [
    {
      loop_spec_id: "loop-spec-tracer-a",
      dag_node_id: "tracer-bullet-a",
      title: "Tracer bullet A",
      owned_surface: ["scripts/lib/dag-wave-orchestrator.mjs"],
      verification_plan: {
        automated: ["node --test tests/dag-wave-orchestrator.test.mjs"],
      },
      dependencies: {
        depends_on: [],
        wave: 1,
      },
      completion_contract: {
        completion_report_target: "docs/agents/completions/dispatch-41-a.md",
      },
      execution_contract: {
        stop_conditions: ["Stop when the tracer bullet proof is demonstrated."],
        escalation_rules: ["Escalate when the wave would widen beyond the bounded slice."],
      },
      tracer_bullet: {
        queue_class: "tracer-bullet",
        feature_track: "graph-orchestration",
      },
    },
    {
      loop_spec_id: "loop-spec-tracer-b",
      dag_node_id: "tracer-bullet-b",
      title: "Tracer bullet B",
      owned_surface: ["scripts/lib/dag-wave-orchestrator.mjs"],
      verification_plan: {
        automated: ["node --test tests/dag-wave-orchestrator.test.mjs"],
      },
      dependencies: {
        depends_on: [],
        wave: 1,
      },
      completion_contract: {
        completion_report_target: "docs/agents/completions/dispatch-41-b.md",
      },
      execution_contract: {
        stop_conditions: ["Stop when the tracer bullet proof is demonstrated."],
        escalation_rules: ["Escalate on ambiguity."],
      },
      tracer_bullet: {
        queue_class: "tracer-bullet",
        feature_track: "graph-orchestration",
      },
    },
  ];
}

test("selectTracerBulletWave picks execution-eligible mapped tracer bullets before deeper layers", () => {
  const wave = selectTracerBulletWave({
    dag: makeDag(),
    reconciliation: makeReconciliation(),
    loopSpecs: makeLoopSpecs(),
  });

  assert.equal(wave.policy, "tracer-bullet-first");
  assert.deepEqual(wave.runnable.map((entry) => entry.node_id), ["tracer-bullet-a"]);
  assert.deepEqual(wave.blocked, [
    {
      node_id: "tracer-bullet-b",
      reasons: ["ambiguity score is too high"],
    },
  ]);
});

test("selectTracerBulletWave rejects nodes with blocking dependency or reconciliation state", () => {
  const dag = makeDag();
  dag.nodes[0].depends_on = ["missing-dependency"];

  const reconciliation = makeReconciliation();
  reconciliation.drift = [
    {
      category: "missing_mapped_issue",
      node_id: "tracer-bullet-a",
      message: "Persisted mapping for tracer-bullet-a points to missing issue #101.",
    },
  ];

  const wave = selectTracerBulletWave({
    dag,
    reconciliation,
    loopSpecs: makeLoopSpecs(),
  });

  assert.deepEqual(wave.runnable, []);
  assert.deepEqual(wave.blocked, [
    {
      node_id: "tracer-bullet-a",
      reasons: [
        "Unmet dependencies: missing-dependency",
        "Persisted mapping for tracer-bullet-a points to missing issue #101.",
      ],
    },
    {
      node_id: "tracer-bullet-b",
      reasons: ["ambiguity score is too high"],
    },
  ]);
});

test("buildTracerBulletLaunchPlan compiles one bounded Ralph-loop launch from graph semantics", () => {
  const launchPlan = buildTracerBulletLaunchPlan({
    dag: makeDag(),
    reconciliation: makeReconciliation(),
    loopSpecs: makeLoopSpecs(),
    claimedBy: "runner-41",
    isolationMode: "worktree",
    maxNodes: 1,
  });

  assert.equal(launchPlan.bounded, true);
  assert.equal(launchPlan.launches.length, 1);
  assert.deepEqual(launchPlan.selected_wave.runnable_node_ids, ["tracer-bullet-a"]);
  assert.equal(launchPlan.launches[0].issue_number, 101);
  assert.equal(launchPlan.launches[0].loop_spec_id, "loop-spec-tracer-a");
  assert.equal(launchPlan.launches[0].claimed_by, "runner-41");
  assert.equal(launchPlan.launches[0].isolation_mode, "worktree");
  assert.deepEqual(launchPlan.launches[0].owned_surface, [
    "scripts/lib/dag-wave-orchestrator.mjs",
  ]);
  assert.deepEqual(launchPlan.launches[0].verification_commands, [
    "node --test tests/dag-wave-orchestrator.test.mjs",
  ]);
  assert.deepEqual(launchPlan.launches[0].stop_conditions, [
    "Stop when the tracer bullet proof is demonstrated.",
  ]);
});

function makeWavePlanningDag() {
  return {
    schema_version: "issue-dag/v1",
    dag_model: "layered-dag/v1",
    dag_id: "dag-48",
    feature_track: "wave-planning",
    topological_order: [
      "initiative",
      "tracer-bullet",
      "api-users",
      "ui-settings",
      "schema-migration",
      "integration-tests",
    ],
    progression: {
      completed_nodes: ["tracer-bullet"],
    },
    nodes: [
      {
        id: "initiative",
        title: "Initiative",
        layer: "initiative",
        actionable: false,
        topological_index: 0,
        depends_on: [],
      },
      {
        id: "tracer-bullet",
        title: "Tracer bullet",
        layer: "tracer_bullet",
        tracer_bullet: true,
        actionable: true,
        topological_index: 1,
        depends_on: [],
        provider_eligible: true,
        human_gate_required: false,
        execution: {
          parallelizable: false,
        },
      },
      {
        id: "api-users",
        title: "Implement API users slice",
        layer: "implementation",
        actionable: true,
        actionable_type: "implementation",
        topological_index: 2,
        depends_on: ["tracer-bullet"],
        write_surface: ["api/users/**"],
        provider_eligible: true,
        human_gate_required: false,
        execution_eligible: true,
        execution: {
          parallelizable: true,
        },
        tracker: {
          execution_stage: "Ready for Handoff",
          dependency_state: "unblocked",
        },
        dependency_unlock_value: 3,
        estimated_review_cost: 3,
      },
      {
        id: "ui-settings",
        title: "Implement UI settings slice",
        layer: "implementation",
        actionable: true,
        actionable_type: "implementation",
        topological_index: 3,
        depends_on: ["tracer-bullet"],
        write_surface: ["ui/settings/**"],
        provider_eligible: true,
        human_gate_required: false,
        execution_eligible: true,
        execution: {
          parallelizable: true,
        },
        tracker: {
          execution_stage: "Ready for Handoff",
          dependency_state: "unblocked",
        },
        dependency_unlock_value: 1,
        estimated_review_cost: 2,
      },
      {
        id: "schema-migration",
        title: "Add schema migration",
        layer: "implementation",
        actionable: true,
        actionable_type: "implementation",
        topological_index: 4,
        depends_on: ["tracer-bullet"],
        write_surface: ["db/schema/**", "migrations/**"],
        provider_eligible: true,
        human_gate_required: false,
        execution_eligible: true,
        execution: {
          parallelizable: true,
        },
        tracker: {
          execution_stage: "Ready for Handoff",
          dependency_state: "unblocked",
        },
        dependency_unlock_value: 2,
        estimated_review_cost: 5,
      },
      {
        id: "integration-tests",
        title: "Add integration tests",
        layer: "implementation",
        actionable: true,
        actionable_type: "implementation",
        topological_index: 5,
        depends_on: ["api-users", "ui-settings"],
        write_surface: ["tests/integration/**"],
        provider_eligible: true,
        human_gate_required: false,
        execution_eligible: true,
        execution: {
          parallelizable: true,
        },
        tracker: {
          execution_stage: "Ready for Handoff",
          dependency_state: "blocked",
        },
        dependency_unlock_value: 0,
        estimated_review_cost: 2,
      },
    ],
    edges: [
      { from: "tracer-bullet", to: "api-users" },
      { from: "tracer-bullet", to: "ui-settings" },
      { from: "tracer-bullet", to: "schema-migration" },
      { from: "api-users", to: "integration-tests" },
      { from: "ui-settings", to: "integration-tests" },
    ],
  };
}

test("planDagExecutionWave computes the topological ready frontier and keeps safe parallel nodes together", () => {
  const plan = planDagExecutionWave({
    dag: makeWavePlanningDag(),
    maxParallel: 2,
  });

  assert.equal(plan.policy, "topological-frontier-write-surface");
  assert.deepEqual(plan.ready_frontier.map((entry) => entry.node_id), [
    "api-users",
    "schema-migration",
    "ui-settings",
  ]);
  assert.deepEqual(plan.selected_wave.runnable_node_ids, ["api-users", "ui-settings"]);
  assert.deepEqual(plan.selected_wave.blocked_node_ids, ["schema-migration", "integration-tests"]);
  assert.deepEqual(plan.selected_wave.parallelizable_node_ids, ["api-users", "ui-settings"]);
});

test("planDagExecutionWave applies strict shared-foundation surfaces and defers those nodes when safe peers exist", () => {
  const plan = planDagExecutionWave({
    dag: makeWavePlanningDag(),
    maxParallel: 3,
  });

  const schemaNode = plan.ready_frontier.find((entry) => entry.node_id === "schema-migration");
  assert.deepEqual(schemaNode.normalized_write_surfaces, [
    "foundation:db/schema",
    "foundation:db/migrations",
  ]);
  assert.equal(schemaNode.parallel_safety_mode, "exclusive-foundation");

  const deferred = plan.deferred.find((entry) => entry.node_id === "schema-migration");
  assert.match(deferred.reasons.join(" "), /strict foundation surface/i);
  assert.deepEqual(plan.selected_wave.runnable_node_ids, ["api-users", "ui-settings"]);
});

test("planDagExecutionWave can select an exclusive foundation node when it is the only ready work", () => {
  const dag = makeWavePlanningDag();
  dag.progression.completed_nodes = ["tracer-bullet", "api-users", "ui-settings"];
  dag.nodes.find((node) => node.id === "integration-tests").tracker.dependency_state = "blocked";

  const plan = planDagExecutionWave({
    dag,
    maxParallel: 2,
  });

  assert.deepEqual(plan.ready_frontier.map((entry) => entry.node_id), ["schema-migration"]);
  assert.deepEqual(plan.selected_wave.runnable_node_ids, ["schema-migration"]);
  assert.deepEqual(plan.selected_wave.parallelizable_node_ids, []);
});

function makeApprovedWaveBundle() {
  return {
    schema_version: "wave-approval-bundle/v1",
    approval_unit: "wave-bundle",
    source_plan_path: "docs/agents/loop-specs/plan-51.json",
    wave: {
      wave_id: "wave-5",
      parallel: true,
      selected_node_ids: ["api-users", "ui-settings"],
    },
    approval: {
      status: "approved",
      approved_by: "solo-operator",
      approved_at: "2026-05-15T15:00:00.000Z",
      unit: "wave-bundle",
    },
    selected_nodes: [
      {
        issue_id: "51",
        dag_node_id: "api-users",
        title: "Implement API users slice",
        depends_on: ["tracer-bullet"],
        loop_spec: {
          loop_spec_id: "loop-spec-api-users",
          goal: "Implement the API users slice.",
          owned_surface: ["api/users/**"],
          verification_plan: {
            automated: ["node --test tests/dag-wave-orchestrator.test.mjs"],
          },
          execution_contract: {
            provider_eligible: true,
            human_gate_required: false,
            stop_conditions: ["Stop when API users acceptance checks are green."],
            escalation_rules: ["Escalate if the API users slice widens beyond its owned surface."],
          },
          dependencies: {
            depends_on: ["tracer-bullet"],
            wave: 5,
          },
          source: {
            dag_id: "dag-48",
          },
        },
      },
      {
        issue_id: "52",
        dag_node_id: "ui-settings",
        title: "Implement UI settings slice",
        depends_on: ["tracer-bullet"],
        loop_spec: {
          loop_spec_id: "loop-spec-ui-settings",
          goal: "Implement the UI settings slice.",
          owned_surface: ["ui/settings/**"],
          verification_plan: {
            automated: ["node --test tests/dag-wave-orchestrator.test.mjs"],
          },
          execution_contract: {
            provider_eligible: true,
            human_gate_required: false,
            stop_conditions: ["Stop when UI settings acceptance checks are green."],
            escalation_rules: ["Escalate if the UI settings slice widens beyond its owned surface."],
          },
          dependencies: {
            depends_on: ["tracer-bullet"],
            wave: 5,
          },
          source: {
            dag_id: "dag-48",
          },
        },
      },
    ],
  };
}

test("preflightApprovedWaveBundle marks the whole approved bundle feasible when graph, reconciliation, and loop specs agree", () => {
  const dag = makeWavePlanningDag();
  const bundle = makeApprovedWaveBundle();
  const reconciliation = {
    mappings: [
      { node_id: "api-users", issue_number: 151 },
      { node_id: "ui-settings", issue_number: 152 },
    ],
    drift: [],
  };
  const loopSpecs = bundle.selected_nodes.map((entry) => ({
    ...entry.loop_spec,
    dag_node_id: entry.dag_node_id,
  }));

  const preflight = preflightApprovedWaveBundle({
    dag,
    approvedBundle: bundle,
    reconciliation,
    loopSpecs,
  });

  assert.equal(preflight.schema_version, "dag-wave-preflight/v1");
  assert.equal(preflight.wave_id, "wave-5");
  assert.equal(preflight.summary.split_required, false);
  assert.equal(preflight.summary.feasible_count, 2);
  assert.equal(preflight.summary.infeasible_count, 0);
  assert.deepEqual(preflight.launchable.node_ids, ["api-users", "ui-settings"]);
  assert.deepEqual(preflight.withheld, []);
  assert.deepEqual(preflight.reconciled_wave.selected_node_ids, ["api-users", "ui-settings"]);
});

test("preflightApprovedWaveBundle withholds only the infeasible node and dynamically splits the approved wave", () => {
  const dag = makeWavePlanningDag();
  dag.nodes.find((node) => node.id === "ui-settings").tracker.execution_stage = "In Progress";
  const bundle = makeApprovedWaveBundle();
  const reconciliation = {
    mappings: [
      { node_id: "api-users", issue_number: 151 },
      { node_id: "ui-settings", issue_number: 152 },
    ],
    drift: [],
  };
  const loopSpecs = bundle.selected_nodes.map((entry) => ({
    ...entry.loop_spec,
    dag_node_id: entry.dag_node_id,
  }));

  const preflight = preflightApprovedWaveBundle({
    dag,
    approvedBundle: bundle,
    reconciliation,
    loopSpecs,
  });

  assert.equal(preflight.summary.split_required, true);
  assert.deepEqual(preflight.launchable.node_ids, ["api-users"]);
  assert.deepEqual(preflight.reconciled_wave.selected_node_ids, ["api-users"]);
  assert.deepEqual(preflight.reconciled_wave.withheld_node_ids, ["ui-settings"]);
  assert.deepEqual(preflight.withheld, [
    {
      node_id: "ui-settings",
      issue_number: 152,
      loop_spec_id: "loop-spec-ui-settings",
      durable_reasons: ["Tracker state is not ready for orchestration."],
    },
  ]);
});

test("preflightApprovedWaveBundle emits durable reasons when loop-spec and reconciliation contracts make one node infeasible", () => {
  const dag = makeWavePlanningDag();
  const bundle = makeApprovedWaveBundle();
  bundle.selected_nodes[1].loop_spec.dependencies.depends_on = ["tracer-bullet", "missing-contract-node"];
  const reconciliation = {
    mappings: [
      { node_id: "api-users", issue_number: 151 },
    ],
    drift: [
      {
        category: "missing_mapped_issue",
        node_id: "ui-settings",
        message: "Persisted mapping for ui-settings points to missing issue #152.",
      },
    ],
  };
  const loopSpecs = bundle.selected_nodes.map((entry) => ({
    ...entry.loop_spec,
    dag_node_id: entry.dag_node_id,
  }));

  const preflight = preflightApprovedWaveBundle({
    dag,
    approvedBundle: bundle,
    reconciliation,
    loopSpecs,
  });

  assert.equal(preflight.summary.split_required, true);
  assert.deepEqual(preflight.launchable.node_ids, ["api-users"]);
  assert.deepEqual(preflight.withheld, [
    {
      node_id: "ui-settings",
      issue_number: null,
      loop_spec_id: "loop-spec-ui-settings",
      durable_reasons: [
        "Node is not mapped to a synchronized GitHub issue.",
        "Persisted mapping for ui-settings points to missing issue #152.",
        "Loop Spec dependency contract diverges from the DAG: missing-contract-node.",
      ],
    },
  ]);
});
