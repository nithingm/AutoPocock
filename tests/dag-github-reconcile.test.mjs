import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildIssueBodyNodeMarker,
  buildIssueBodyNodeMarkerPattern,
  findMappedIssueNumber,
  reconcileDagToGitHub,
  renderDagGitHubReconciliation,
} from "../scripts/lib/dag-github-reconcile.mjs";

function makeDag() {
  return {
    schema_version: "issue-dag/v2",
    source_prd: "2026-05-14-example.md",
    nodes: [
      { id: "node-1", title: "Establish the tracer bullet", provider_eligible: true },
      { id: "node-2", title: "Sync the rest of the graph", provider_eligible: true },
    ],
  };
}

function trackerProjectionForNode(node) {
  return {
    title: node.title,
    labels: ["ready-for-agent", "enhancement"],
    fields: {
      "Execution Stage": "Ready for Handoff",
      Dependency: "unblocked",
    },
  };
}

test("reconciliation is idempotent on rerun and does not re-create mapped nodes", () => {
  const dag = makeDag();
  const liveIssues = [
    {
      number: 101,
      title: "Establish the tracer bullet",
      body: `${buildIssueBodyNodeMarker("node-1")}\n\nSlice body`,
      labels: ["ready-for-agent", "enhancement"],
      fields: {
        "Execution Stage": "Ready for Handoff",
        Dependency: "unblocked",
      },
    },
    {
      number: 102,
      title: "Sync the rest of the graph",
      body: `${buildIssueBodyNodeMarker("node-2")}\n\nSlice body`,
      labels: ["ready-for-agent", "enhancement"],
      fields: {
        "Execution Stage": "Ready for Handoff",
        Dependency: "unblocked",
      },
    },
  ];

  const first = reconcileDagToGitHub({
    dag,
    liveIssues,
    trackerProjectionForNode,
    now: "2026-05-14T20:00:00.000Z",
  });

  assert.deepEqual(first.actions.create, []);
  assert.equal(first.summary.mapped_nodes, 2);
  assert.equal(findMappedIssueNumber(first, "node-1"), 101);
  assert.equal(findMappedIssueNumber(first, "node-2"), 102);

  const second = reconcileDagToGitHub({
    dag,
    previous: first,
    liveIssues,
    trackerProjectionForNode,
    now: "2026-05-14T20:05:00.000Z",
  });

  assert.deepEqual(second.actions.create, []);
  assert.deepEqual(
    second.actions.noop,
    [
      { node_id: "node-1", issue_number: 101 },
      { node_id: "node-2", issue_number: 102 },
    ],
  );
  assert.deepEqual(second.actions.update, []);
  assert.equal(second.summary.drift_count, 0);
});

test("reconciliation persists mapping and can recover from a stale issue number without creating duplicates", () => {
  const dag = makeDag();
  const previous = {
    mappings: [
      {
        node_id: "node-1",
        issue_number: 999,
        issue_title: "Old issue",
        source: "persisted",
      },
    ],
  };

  const report = reconcileDagToGitHub({
    dag,
    previous,
    liveIssues: [
      {
        number: 201,
        title: "Establish the tracer bullet",
        body: `${buildIssueBodyNodeMarker("node-1")}\n\nRecovered issue`,
        labels: ["ready-for-agent", "enhancement"],
        fields: {
          "Execution Stage": "Ready for Handoff",
          Dependency: "unblocked",
        },
      },
    ],
    trackerProjectionForNode,
    now: "2026-05-14T21:00:00.000Z",
  });

  assert.equal(findMappedIssueNumber(report, "node-1"), 201);
  assert.deepEqual(report.actions.create, [
    { node_id: "node-2", title: "Sync the rest of the graph" },
  ]);
  assert.deepEqual(report.actions.update, [
    { node_id: "node-1", issue_number: 201, reasons: ["mapping_refresh"] },
  ]);
  assert.match(renderDagGitHubReconciliation(report), /missing issue #999/i);
});

test("reconciliation surfaces duplicate matches and tracker drift explicitly", () => {
  const dag = makeDag();
  const report = reconcileDagToGitHub({
    dag,
    liveIssues: [
      {
        number: 301,
        title: "Wrong title",
        body: `${buildIssueBodyNodeMarker("node-1")}\n\nSlice body`,
        labels: ["enhancement"],
        fields: {
          "Execution Stage": "Inbox",
          Dependency: "blocked",
        },
      },
      {
        number: 302,
        title: "Duplicate match",
        body: `${buildIssueBodyNodeMarker("node-1")}\n\nDuplicate`,
        labels: ["ready-for-agent", "enhancement"],
        fields: {
          "Execution Stage": "Ready for Handoff",
          Dependency: "unblocked",
        },
      },
      {
        number: 303,
        title: "Orphaned issue",
        body: `${buildIssueBodyNodeMarker("node-999")}\n\nUnknown node`,
        labels: ["ready-for-agent", "enhancement"],
        fields: {
          "Execution Stage": "Ready for Handoff",
          Dependency: "unblocked",
        },
      },
    ],
    trackerProjectionForNode,
    now: "2026-05-14T22:00:00.000Z",
  });

  assert.deepEqual(report.actions.create, [
    { node_id: "node-1", title: "Establish the tracer bullet" },
    { node_id: "node-2", title: "Sync the rest of the graph" },
  ]);
  assert.equal(report.actions.manual_reconcile.length, 1);
  assert.deepEqual(report.actions.manual_reconcile[0], {
    node_id: "node-1",
    issue_numbers: [301, 302],
    reasons: ["duplicate_live_matches"],
  });
  assert.equal(report.summary.drift_count, 2);
  assert.deepEqual(
    report.drift.map((entry) => entry.category).sort(),
    ["duplicate_live_matches", "unknown_live_node"],
  );
});

test("reconciliation reports title, label, and field drift on a mapped issue", () => {
  const dag = makeDag();
  const report = reconcileDagToGitHub({
    dag,
    liveIssues: [
      {
        number: 401,
        title: "Tracer bullet draft",
        body: `${buildIssueBodyNodeMarker("node-1")}\n\nSlice body`,
        labels: ["enhancement"],
        fields: {
          "Execution Stage": "Inbox",
          Dependency: "blocked",
        },
      },
    ],
    trackerProjectionForNode,
    now: "2026-05-14T23:00:00.000Z",
  });

  assert.equal(findMappedIssueNumber(report, "node-1"), 401);
  assert.deepEqual(report.actions.update, [
    {
      node_id: "node-1",
      issue_number: 401,
      reasons: ["title_drift", "label_drift", "field_drift", "field_drift"],
    },
  ]);
  assert.equal(report.summary.create_count, 1);
  assert.deepEqual(
    report.drift
      .filter((entry) => entry.node_id === "node-1")
      .map((entry) => entry.category)
      .sort(),
    ["field_drift", "field_drift", "label_drift", "title_drift"],
  );
});

test("body marker helpers are stable for synthesis and reconciliation boundaries", () => {
  const marker = buildIssueBodyNodeMarker("node-7");
  const pattern = buildIssueBodyNodeMarkerPattern("node-7");

  assert.equal(marker, "DAG-Node: node-7");
  assert.match(`Header\n${marker}\nFooter`, pattern);
  assert.doesNotMatch("DAG-Node: node-8", pattern);
});
