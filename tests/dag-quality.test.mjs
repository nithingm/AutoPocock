import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeDagNodeQuality,
  analyzeDagQuality,
  enrichDagWithQuality,
} from "../scripts/lib/dag-quality.mjs";

function makeNode(overrides = {}) {
  return {
    id: "node-1",
    title: "Implement bounded graph quality analysis",
    goal: "Score DAG nodes for ambiguity and execution readiness.",
    acceptance_criteria: [
      "Emit deterministic quality classifications.",
      "Mark only bounded nodes eligible for AFK execution.",
    ],
    verification_plan: {
      automated: ["node --test tests/dag-quality.test.mjs"],
      manual: ["Inspect the produced quality object for machine-readable reasons."],
    },
    write_surface: ["scripts/lib/dag-quality.mjs", "tests/dag-quality.test.mjs"],
    provider_eligible: true,
    human_gate_required: false,
    ...overrides,
  };
}

test("analyzeDagNodeQuality marks a bounded node eligible", () => {
  const result = analyzeDagNodeQuality(makeNode());

  assert.equal(result.ambiguity.level, "low");
  assert.equal(result.oversize_risk.level, "low");
  assert.equal(result.ownership_strength.level, "strong");
  assert.equal(result.execution_eligibility.status, "eligible");
  assert.deepEqual(result.execution_eligibility.reasons, []);
});

test("analyzeDagNodeQuality marks ambiguous nodes ineligible", () => {
  const result = analyzeDagNodeQuality(
    makeNode({
      title: "TBD",
      goal: "Somehow handle the thing later.",
      acceptance_criteria: [],
      verification_plan: { automated: [], manual: [] },
    }),
  );

  assert.equal(result.ambiguity.level, "high");
  assert.equal(result.execution_eligibility.status, "ineligible");
  assert.match(result.execution_eligibility.reasons.join(" | "), /ambiguity score is too high/);
});

test("analyzeDagNodeQuality marks oversized repo-wide nodes ineligible", () => {
  const result = analyzeDagNodeQuality(
    makeNode({
      title: "Implement exhaustive platform-wide end-to-end rewrite",
      goal: "Touch everything required across the entire system.",
      acceptance_criteria: [
        "Condition 1",
        "Condition 2",
        "Condition 3",
        "Condition 4",
        "Condition 5",
        "Condition 6",
      ],
      write_surface: ["**", "scripts/**", "docs/**", "tests/**", "apps/**"],
    }),
  );

  assert.equal(result.oversize_risk.level, "high");
  assert.equal(result.ownership_strength.level, "weak");
  assert.equal(result.execution_eligibility.status, "ineligible");
  assert.match(result.execution_eligibility.reasons.join(" | "), /oversize risk is too high/);
  assert.match(result.execution_eligibility.reasons.join(" | "), /ownership boundary is too weak/);
});

test("analyzeDagNodeQuality blocks nodes that require human gating", () => {
  const result = analyzeDagNodeQuality(
    makeNode({
      human_gate_required: true,
    }),
  );

  assert.equal(result.execution_eligibility.status, "ineligible");
  assert.match(result.execution_eligibility.reasons.join(" | "), /human gate approval/);
});

test("analyzeDagQuality summarizes eligible and ineligible nodes", () => {
  const dag = {
    nodes: [
      makeNode({ id: "node-1" }),
      makeNode({
        id: "node-2",
        title: "TBD",
        goal: "Unknown later",
        acceptance_criteria: [],
        verification_plan: { automated: [], manual: [] },
      }),
    ],
  };

  const result = analyzeDagQuality(dag);

  assert.equal(result.schema_version, "dag-quality/v1");
  assert.deepEqual(result.eligible_node_ids, ["node-1"]);
  assert.deepEqual(result.ineligible_node_ids, ["node-2"]);
  assert.equal(result.summary.total_nodes, 2);
  assert.equal(result.summary.eligible_nodes, 1);
  assert.equal(result.summary.ineligible_nodes, 1);
});

test("enrichDagWithQuality adds node-level execution fields for downstream consumers", () => {
  const dag = {
    schema_version: "issue-dag/v1",
    nodes: [
      makeNode({ id: "node-1" }),
      makeNode({
        id: "node-2",
        provider_eligible: false,
      }),
    ],
  };

  const enriched = enrichDagWithQuality(dag);

  assert.equal(enriched.nodes[0].execution_eligible, true);
  assert.deepEqual(enriched.nodes[0].execution_eligibility_reasons, []);
  assert.equal(enriched.nodes[1].execution_eligible, false);
  assert.match(enriched.nodes[1].execution_eligibility_reasons.join(" | "), /provider marked node as ineligible/);
  assert.equal(enriched.quality.summary.ineligible_nodes, 1);
});
