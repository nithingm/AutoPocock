import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { compileLayeredDag } from "../scripts/lib/layered-dag-compiler.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const issuesScript = path.join(repoRoot, "scripts", "issues.mjs");

function approvedPrdMarkdown() {
  return `# Layered Planning Feature

## Approval

- Status: approved
- Approved by: solo-operator
- Approved at: 2026-05-14T21:00:00.000Z
- Source context: docs/agents/contexts/2026-05-14-layered-planning-feature.md
- Source context status: approved

## Problem

- The repo needs deterministic issue planning before deeper orchestration work can begin.

## User Value

- Technical solo builders can trust layered issue decomposition to stay stable across repeated compilation.

## Scope

- In scope: Compile the PRD into a layered DAG.
- Out of scope: GitHub synchronization and orchestration.

## Acceptance Criteria

- [ ] Preserve stable layered node identities across repeated compilation.
- [ ] Route tracer-bullet dependencies ahead of deeper implementation slices.
- [ ] Emit deterministic layer and edge metadata for downstream workflow stages.

## Open Questions

- None
`;
}

test("compileLayeredDag emits stable layered node identities and tracer-bullet structure", () => {
  const prdPath = path.join(repoRoot, "docs", "PRDs", "2026-05-14-layered-planning-feature.md");
  const prdText = approvedPrdMarkdown();
  const now = "2026-05-15T04:43:35.000Z";

  const first = compileLayeredDag({ prdPath, prdText, now });
  const second = compileLayeredDag({ prdPath, prdText, now });

  assert.deepEqual(first, second);
  assert.equal(first.schema_version, "issue-dag/v1");
  assert.equal(first.dag_model, "layered-dag/v1");
  assert.equal(first.root_node_id, "initiative-layered-planning-feature");
  assert.equal(first.tracer_bullet_node_id, "tracer-bullet-layered-planning-feature");
  assert.deepEqual(
    first.nodes.map((node) => node.id),
    [
      "initiative-layered-planning-feature",
      "tracer-bullet-layered-planning-feature",
      "implementation-layered-planning-feature-ac-1",
      "implementation-layered-planning-feature-ac-2",
      "implementation-layered-planning-feature-ac-3",
    ],
  );
  assert.deepEqual(
    first.layers.map((layer) => [layer.id, layer.rank, layer.node_ids.length]),
    [
      ["initiative", 0, 1],
      ["tracer_bullet", 1, 1],
      ["implementation", 2, 3],
    ],
  );
  assert.deepEqual(first.progression.runnable_nodes, ["tracer-bullet-layered-planning-feature"]);
  assert.deepEqual(first.tracer_bullets[0].implementation_node_ids, [
    "implementation-layered-planning-feature-ac-1",
    "implementation-layered-planning-feature-ac-2",
    "implementation-layered-planning-feature-ac-3",
  ]);
  assert.equal(first.dag_provenance.generated_at, now);
  assert.equal(first.nodes[0].field_provenance.title.source, "generated");
});

test("compileLayeredDag preserves dependency edges and layer assignments for implementation slices", () => {
  const prdPath = path.join(repoRoot, "docs", "PRDs", "2026-05-14-layered-planning-feature.md");
  const dag = compileLayeredDag({ prdPath, prdText: approvedPrdMarkdown() });

  const edgePairs = dag.edges.map((edge) => `${edge.from}:${edge.kind}:${edge.to}`);
  assert.deepEqual(edgePairs, [
    "initiative-layered-planning-feature:contains:tracer-bullet-layered-planning-feature",
    "tracer-bullet-layered-planning-feature:depends_on:implementation-layered-planning-feature-ac-1",
    "tracer-bullet-layered-planning-feature:depends_on:implementation-layered-planning-feature-ac-2",
    "tracer-bullet-layered-planning-feature:depends_on:implementation-layered-planning-feature-ac-3",
  ]);

  for (const node of dag.nodes.filter((entry) => entry.layer === "implementation")) {
    assert.deepEqual(node.depends_on, ["tracer-bullet-layered-planning-feature"]);
    assert.equal(node.parent_id, "tracer-bullet-layered-planning-feature");
    assert.equal(node.status, "blocked_dependency");
  }
});

test("compileLayeredDag promotes the graph into a vetted topological execution authority", () => {
  const prdPath = path.join(repoRoot, "docs", "PRDs", "2026-05-14-layered-planning-feature.md");
  const dag = compileLayeredDag({ prdPath, prdText: approvedPrdMarkdown() });

  assert.equal(dag.execution_authority.mode, "graph");
  assert.equal(dag.execution_authority.vetting_status, "approved");
  assert.deepEqual(dag.topological_order, [
    "initiative-layered-planning-feature",
    "tracer-bullet-layered-planning-feature",
    "implementation-layered-planning-feature-ac-1",
    "implementation-layered-planning-feature-ac-2",
    "implementation-layered-planning-feature-ac-3",
  ]);

  const actionableNodes = dag.nodes.filter((node) => node.actionable === true);
  assert.deepEqual(
    actionableNodes.map((node) => [node.id, node.actionable_type]),
    [
      ["tracer-bullet-layered-planning-feature", "investigation"],
      ["implementation-layered-planning-feature-ac-1", "implementation"],
      ["implementation-layered-planning-feature-ac-2", "implementation"],
      ["implementation-layered-planning-feature-ac-3", "implementation"],
    ],
  );
  assert.ok(actionableNodes.every((node) => Number.isInteger(node.topological_index)));
  assert.ok(actionableNodes.every((node) => node.tracker_identity.graph_node_id === node.id));
});

test("issues.mjs routes approved PRDs through the layered DAG compiler", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "autopocock-layered-dag-"));
  const prdDir = path.join(cwd, "docs", "PRDs");
  await mkdir(prdDir, { recursive: true });
  const prdPath = path.join(prdDir, "2026-05-14-layered-planning-feature.md");
  await writeFile(prdPath, approvedPrdMarkdown(), "utf8");

  const { stdout } = await execFileAsync(process.execPath, [issuesScript, "--prd", prdPath], {
    cwd,
    windowsHide: true,
  });

  const markdownPath = stdout.trim();
  const jsonPath = markdownPath.replace(/\.md$/, ".json");
  const markdown = await readFile(markdownPath, "utf8");
  const dag = JSON.parse(await readFile(jsonPath, "utf8"));

  assert.ok((await stat(markdownPath)).isFile());
  assert.ok((await stat(jsonPath)).isFile());
  assert.equal(dag.dag_model, "layered-dag/v1");
  assert.equal(dag.root_node_id, "initiative-layered-planning-feature");
  assert.equal(dag.tracer_bullet_node_id, "tracer-bullet-layered-planning-feature");
  assert.match(markdown, /## Layers/);
  assert.match(markdown, /## Tracer Bullets/);
  assert.match(markdown, /Graph model: layered-dag\/v1/);
});
