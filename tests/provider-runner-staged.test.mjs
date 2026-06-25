import assert from "node:assert/strict";
import { test } from "node:test";

import { orchestrateStagedSingleRun } from "../scripts/lib/provider-runner.mjs";
import { createRalphRunState } from "../scripts/lib/ralph-runner.mjs";

function makeDag({ uiExecutionStage = "Ready for Handoff" } = {}) {
  return {
    schema_version: "issue-dag/v1",
    dag_model: "layered-dag/v1",
    dag_id: "dag-55",
    progression: {
      completed_nodes: ["tracer-bullet"],
    },
    nodes: [
      {
        id: "tracer-bullet",
        title: "Tracer bullet",
        layer: "tracer_bullet",
        provider_eligible: true,
        human_gate_required: false,
        execution_eligible: true,
        tracker: {
          execution_stage: "Done",
          dependency_state: "unblocked",
        },
      },
      {
        id: "api-users",
        title: "Implement API users slice",
        layer: "implementation",
        depends_on: ["tracer-bullet"],
        provider_eligible: true,
        human_gate_required: false,
        execution_eligible: true,
        tracker: {
          execution_stage: "Ready for Handoff",
          dependency_state: "unblocked",
        },
      },
      {
        id: "ui-settings",
        title: "Implement UI settings slice",
        layer: "implementation",
        depends_on: ["tracer-bullet"],
        provider_eligible: true,
        human_gate_required: false,
        execution_eligible: true,
        tracker: {
          execution_stage: uiExecutionStage,
          dependency_state: "unblocked",
        },
      },
    ],
  };
}

function makeGraph() {
  return {
    graph_id: "dag-55",
    feature_track: "staged-single-run",
    nodes: [
      {
        id: "tracer-bullet",
        title: "Tracer bullet",
        layer: "tracer_bullet",
        feature_track: "staged-single-run",
        goal: "Unlock the bounded implementation wave.",
        depends_on: [],
        acceptance_criteria: ["Tracer bullet gate is already satisfied."],
        verification_plan: {
          automated: ["node --test tests/provider-runner-staged.test.mjs"],
          manual: [],
          evidence_expected: ["Tracer bullet proof artifact"],
        },
        write_surface: ["scripts/lib/provider-runner.mjs"],
        conflict_surface: "low",
        provider_eligibility: {
          eligible: true,
        },
        human_gate: {
          required: false,
        },
        tracer_bullet: {
          is_tracer_bullet: true,
          gates_deeper_execution: true,
        },
        execution: {
          queue_class: "tracer-bullet",
          parallelizable: false,
          retry_budget: 1,
          stop_conditions: ["Stop when acceptance criteria are satisfied."],
          escalation_rules: ["Escalate if the graph truth drifts."],
        },
        tracker: {
          issue_number: "50",
          labels: ["done"],
          execution_stage: "Done",
          execution_lane: "Done",
          dependency_state: "unblocked",
          conflict_surface: "low",
        },
        state: {
          planning_status: "approved",
          review_status: "approved",
          qa_status: "passed",
          progression_status: "done",
          execution_status: "succeeded",
          validation_status: "passed",
          bug_loop_status: "resolved",
          reclaim_status: "none",
        },
        follow_up: {},
        bug_loop: {},
        metadata: {},
      },
      {
        id: "api-users",
        title: "Implement API users slice",
        layer: "implementation_slice",
        feature_track: "staged-single-run",
        goal: "Implement the bounded API users slice.",
        depends_on: ["tracer-bullet"],
        acceptance_criteria: ["API users slice remains deterministic."],
        verification_plan: {
          automated: ["node --test tests/provider-runner-staged.test.mjs"],
          manual: [],
          evidence_expected: ["Unit and integration output"],
        },
        write_surface: ["scripts/lib/provider-runner.mjs", "tests/provider-runner-staged.test.mjs"],
        conflict_surface: "low",
        provider_eligibility: {
          eligible: true,
          allowed_providers: ["codex"],
        },
        human_gate: {
          required: false,
        },
        tracer_bullet: {},
        execution: {
          queue_class: "routine-afk",
          parallelizable: true,
          retry_budget: 2,
          stop_conditions: ["Acceptance criteria are satisfied."],
          escalation_rules: ["Escalate if scope widens beyond the owned surface."],
        },
        tracker: {
          issue_number: "51",
          labels: ["ready-for-agent"],
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
          validation_status: "pending",
          bug_loop_status: "idle",
          reclaim_status: "none",
        },
        follow_up: {},
        bug_loop: {},
        metadata: {},
      },
      {
        id: "ui-settings",
        title: "Implement UI settings slice",
        layer: "implementation_slice",
        feature_track: "staged-single-run",
        goal: "Implement the bounded UI settings slice.",
        depends_on: ["tracer-bullet"],
        acceptance_criteria: ["UI settings slice remains deterministic."],
        verification_plan: {
          automated: ["node --test tests/provider-runner-staged.test.mjs"],
          manual: [],
          evidence_expected: ["Unit and integration output"],
        },
        write_surface: ["scripts/lib/provider-runner.mjs"],
        conflict_surface: "medium",
        provider_eligibility: {
          eligible: true,
          allowed_providers: ["codex"],
        },
        human_gate: {
          required: false,
        },
        tracer_bullet: {},
        execution: {
          queue_class: "routine-afk",
          parallelizable: true,
          retry_budget: 2,
          stop_conditions: ["Acceptance criteria are satisfied."],
          escalation_rules: ["Escalate if shared contracts drift."],
        },
        tracker: {
          issue_number: "52",
          labels: ["ready-for-agent"],
          execution_stage: "Ready for Handoff",
          execution_lane: "Handoff",
          dependency_state: "unblocked",
          conflict_surface: "medium",
        },
        state: {
          planning_status: "approved",
          review_status: "pending",
          qa_status: "pending",
          progression_status: "planned",
          execution_status: "pending",
          validation_status: "pending",
          bug_loop_status: "idle",
          reclaim_status: "none",
        },
        follow_up: {},
        bug_loop: {},
        metadata: {},
      },
    ],
  };
}

function makeLoopSpecs() {
  return [
    {
      loop_spec_id: "loop-spec-api-users",
      dag_node_id: "api-users",
      title: "Implement API users slice",
      owned_surface: ["scripts/lib/provider-runner.mjs", "tests/provider-runner-staged.test.mjs"],
      verification_plan: {
        automated: ["node --test tests/provider-runner-staged.test.mjs"],
      },
      dependencies: {
        depends_on: ["tracer-bullet"],
        wave: 5,
      },
      source: {
        dag_id: "dag-55",
      },
      execution_contract: {
        provider_eligible: true,
        human_gate_required: false,
      },
    },
    {
      loop_spec_id: "loop-spec-ui-settings",
      dag_node_id: "ui-settings",
      title: "Implement UI settings slice",
      owned_surface: ["scripts/lib/provider-runner.mjs"],
      verification_plan: {
        automated: ["node --test tests/provider-runner-staged.test.mjs"],
      },
      dependencies: {
        depends_on: ["tracer-bullet"],
        wave: 5,
      },
      source: {
        dag_id: "dag-55",
      },
      execution_contract: {
        provider_eligible: true,
        human_gate_required: false,
      },
    },
  ];
}

function makeApprovedBundle() {
  return {
    schema_version: "wave-approval-bundle/v1",
    approval_unit: "wave-bundle",
    wave: {
      wave_id: "wave-5",
      parallel: true,
      selected_node_ids: ["api-users", "ui-settings"],
    },
    approval: {
      status: "approved",
      approved_by: "solo-operator",
      approved_at: "2026-05-15T16:00:00.000Z",
      unit: "wave-bundle",
    },
    artifacts: {
      bundle_json_path: "docs/agents/approvals/wave-5.json",
      bundle_markdown_path: "docs/agents/approvals/wave-5.md",
    },
    selected_nodes: [
      {
        issue_id: "51",
        dag_node_id: "api-users",
        title: "Implement API users slice",
        loop_spec: makeLoopSpecs()[0],
      },
      {
        issue_id: "52",
        dag_node_id: "ui-settings",
        title: "Implement UI settings slice",
        loop_spec: makeLoopSpecs()[1],
      },
    ],
  };
}

function makeReconciliation() {
  return {
    mappings: [
      { node_id: "api-users", issue_number: 51 },
      { node_id: "ui-settings", issue_number: 52 },
    ],
    drift: [],
  };
}

function makePlan() {
  return {
    schema_version: "ralph-run-plan/v1",
    plan_id: "plan-55",
    parent_issue: "55",
    control_policy: {
      approval_unit: "wave-bundle",
      shared_foundation_triggers: [
        "unstable shared contracts",
        "broken global build or runtime environment",
      ],
    },
    waves: [
      {
        wave_id: "wave-5",
        parallel: true,
        issues: [
          {
            issue_id: "51",
            title: "Implement API users slice",
            worker_mode: "parallel-worker-a",
            retry_budget: 2,
            verification_shape: ["node --test tests/provider-runner-staged.test.mjs"],
            dag_node_id: "api-users",
          },
          {
            issue_id: "52",
            title: "Implement UI settings slice",
            worker_mode: "parallel-worker-b",
            retry_budget: 2,
            verification_shape: ["node --test tests/provider-runner-staged.test.mjs"],
            dag_node_id: "ui-settings",
          },
        ],
      },
    ],
  };
}

function makePassingEvidence() {
  return {
    changed_outputs: ["scripts/lib/provider-runner.mjs"],
    verification_commands: ["node --test tests/provider-runner-staged.test.mjs"],
    verification_results: ["provider-runner staged tests passed"],
    acceptance_criteria_evidence: [
      {
        criterion: "API users slice remains deterministic.",
        evidence: "The staged runner advanced through validation, review, and QA.",
      },
    ],
    test_evidence: [
      { dimension: "unit", status: "pass", summary: "provider-runner staged tests passed" },
      { dimension: "integration", status: "pass", summary: "staged integration proof passed" },
    ],
  };
}

function makeFailingEvidence() {
  return {
    changed_outputs: ["scripts/lib/provider-runner.mjs"],
    verification_commands: ["node --test tests/provider-runner-staged.test.mjs"],
    verification_results: ["provider-runner staged unit checks passed but integration proof failed"],
    acceptance_criteria_evidence: [
      {
        criterion: "API users slice remains deterministic.",
        evidence: "Unit behavior passed while the broader staged proof regressed.",
      },
    ],
    test_evidence: [
      { dimension: "unit", status: "pass", summary: "provider-runner staged unit checks passed" },
      { dimension: "integration", status: "fail", summary: "staged integration proof regressed" },
    ],
  };
}

test("orchestrateStagedSingleRun preserves deterministic state when preflight withholds one approved bundle node", () => {
  const plan = makePlan();
  const state = createRalphRunState(plan);

  const run = orchestrateStagedSingleRun({
    dag: makeDag({ uiExecutionStage: "In Progress" }),
    approvedBundle: makeApprovedBundle(),
    reconciliation: makeReconciliation(),
    loopSpecs: makeLoopSpecs(),
    plan,
    state,
    nodeId: "ui-settings",
    issueId: "52",
    actor: "runner-55",
  });

  assert.equal(run.stages.preflight.status, "withheld");
  assert.deepEqual(run.stages.intake.selected_node_ids, ["api-users"]);
  assert.deepEqual(run.stages.intake.withheld_node_ids, ["ui-settings"]);
  assert.match(run.stages.preflight.durable_reasons.join(" "), /tracker state is not ready/i);
  assert.equal(run.artifacts.state.issue_states["52"].status, "blocked");
  assert.equal(run.artifacts.state.wave_approvals["wave-5"].status, "approved");
});

test("orchestrateStagedSingleRun advances a launchable node through execution, validation, review, QA, and completion", () => {
  const plan = makePlan();
  const state = createRalphRunState(plan);

  const run = orchestrateStagedSingleRun({
    dag: makeDag(),
    approvedBundle: makeApprovedBundle(),
    reconciliation: makeReconciliation(),
    loopSpecs: makeLoopSpecs(),
    graph: makeGraph(),
    plan,
    state,
    nodeId: "api-users",
    issueId: "51",
    actor: "runner-55",
    executionResult: {
      executionOutcome: "succeeded",
      completionEvidence: makePassingEvidence(),
      reviewOutcome: "approved",
      qaOutcome: "passed",
      reason: "Tracer-bullet staged run completed cleanly.",
    },
  });

  assert.equal(run.stages.preflight.status, "launchable");
  assert.equal(run.stages.execution.status, "succeeded");
  assert.equal(run.stages.progression.status, "done");
  assert.equal(run.artifacts.graph.nodes.find((node) => node.id === "api-users").state.progression_status, "done");
  assert.equal(run.artifacts.state.issue_states["51"].status, "completed");
  assert.equal(run.artifacts.state.global.status, "active");
});

test("orchestrateStagedSingleRun composes repair insertion into a branch-local pause when validation fails inside the staged path", () => {
  const plan = makePlan();
  const state = createRalphRunState(plan);

  const run = orchestrateStagedSingleRun({
    dag: makeDag(),
    approvedBundle: makeApprovedBundle(),
    reconciliation: makeReconciliation(),
    loopSpecs: makeLoopSpecs(),
    graph: makeGraph(),
    plan,
    state,
    nodeId: "api-users",
    issueId: "51",
    actor: "runner-55",
    executionResult: {
      executionOutcome: "succeeded",
      completionEvidence: makeFailingEvidence(),
      reason: "Validation drifted after execution.",
      repair: {
        failureKind: "validation_fail",
        failedWaveId: "wave-5",
        failedAcceptanceCriteria: ["API users slice remains deterministic."],
      },
    },
  });

  const repairNode = run.artifacts.graph.nodes.find((node) => node.id === "api-users-bug-loop-1");
  assert.ok(repairNode);
  assert.equal(repairNode.state.progression_status, "ready_for_handoff");
  assert.equal(run.stages.progression.repair_decision.action, "create_repair_node");
  assert.equal(run.stages.failure_policy.decision_scope, "branch_local_pause");
  assert.equal(run.artifacts.state.issue_states["51"].status, "blocked");
  assert.equal(run.artifacts.state.global.status, "active");
});

test("orchestrateStagedSingleRun freezes the run when execution failure matches a shared-foundation trigger", () => {
  const plan = makePlan();
  const state = createRalphRunState(plan);

  const run = orchestrateStagedSingleRun({
    dag: makeDag(),
    approvedBundle: makeApprovedBundle(),
    reconciliation: makeReconciliation(),
    loopSpecs: makeLoopSpecs(),
    graph: makeGraph(),
    plan,
    state,
    nodeId: "ui-settings",
    issueId: "52",
    actor: "runner-55",
    executionResult: {
      executionOutcome: "blocked",
      reason: "Shared API contract drift invalidated the approved bundle assumptions.",
      failurePolicy: {
        reason_code: "unstable_shared_contracts",
        shared_foundation_kind: "unstable shared contracts",
        reason: "Shared API contract drift invalidated the approved bundle assumptions.",
      },
    },
  });

  assert.equal(run.stages.failure_policy.decision_scope, "full_run_freeze");
  assert.equal(run.stages.failure_policy.global_status, "frozen");
  assert.equal(run.artifacts.state.global.reason_code, "unstable_shared_contracts");
  assert.equal(run.artifacts.state.issue_states["52"].decision_scope, "full_run_freeze");
});
