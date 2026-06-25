import assert from "node:assert/strict";
import { test } from "node:test";
import {
  renderDagNodeIssueBody,
  synthesizeDagNodeIssuePayload,
  synthesizeDagToGithubPreview,
  synthesizeProjectFields,
} from "../scripts/lib/dag-github-sync.mjs";

function sampleDag() {
  return {
    source_prd: "2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md",
    nodes: [
      {
        id: "node-2",
        title: "Sync dependent implementation issue",
        type: "implementation",
        actionable: true,
        actionable_type: "implementation",
        topological_index: 2,
        tracker_identity: {
          graph_node_id: "node-2",
          graph_issue_key: "feature/node-2",
        },
        goal: "Create a runnable GitHub issue payload for a dependent DAG node.",
        depends_on: ["node-1"],
        acceptance_criteria: [
          "Issue bodies include deterministic execution metadata.",
          "Project fields reflect blocked dependency state.",
        ],
        verification_plan: {
          automated: ["node --test tests/dag-github-sync.test.mjs"],
          manual: ["Inspect the dry-run preview before live tracker mutation."],
        },
        write_surface: ["scripts/lib/dag-github-sync.mjs", "tests/dag-github-sync.test.mjs"],
        risk: "low",
        conflict_surface: "low",
        provider_eligible: true,
        human_gate_required: false,
        review_status: "pending",
        qa_status: "pending",
        status: "blocked_dependency",
        conflict_reasoning: "Node remains blocked until the tracer bullet establishes the graph sync contract.",
      },
      {
        id: "node-1",
        title: "Establish DAG-to-GitHub tracer bullet",
        type: "foundation",
        actionable: true,
        actionable_type: "investigation",
        topological_index: 1,
        tracker_identity: {
          graph_node_id: "node-1",
          graph_issue_key: "feature/node-1",
        },
        goal: "Prove one end-to-end dry-run issue synthesis path from a DAG node.",
        depends_on: [],
        acceptance_criteria: [
          "Render deterministic issue bodies from DAG nodes.",
          "Render required project fields for scheduler-ready tracker state.",
        ],
        verification_plan: {
          automated: ["node --test tests/dag-github-sync.test.mjs"],
          manual: ["Inspect the synthesized tracer-bullet issue payload."],
        },
        write_surface: ["scripts/lib/dag-github-sync.mjs"],
        risk: "medium",
        conflict_surface: "medium",
        provider_eligible: true,
        human_gate_required: false,
        review_status: "pending",
        qa_status: "pending",
        status: "ready_for_handoff",
        conflict_reasoning: "This node owns the initial sync contract and should run first.",
      },
      {
        id: "node-3",
        title: "Add manual approval step for tracker exceptions",
        type: "human-gated",
        actionable: true,
        actionable_type: "hitl",
        topological_index: 3,
        tracker_identity: {
          graph_node_id: "node-3",
          graph_issue_key: "feature/node-3",
        },
        goal: "Document the human path for tracker exceptions.",
        depends_on: ["node-1"],
        acceptance_criteria: ["Human-gated nodes synthesize to ready-for-human issues."],
        verification_plan: {
          automated: [],
          manual: ["Confirm issue payload requests human handling."],
        },
        write_surface: ["docs/agents/**"],
        risk: "medium",
        conflict_surface: "none",
        provider_eligible: false,
        human_gate_required: true,
        review_status: "pending",
        qa_status: "pending",
        status: "blocked_human_gate",
        conflict_reasoning: "Tracker exceptions require explicit human approval before dispatch.",
      },
    ],
  };
}

test("renderDagNodeIssueBody produces a deterministic issue body from a DAG node contract", () => {
  const dag = sampleDag();
  const node = dag.nodes[1];

  const body = renderDagNodeIssueBody({ dag, node });

  assert.equal(body, `# Establish DAG-to-GitHub tracer bullet

## Goal

- Prove one end-to-end dry-run issue synthesis path from a DAG node.

## Node Contract

- DAG node: node-1
- Node type: foundation
- Actionable type: investigation
- Queue class: tracer-bullet
- Provider eligible: yes
- Human gate required: no
- Risk: medium
- Conflict surface: medium
- Source PRD: 2026-05-14-dag-driven-github-issue-synthesis-and-ralph-orchestration.md

## Dependencies

- Unblocked within the current DAG.

## Acceptance Criteria

- Render deterministic issue bodies from DAG nodes.
- Render required project fields for scheduler-ready tracker state.

## Verification

### Automated

- node --test tests/dag-github-sync.test.mjs

### Manual

- Inspect the synthesized tracer-bullet issue payload.

## Execution Metadata

- Write surface: scripts/lib/dag-github-sync.mjs
- Review status: pending
- QA status: pending
- Conflict reasoning: This node owns the initial sync contract and should run first.
`);
});

test("synthesizeProjectFields maps DAG node state into required GitHub project fields", () => {
  const dag = sampleDag();
  const tracerFields = synthesizeProjectFields({ dag, node: dag.nodes[1] });
  const humanFields = synthesizeProjectFields({ dag, node: dag.nodes[2] });

  assert.deepEqual(tracerFields, {
    "Execution Stage": "Ready for Handoff",
    "Execution Lane": "Handoff",
    "Queue Class": "tracer-bullet",
    "Risk": "medium",
    "Dependency": "unblocked",
    "Conflict Surface": "medium",
    "Feature Track": "dag-driven-github-issue-synthesis-and-ralph-orchestration",
    "Dispatch ID": "",
  });

  assert.deepEqual(humanFields, {
    "Execution Stage": "Ready for Handoff",
    "Execution Lane": "Handoff",
    "Queue Class": "hitl",
    "Risk": "medium",
    "Dependency": "blocked",
    "Conflict Surface": "none",
    "Feature Track": "dag-driven-github-issue-synthesis-and-ralph-orchestration",
    "Dispatch ID": "",
  });
});

test("synthesizeDagToGithubPreview stays dry-run-first and sorts issues deterministically", () => {
  const dag = sampleDag();

  const preview = synthesizeDagToGithubPreview(dag);

  assert.equal(preview.mode, "dry-run");
  assert.equal(preview.feature_track, "dag-driven-github-issue-synthesis-and-ralph-orchestration");
  assert.deepEqual(preview.issues.map((issue) => issue.node_id), ["node-1", "node-2", "node-3"]);
  assert.deepEqual(preview.issues[0], synthesizeDagNodeIssuePayload({ dag, node: dag.nodes[1] }));
  assert.deepEqual(preview.issues[2].labels, ["enhancement", "ready-for-human"]);
  assert.equal(preview.issues[1].project_fields.Dependency, "blocked");
});

test("synthesizeDagNodeIssuePayload preserves graph identity and actionable type for tracker mapping", () => {
  const dag = sampleDag();
  const payload = synthesizeDagNodeIssuePayload({ dag, node: dag.nodes[1] });

  assert.equal(payload.node_id, "node-1");
  assert.equal(payload.actionable_type, "investigation");
  assert.equal(payload.topological_index, 1);
  assert.deepEqual(payload.tracker_identity, {
    graph_node_id: "node-1",
    graph_issue_key: "feature/node-1",
  });
  assert.match(payload.body, /- DAG node: node-1/);
  assert.match(payload.body, /- Actionable type: investigation/);
});
