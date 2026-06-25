import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { compileLayeredDag } from "../scripts/lib/layered-dag-compiler.mjs";
import {
  regenerateLayeredDag,
  renderLayeredDagRegenerationMarkdown,
} from "../scripts/lib/layered-dag-regeneration.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const issuesScript = path.join(repoRoot, "scripts", "issues.mjs");

function approvedPrdMarkdown({
  title = "Layered Planning Feature",
  acceptanceCriteria = [
    "Preserve stable layered node identities across repeated compilation.",
    "Route tracer-bullet dependencies ahead of deeper implementation slices.",
    "Emit deterministic layer and edge metadata for downstream workflow stages.",
  ],
} = {}) {
  return `# ${title}

## Approval

- Status: approved
- Approved by: solo-operator
- Approved at: 2026-05-15T00:00:00.000Z
- Source context: docs/agents/contexts/2026-05-15-layered-planning-feature.md
- Source context status: approved

## Problem

- The repo needs deterministic issue planning before deeper orchestration work can begin.

## User Value

- Technical solo builders can trust layered issue decomposition to stay stable across repeated compilation.

## Scope

- In scope: Compile the PRD into a layered DAG.
- Out of scope: GitHub synchronization and orchestration.

## Acceptance Criteria

${acceptanceCriteria.map((item) => `- [ ] ${item}`).join("\n")}

## Open Questions

- None
`;
}

test("regenerateLayeredDag preserves compatible user edits and marks stale derived fields", () => {
  const prdPath = path.join(repoRoot, "docs", "PRDs", "2026-05-15-layered-planning-feature.md");
  const previousDag = compileLayeredDag({ prdPath, prdText: approvedPrdMarkdown() });

  const editedNode = previousDag.nodes.find((node) => node.id === "implementation-layered-planning-feature-ac-2");
  editedNode.title = "Implementation 2: Custom operator wording";
  editedNode.write_surface = ["scripts/lib/custom-path/**", "issues/**"];

  const nextPrd = approvedPrdMarkdown({
    acceptanceCriteria: [
      "Preserve stable layered node identities across repeated compilation.",
      "Route tracer-bullet dependencies and regeneration diff summaries ahead of deeper implementation slices.",
      "Emit deterministic layer and edge metadata for downstream workflow stages.",
    ],
  });

  const result = regenerateLayeredDag({
    prdPath,
    prdText: nextPrd,
    previousDag,
    now: "2026-05-15T01:00:00.000Z",
  });

  const node = result.dag.nodes.find((entry) => entry.id === "implementation-layered-planning-feature-ac-2");
  assert.equal(node.title, "Implementation 2: Custom operator wording");
  assert.deepEqual(node.write_surface, ["scripts/lib/custom-path/**", "issues/**"]);
  assert.equal(node.field_provenance.title.source, "user_edited");
  assert.equal(node.field_provenance.title.stale, true);
  assert.match(node.field_provenance.title.stale_reason, /upstream PRD/i);
  assert.equal(node.field_provenance.write_surface.source, "user_edited");
  assert.equal(node.field_provenance.write_surface.stale, false);
  assert.equal(node.field_provenance.acceptance_criteria.source, "generated");
  assert.deepEqual(
    result.diff.changed_acceptance_shape.map((entry) => entry.node_id),
    ["implementation-layered-planning-feature-ac-2"],
  );
});

test("regenerateLayeredDag reports added, removed, PRD-gap, and graph-only nodes", () => {
  const prdPath = path.join(repoRoot, "docs", "PRDs", "2026-05-15-layered-planning-feature.md");
  const previousDag = compileLayeredDag({ prdPath, prdText: approvedPrdMarkdown() });

  previousDag.nodes.push({
    id: "manual-operator-node",
    title: "Operator-only follow-up",
    type: "follow-up",
    layer: "follow_up",
    layer_index: 9,
    parent_id: "initiative-layered-planning-feature",
    goal: "Capture manual reconciliation outside the generated PRD flow.",
    depends_on: ["tracer-bullet-layered-planning-feature"],
    acceptance_criteria: ["Document why the generated graph needs an operator-only follow-up."],
    verification_plan: { automated: [], manual: ["Inspect the graph-only follow-up node."] },
    write_surface: ["docs/agents/**"],
    risk: "low",
    conflict_surface: "low",
    provider_eligible: false,
    human_gate_required: true,
    parallelizable: false,
    tracer_bullet: false,
    feature_track: "layered-planning-feature",
    actionable: false,
    actionable_type: "hitl",
    topological_index: 99,
    tracker_identity: {
      graph_node_id: "manual-operator-node",
      graph_issue_key: "layered-planning-feature/manual-operator-node",
    },
    status: "planned",
    review_status: "pending",
    qa_status: "pending",
    conflict_reasoning: "Operator-added planning node.",
    field_provenance: {
      title: { source: "user_edited", stale: false, generated_value: null, stale_reason: "" },
    },
  });
  previousDag.edges.push({
    from: "tracer-bullet-layered-planning-feature",
    to: "manual-operator-node",
    kind: "depends_on",
  });

  const editedNode = previousDag.nodes.find((node) => node.id === "implementation-layered-planning-feature-ac-2");
  editedNode.acceptance_criteria = ["Operator-specific acceptance wording that no longer matches the PRD."];

  const nextPrd = approvedPrdMarkdown({
    acceptanceCriteria: [
      "Preserve stable layered node identities across repeated compilation.",
      "Introduce explicit regeneration diff summaries for operators.",
      "Emit deterministic layer and edge metadata for downstream workflow stages.",
      "Expose graph provenance in the regenerated artifact.",
    ],
  });

  const result = regenerateLayeredDag({
    prdPath,
    prdText: nextPrd,
    previousDag,
    now: "2026-05-15T01:30:00.000Z",
  });

  assert.deepEqual(result.diff.added_nodes, ["implementation-layered-planning-feature-ac-4"]);
  assert.deepEqual(result.diff.graph_only_nodes, ["manual-operator-node"]);
  assert.deepEqual(result.diff.prd_gaps, [
    "Introduce explicit regeneration diff summaries for operators.",
  ]);
  assert.ok(result.dag.nodes.some((node) => node.id === "manual-operator-node"));

  const markdown = renderLayeredDagRegenerationMarkdown(result.diff);
  assert.match(markdown, /Added Nodes/);
  assert.match(markdown, /Graph-Only Nodes/);
  assert.match(markdown, /PRD Gaps/);
});

test("issues.mjs regeneration writes diff artifacts and preserves provenance metadata", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "autopocock-dag-regeneration-"));
  const prdDir = path.join(cwd, "docs", "PRDs");
  await mkdir(prdDir, { recursive: true });
  const prdPath = path.join(prdDir, "2026-05-15-layered-planning-feature.md");

  await writeFile(prdPath, approvedPrdMarkdown(), "utf8");

  const first = await execFileAsync(process.execPath, [issuesScript, "--prd", prdPath], {
    cwd,
    windowsHide: true,
  });

  const markdownPath = first.stdout.trim();
  const jsonPath = markdownPath.replace(/\.md$/, ".json");
  const originalDag = JSON.parse(await readFile(jsonPath, "utf8"));
  const editedNode = originalDag.nodes.find((node) => node.id === "implementation-layered-planning-feature-ac-2");
  editedNode.title = "Implementation 2: Operator-preserved wording";
  await writeFile(jsonPath, `${JSON.stringify(originalDag, null, 2)}\n`, "utf8");

  await writeFile(prdPath, approvedPrdMarkdown({
    acceptanceCriteria: [
      "Preserve stable layered node identities across repeated compilation.",
      "Route tracer-bullet dependencies and regeneration diff summaries ahead of deeper implementation slices.",
      "Emit deterministic layer and edge metadata for downstream workflow stages.",
      "Expose graph provenance in the regenerated artifact.",
    ],
  }), "utf8");

  const second = await execFileAsync(process.execPath, [issuesScript, "--prd", prdPath], {
    cwd,
    windowsHide: true,
  });

  const secondMarkdownPath = second.stdout.trim();
  const regeneratedDag = JSON.parse(await readFile(secondMarkdownPath.replace(/\.md$/, ".json"), "utf8"));
  const diffMarkdownPath = secondMarkdownPath.replace(/-issues\.md$/, "-issues-regeneration.md");
  const diffJsonPath = secondMarkdownPath.replace(/-issues\.md$/, "-issues-regeneration.json");
  const diff = JSON.parse(await readFile(diffJsonPath, "utf8"));

  assert.ok((await stat(diffMarkdownPath)).isFile());
  assert.ok((await stat(diffJsonPath)).isFile());

  const node = regeneratedDag.nodes.find((entry) => entry.id === "implementation-layered-planning-feature-ac-2");
  assert.equal(node.title, "Implementation 2: Operator-preserved wording");
  assert.equal(node.field_provenance.title.source, "user_edited");
  assert.equal(node.field_provenance.title.stale, true);
  assert.deepEqual(diff.added_nodes, ["implementation-layered-planning-feature-ac-4"]);
});
