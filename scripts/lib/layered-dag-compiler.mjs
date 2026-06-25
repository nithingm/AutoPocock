import path from "node:path";
import { parsePrdApproval } from "./prd-plane.mjs";

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "untitled";
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sectionBody(markdown, heading) {
  const text = normalizeText(markdown);
  const match = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, "m").exec(text);
  if (!match) {
    return "";
  }

  const start = match.index + match[0].length;
  const rest = text.slice(start).replace(/^\n+/, "");
  const nextHeadingIndex = rest.search(/^##\s+/m);
  return normalizeText(nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex));
}

function bulletItems(markdown, heading) {
  return sectionBody(markdown, heading)
    .split("\n")
    .map((line) => line.match(/^\s*-\s+(.*)$/)?.[1] || "")
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function checklistItems(markdown, heading) {
  return sectionBody(markdown, heading)
    .split("\n")
    .map((line) => line.match(/^\s*-\s+\[[ xX]\]\s+(.*)$/)?.[1] || "")
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function parseTitle(prdText, prdPath) {
  const heading = prdText.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) {
    return heading;
  }
  return path.basename(prdPath, ".md").replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

function deriveImplementationItems(prdText) {
  const acceptanceCriteria = checklistItems(prdText, "Acceptance Criteria");
  if (acceptanceCriteria.length > 0) {
    return acceptanceCriteria;
  }

  const scope = bulletItems(prdText, "Scope");
  if (scope.length > 0) {
    return scope;
  }

  const openQuestions = bulletItems(prdText, "Open Questions");
  if (openQuestions.length > 0) {
    return openQuestions.map((item) => `Resolve planning gap: ${item}`);
  }

  return ["Deliver the primary happy path from the approved PRD."];
}

function inferWriteSurface(text, layer, index) {
  const lower = text.toLowerCase();
  if (layer === "initiative") {
    return ["docs/PRDs/**", "issues/**"];
  }
  if (layer === "tracer_bullet") {
    return ["issues/**", "docs/agents/handoffs/**"];
  }
  if (lower.includes("qa") || lower.includes("test") || lower.includes("verification")) {
    return ["tests/**", "docs/QA/**"];
  }
  if (lower.includes("doc")) {
    return ["docs/**"];
  }
  return [`issues/implementation-${index + 1}/**`, "issues/**"];
}

function inferRisk(text, layer) {
  const lower = text.toLowerCase();
  if (layer === "initiative" || layer === "tracer_bullet") {
    return "medium";
  }
  if (lower.includes("risk") || lower.includes("failure") || lower.includes("security")) {
    return "medium";
  }
  return "low";
}

function inferConflictSurface(layer, writeSurface) {
  if (layer === "initiative") {
    return "medium";
  }
  if (writeSurface.includes("issues/**") || writeSurface.includes("docs/**")) {
    return "low";
  }
  return "none";
}

function actionableTypeForLayer(layer) {
  if (layer === "tracer_bullet") {
    return "investigation";
  }
  if (layer === "implementation") {
    return "implementation";
  }
  if (layer === "follow_up") {
    return "review_follow_up";
  }
  if (layer === "bug_loop") {
    return "bug_loop";
  }
  if (layer === "initiative") {
    return "hitl";
  }
  return "implementation";
}

function trackerIdentityForNode({ featureTrack, nodeId }) {
  return {
    graph_node_id: nodeId,
    graph_issue_key: `${featureTrack}/${nodeId}`,
  };
}

function attachGeneratedNodeProvenance(node, generatedAt) {
  const fieldProvenance = {};

  for (const [field, value] of Object.entries(node)) {
    fieldProvenance[field] = {
      source: "generated",
      stale: false,
      generated_value: cloneValue(value),
      stale_reason: "",
    };
  }

  return {
    ...node,
    provenance_status: "generated",
    node_provenance: {
      origin: "generated",
      generated_at: generatedAt,
      regenerated_at: "",
      previous_node_id: "",
    },
    field_provenance: fieldProvenance,
  };
}

function buildInitiativeNode({ featureTrack, title, implementationItems }) {
  const id = `initiative-${featureTrack}`;
  return {
    id,
    title: `Initiative: ${title}`,
    type: "initiative",
    layer: "initiative",
    layer_index: 0,
    parent_id: "",
    goal: `Preserve the approved PRD intent for ${title}.`,
    depends_on: [],
    acceptance_criteria: implementationItems,
    verification_plan: {
      automated: [],
      manual: ["Review the layered DAG structure before execution planning."],
    },
    write_surface: inferWriteSurface(title, "initiative", 0),
    risk: inferRisk(title, "initiative"),
    conflict_surface: inferConflictSurface("initiative", inferWriteSurface(title, "initiative", 0)),
    provider_eligible: false,
    human_gate_required: true,
    parallelizable: false,
    tracer_bullet: false,
    feature_track: featureTrack,
    actionable: false,
    actionable_type: actionableTypeForLayer("initiative"),
    topological_index: 0,
    tracker_identity: trackerIdentityForNode({ featureTrack, nodeId: id }),
    status: "planned",
    review_status: "pending",
    qa_status: "pending",
    conflict_reasoning: "The initiative node anchors planning context and should not be scheduled as an execution slice.",
  };
}

function buildTracerBulletNode({ featureTrack, title, implementationItems, initiativeId }) {
  const id = `tracer-bullet-${featureTrack}`;
  return {
    id,
    title: `Tracer bullet: ${title}`,
    type: "tracer-bullet",
    layer: "tracer_bullet",
    layer_index: 1,
    parent_id: initiativeId,
    goal: `Prove the smallest credible end-to-end path for ${title}.`,
    depends_on: [],
    acceptance_criteria: implementationItems.slice(0, 1),
    verification_plan: {
      automated: ["Verify the first layered DAG slice and dependency chain compile deterministically."],
      manual: ["Confirm the tracer bullet is small enough to validate the execution path before later waves."],
    },
    write_surface: inferWriteSurface(title, "tracer_bullet", 0),
    risk: inferRisk(title, "tracer_bullet"),
    conflict_surface: inferConflictSurface("tracer_bullet", inferWriteSurface(title, "tracer_bullet", 0)),
    provider_eligible: true,
    human_gate_required: false,
    parallelizable: false,
    tracer_bullet: true,
    feature_track: featureTrack,
    actionable: true,
    actionable_type: actionableTypeForLayer("tracer_bullet"),
    topological_index: 1,
    tracker_identity: trackerIdentityForNode({ featureTrack, nodeId: id }),
    status: "ready_for_handoff",
    review_status: "pending",
    qa_status: "pending",
    conflict_reasoning: "The tracer bullet should run first so the feature track earns trust before deeper implementation slices unlock.",
  };
}

function buildImplementationNode({ featureTrack, criterion, index, tracerBulletId }) {
  const writeSurface = inferWriteSurface(criterion, "implementation", index);
  const id = `implementation-${featureTrack}-ac-${index + 1}`;
  return {
    id,
    title: `Implementation ${index + 1}: ${criterion}`,
    type: "implementation",
    layer: "implementation",
    layer_index: 2,
    parent_id: tracerBulletId,
    goal: criterion,
    depends_on: [tracerBulletId],
    acceptance_criteria: [criterion],
    verification_plan: {
      automated: ["Verify the compiled DAG node metadata and downstream execution contract inputs."],
      manual: ["Inspect write surfaces, layer assignment, and dependency edges before dispatch."],
    },
    write_surface: writeSurface,
    risk: inferRisk(criterion, "implementation"),
    conflict_surface: inferConflictSurface("implementation", writeSurface),
    provider_eligible: true,
    human_gate_required: false,
    parallelizable: true,
    tracer_bullet: false,
    feature_track: featureTrack,
    actionable: true,
    actionable_type: actionableTypeForLayer("implementation"),
    topological_index: index + 2,
    tracker_identity: trackerIdentityForNode({ featureTrack, nodeId: id }),
    status: "blocked_dependency",
    review_status: "pending",
    qa_status: "pending",
    conflict_reasoning: "This implementation slice remains blocked until the tracer bullet proves the feature track and unlocks deeper waves.",
  };
}

function buildEdges({ initiativeId, tracerBulletId, implementationNodes }) {
  return [
    {
      from: initiativeId,
      to: tracerBulletId,
      kind: "contains",
    },
    ...implementationNodes.map((node) => ({
      from: tracerBulletId,
      to: node.id,
      kind: "depends_on",
    })),
  ];
}

function buildLayers({ initiativeId, tracerBulletId, implementationNodes }) {
  return [
    { id: "initiative", rank: 0, node_ids: [initiativeId] },
    { id: "tracer_bullet", rank: 1, node_ids: [tracerBulletId] },
    { id: "implementation", rank: 2, node_ids: implementationNodes.map((node) => node.id) },
  ];
}

function buildWaves({ tracerBulletId, implementationNodes }) {
  return [
    {
      wave: 1,
      runnable_nodes: [tracerBulletId],
      blocked_nodes: implementationNodes.map((node) => node.id),
      reason: "The primary tracer bullet wave validates the feature track before deeper implementation slices can run.",
    },
    {
      wave: 2,
      runnable_nodes: implementationNodes.map((node) => node.id),
      blocked_nodes: [],
      reason: "Implementation slices unlock after the tracer bullet completes and can be further refined by later quality gating.",
    },
  ].filter((wave) => wave.runnable_nodes.length > 0 || wave.blocked_nodes.length > 0);
}

export function compileLayeredDag({ prdPath, prdText, now = new Date().toISOString() }) {
  const approval = parsePrdApproval(prdText);
  const title = parseTitle(prdText, prdPath);
  const featureTrack = slugify(title);
  const implementationItems = deriveImplementationItems(prdText);
  const initiativeNode = buildInitiativeNode({ featureTrack, title, implementationItems });
  const tracerBulletNode = buildTracerBulletNode({
    featureTrack,
    title,
    implementationItems,
    initiativeId: initiativeNode.id,
  });
  const implementationNodes = implementationItems.map((criterion, index) => buildImplementationNode({
    featureTrack,
    criterion,
    index,
    tracerBulletId: tracerBulletNode.id,
  }));
  const nodes = [initiativeNode, tracerBulletNode, ...implementationNodes]
    .map((node) => attachGeneratedNodeProvenance(node, now));
  const topologicalOrder = nodes
    .slice()
    .sort((left, right) => (left.topological_index || 0) - (right.topological_index || 0))
    .map((node) => node.id);

  return {
    schema_version: "issue-dag/v1",
    dag_model: "layered-dag/v1",
    source_prd: path.basename(prdPath),
    source_prd_status: approval.status,
    source_context: approval.sourceContext || "",
    feature_track: featureTrack,
    root_node_id: initiativeNode.id,
    tracer_bullet_node_id: tracerBulletNode.id,
    execution_authority: {
      mode: "graph",
      vetting_status: "approved",
      source_of_truth: "issue-dag",
    },
    dag_provenance: {
      generated_at: now,
      regenerated_at: "",
      previous_source_prd: "",
      regeneration_status: "initial_generation",
    },
    topological_order: topologicalOrder,
    nodes,
    edges: buildEdges({
      initiativeId: initiativeNode.id,
      tracerBulletId: tracerBulletNode.id,
      implementationNodes,
    }),
    layers: buildLayers({
      initiativeId: initiativeNode.id,
      tracerBulletId: tracerBulletNode.id,
      implementationNodes,
    }),
    tracer_bullets: [
      {
        id: tracerBulletNode.id,
        node_id: tracerBulletNode.id,
        feature_track: featureTrack,
        unlocks_layers: ["implementation"],
        implementation_node_ids: implementationNodes.map((node) => node.id),
      },
    ],
    human_gated_nodes: nodes.filter((node) => node.human_gate_required).map((node) => node.id),
    provider_eligible_nodes: nodes.filter((node) => node.provider_eligible).map((node) => node.id),
    waves: buildWaves({
      tracerBulletId: tracerBulletNode.id,
      implementationNodes,
    }),
    progression: {
      completed_nodes: [],
      runnable_nodes: [tracerBulletNode.id],
      blocked_nodes: [initiativeNode.id, ...implementationNodes.map((node) => node.id)],
    },
  };
}

function renderNode(node) {
  return `## ${node.id}: ${node.title}

- Type: ${node.type}
- Actionable type: ${node.actionable_type || "none"}
- Layer: ${node.layer}
- Actionable: ${node.actionable ? "yes" : "no"}
- Topological index: ${node.topological_index ?? "None"}
- Layer index: ${node.layer_index}
- Parent: ${node.parent_id || "None"}
- Goal: ${node.goal}
- Depends on: ${node.depends_on.join(", ") || "None"}
- Acceptance criteria: ${node.acceptance_criteria.join(" | ") || "None"}
- Verification plan: automated ${node.verification_plan.automated.join(" | ") || "None"} ; manual ${node.verification_plan.manual.join(" | ") || "None"}
- Write surface: ${node.write_surface.join(" | ")}
- Risk: ${node.risk}
- Conflict surface: ${node.conflict_surface}
- Provider eligible: ${node.provider_eligible ? "yes" : "no"}
- Human gate required: ${node.human_gate_required ? "yes" : "no"}
- Tracer bullet: ${node.tracer_bullet ? "yes" : "no"}
- Tracker identity: ${node.tracker_identity?.graph_issue_key || "None"}
- Provenance status: ${node.provenance_status || "unknown"}
- Stale fields: ${Object.entries(node.field_provenance || {}).filter(([, provenance]) => provenance?.stale).map(([field]) => field).join(", ") || "None"}
- Status: ${node.status}
- Review status: ${node.review_status}
- QA status: ${node.qa_status}
- Conflict reasoning: ${node.conflict_reasoning}
`;
}

export function renderLayeredDagMarkdown(dag) {
  const edges = dag.edges.length > 0
    ? dag.edges.map((edge) => `- ${edge.from} -> ${edge.to} (${edge.kind})`).join("\n")
    : "- None";
  const layers = dag.layers.length > 0
    ? dag.layers.map((layer) => `- ${layer.id} (rank ${layer.rank}): ${layer.node_ids.join(", ") || "None"}`).join("\n")
    : "- None";
  const tracerBullets = dag.tracer_bullets.length > 0
    ? dag.tracer_bullets.map((tracer) => `- ${tracer.node_id}: unlocks ${tracer.unlocks_layers.join(", ")} -> ${tracer.implementation_node_ids.join(", ") || "None"}`).join("\n")
    : "- None";
  const waves = dag.waves.length > 0
    ? dag.waves.map((wave) => `### Wave ${wave.wave}

- Runnable nodes: ${wave.runnable_nodes.join(", ") || "None"}
- Blocked nodes: ${wave.blocked_nodes.join(", ") || "None"}
- Reason: ${wave.reason}
`).join("\n")
    : "No execution waves computed.";

  return `# Issue DAG

Source PRD: ${dag.source_prd}
Source PRD status: ${dag.source_prd_status}
Source context: ${dag.source_context || "unknown"}
Graph model: ${dag.dag_model}
Feature track: ${dag.feature_track}
Execution authority: ${dag.execution_authority?.mode || "unknown"} (${dag.execution_authority?.vetting_status || "unknown"})

## Graph Summary

- Nodes: ${dag.nodes.length}
- Edges: ${dag.edges.length}
- Provider-eligible nodes: ${dag.provider_eligible_nodes.join(", ") || "None"}
- Human-gated nodes: ${dag.human_gated_nodes.join(", ") || "None"}
- Root node: ${dag.root_node_id}
- Tracer bullet node: ${dag.tracer_bullet_node_id}
- Topological order: ${dag.topological_order?.join(", ") || "None"}

## Layers

${layers}

## Tracer Bullets

${tracerBullets}

## Dependency Edges

${edges}

## Nodes

${dag.nodes.map(renderNode).join("\n")}

## Execution Waves

${waves}
`;
}
