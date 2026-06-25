import path from "node:path";

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function toList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function nodeOrdinal(nodeId) {
  const match = String(nodeId || "").match(/node-(\d+)/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function sortableTopologicalIndex(node) {
  return Number.isInteger(node?.topological_index) ? node.topological_index : nodeOrdinal(node?.id);
}

function slugFromSourcePrd(sourcePrd) {
  const base = path.basename(String(sourcePrd || ""), path.extname(String(sourcePrd || "")));
  return base.replace(/^\d{4}-\d{2}-\d{2}-/, "") || "feature";
}

function titleCaseStage(stage) {
  return stage
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function executionStageForNode(node) {
  const status = normalizeText(node?.status).toLowerCase();
  if (status === "done") {
    return "Done";
  }
  if (status === "qa") {
    return "QA";
  }
  if (status === "bug_loop") {
    return "Bug Loop";
  }
  if (status === "human_review" || status === "review") {
    return "Human Review";
  }
  return "Ready for Handoff";
}

function executionLaneForStage(stage) {
  const normalized = normalizeText(stage);
  if (normalized === "Done") {
    return "Closed";
  }
  if (normalized === "Human Review" || normalized === "QA" || normalized === "Bug Loop") {
    return "Validation";
  }
  if (normalized === "AFK In Progress") {
    return "Execution";
  }
  return "Handoff";
}

function queueClassForNode(node) {
  if (node?.type === "foundation" || nodeOrdinal(node?.id) === 1) {
    return "tracer-bullet";
  }
  if (node?.human_gate_required) {
    return "hitl";
  }
  return "routine-afk";
}

function dependencyFieldForNode(node) {
  return toList(node?.depends_on).length === 0 ? "unblocked" : "blocked";
}

function stateLabelForNode(node) {
  return node?.human_gate_required ? "ready-for-human" : "ready-for-agent";
}

function categoryLabelForNode() {
  return "enhancement";
}

function conflictSurfaceForNode(node) {
  const normalized = normalizeText(node?.conflict_surface).toLowerCase();
  return normalized || "none";
}

function featureTrackForDag(dag) {
  return slugFromSourcePrd(dag?.source_prd);
}

function renderBulletList(items, emptyLabel = "None") {
  const lines = toList(items).map((item) => `- ${normalizeText(item)}`).filter((line) => line !== "-");
  return lines.length > 0 ? lines.join("\n") : `- ${emptyLabel}`;
}

export function renderDagNodeIssueBody({ dag, node }) {
  const dependencySummary = toList(node?.depends_on).length > 0
    ? toList(node.depends_on)
    : ["Unblocked within the current DAG."];

  const automatedVerification = toList(node?.verification_plan?.automated);
  const manualVerification = toList(node?.verification_plan?.manual);
  const acceptanceCriteria = toList(node?.acceptance_criteria);
  const writeSurface = toList(node?.write_surface);

  return [
    `# ${normalizeText(node?.title)}`,
    "",
    "## Goal",
    "",
    `- ${normalizeText(node?.goal)}`,
    "",
    "## Node Contract",
    "",
    `- DAG node: ${normalizeText(node?.id)}`,
    `- Node type: ${normalizeText(node?.type)}`,
    `- Actionable type: ${normalizeText(node?.actionable_type) || "implementation"}`,
    `- Queue class: ${queueClassForNode(node)}`,
    `- Provider eligible: ${node?.provider_eligible ? "yes" : "no"}`,
    `- Human gate required: ${node?.human_gate_required ? "yes" : "no"}`,
    `- Risk: ${normalizeText(node?.risk)}`,
    `- Conflict surface: ${conflictSurfaceForNode(node)}`,
    `- Source PRD: ${normalizeText(dag?.source_prd)}`,
    "",
    "## Dependencies",
    "",
    renderBulletList(dependencySummary),
    "",
    "## Acceptance Criteria",
    "",
    renderBulletList(acceptanceCriteria),
    "",
    "## Verification",
    "",
    "### Automated",
    "",
    renderBulletList(automatedVerification),
    "",
    "### Manual",
    "",
    renderBulletList(manualVerification),
    "",
    "## Execution Metadata",
    "",
    `- Write surface: ${writeSurface.join(" | ") || "None"}`,
    `- Review status: ${normalizeText(node?.review_status) || "pending"}`,
    `- QA status: ${normalizeText(node?.qa_status) || "pending"}`,
    `- Conflict reasoning: ${normalizeText(node?.conflict_reasoning) || "None provided."}`,
    "",
  ].join("\n");
}

export function synthesizeProjectFields({ dag, node }) {
  const executionStage = executionStageForNode(node);
  return {
    "Execution Stage": executionStage,
    "Execution Lane": executionLaneForStage(executionStage),
    "Queue Class": queueClassForNode(node),
    "Risk": normalizeText(node?.risk).toLowerCase() || "low",
    "Dependency": dependencyFieldForNode(node),
    "Conflict Surface": conflictSurfaceForNode(node),
    "Feature Track": featureTrackForDag(dag),
    "Dispatch ID": "",
  };
}

export function synthesizeDagNodeIssuePayload({ dag, node }) {
  return {
    node_id: node.id,
    actionable_type: normalizeText(node?.actionable_type) || "implementation",
    topological_index: Number.isInteger(node?.topological_index) ? node.topological_index : null,
    tracker_identity: node?.tracker_identity
      ? {
          graph_node_id: normalizeText(node.tracker_identity.graph_node_id),
          graph_issue_key: normalizeText(node.tracker_identity.graph_issue_key),
        }
      : {
          graph_node_id: normalizeText(node?.id),
          graph_issue_key: "",
        },
    title: normalizeText(node.title),
    body: renderDagNodeIssueBody({ dag, node }),
    labels: [categoryLabelForNode(), stateLabelForNode(node)],
    project_fields: synthesizeProjectFields({ dag, node }),
  };
}

export function synthesizeDagToGithubPreview(dag) {
  const nodes = [...toList(dag?.nodes)].sort((left, right) => sortableTopologicalIndex(left) - sortableTopologicalIndex(right));
  return {
    mode: "dry-run",
    source_prd: normalizeText(dag?.source_prd),
    feature_track: featureTrackForDag(dag),
    issues: nodes.map((node) => synthesizeDagNodeIssuePayload({ dag, node })),
  };
}

export function renderProjectFieldPreview(projectFields) {
  return Object.entries(projectFields)
    .map(([key, value]) => `- ${key}: ${titleCaseStage(String(value))}`)
    .join("\n");
}
