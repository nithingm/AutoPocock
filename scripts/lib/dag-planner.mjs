import path from "node:path";
import { parsePrdApproval } from "./prd-plane.mjs";

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function sectionBody(markdown, heading) {
  const text = normalizeText(markdown);
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^##\\s+${escaped}\\s*$`, "m").exec(text);
  if (!match) {
    return "";
  }

  const start = match.index + match[0].length;
  const rest = text.slice(start).replace(/^\n+/, "");
  const nextHeadingIndex = rest.search(/^##\s+/m);
  return normalizeText(nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex));
}

function listItems(markdown, heading) {
  return sectionBody(markdown, heading)
    .split("\n")
    .map((line) => line.match(/^\s*-\s+(.*)$/)?.[1] || "")
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function deriveIssueTitles(prdText) {
  const checks = [...prdText.matchAll(/^- \[ \] (.+)$/gm)].map((match) => match[1].trim());

  if (checks.length > 0) {
    return checks.map((check, index) => `Deliver acceptance criterion ${index + 1}: ${check}`);
  }

  return [
    "Establish the primary happy path",
    "Cover validation and failure handling",
    "Close QA and documentation gaps",
  ];
}

function inferWriteSurface(title, index) {
  const lower = title.toLowerCase();
  if (lower.includes("qa") || lower.includes("verification") || lower.includes("test")) {
    return ["tests/**", "docs/QA/**"];
  }
  if (lower.includes("documentation") || lower.includes("doc")) {
    return ["docs/**"];
  }
  if (index === 0) {
    return ["docs/PRDs/**", "issues/**"];
  }
  return [`issues/node-${index + 1}/**`, "issues/**"];
}

function inferRisk(title, index) {
  const lower = title.toLowerCase();
  if (lower.includes("failure") || lower.includes("validation")) {
    return "medium";
  }
  if (index === 0) {
    return "medium";
  }
  return "low";
}

function inferConflictSurface(writeSurface, index) {
  if (writeSurface.includes("issues/**") && index === 0) {
    return "medium";
  }
  if (writeSurface.includes("docs/**")) {
    return "low";
  }
  return "low";
}

function inferHumanGate(title) {
  const lower = title.toLowerCase();
  return lower.includes("approval") || lower.includes("credential") || lower.includes("manual") || lower.includes("human");
}

function buildNode({ title, index, total, prdText }) {
  const writeSurface = inferWriteSurface(title, index);
  const humanGateRequired = inferHumanGate(title);
  const dependsOn = index === 0 ? [] : ["node-1"];
  const initialStatus = index === 0
    ? "ready_for_handoff"
    : humanGateRequired
      ? "blocked_human_gate"
      : "blocked_dependency";

  return {
    id: `node-${index + 1}`,
    title,
    type: index === 0 ? "foundation" : humanGateRequired ? "human-gated" : "implementation",
    goal: title,
    depends_on: dependsOn,
    acceptance_criteria: [title],
    verification_plan: {
      automated: index === total - 1
        ? ["Review the generated Issue DAG artifact and execution waves."]
        : ["Review the generated Issue DAG node metadata."],
      manual: ["Inspect dependencies, write surfaces, and gating before dispatch."],
    },
    write_surface: writeSurface,
    risk: inferRisk(title, index),
    conflict_surface: inferConflictSurface(writeSurface, index),
    provider_eligible: !humanGateRequired,
    human_gate_required: humanGateRequired,
    parallelizable: index > 0 && !humanGateRequired,
    status: initialStatus,
    review_status: "pending",
    qa_status: "pending",
    conflict_reasoning: index === 0
      ? "Foundational planning node owns shared issue-planning surfaces and should run first."
      : "Node depends on the foundational planning pass but has an isolated write surface for later wave scheduling.",
  };
}

export function buildIssueDag({ prdPath, prdText }) {
  const approval = parsePrdApproval(prdText);
  const titles = deriveIssueTitles(prdText);
  const nodes = titles.map((title, index) => buildNode({ title, index, total: titles.length, prdText }));
  const edges = nodes.flatMap((node) => node.depends_on.map((dependency) => ({ from: dependency, to: node.id })));

  const waves = [];
  const foundation = nodes.filter((node) => node.depends_on.length === 0);
  if (foundation.length > 0) {
    waves.push({
      wave: 1,
      runnable_nodes: foundation.map((node) => node.id),
      blocked_nodes: [],
      reason: "Zero-dependency foundational nodes.",
    });
  }

  const secondWaveNodes = nodes.filter((node) => node.depends_on.length > 0 && node.provider_eligible);
  const humanGatedNodes = nodes.filter((node) => node.human_gate_required);
  if (secondWaveNodes.length > 0) {
    waves.push({
      wave: waves.length + 1,
      runnable_nodes: secondWaveNodes.map((node) => node.id),
      blocked_nodes: humanGatedNodes.map((node) => node.id),
      reason: "Dependent nodes unlocked after the foundational wave and grouped by non-overlapping write surfaces.",
    });
  }

  return {
    schema_version: "issue-dag/v1",
    source_prd: path.basename(prdPath),
    source_prd_status: approval.status,
    source_context: approval.sourceContext || "",
    nodes,
    edges,
    human_gated_nodes: humanGatedNodes.map((node) => node.id),
    provider_eligible_nodes: nodes.filter((node) => node.provider_eligible).map((node) => node.id),
    waves,
    progression: {
      completed_nodes: [],
      runnable_nodes: nodes.filter((node) => node.status === "ready_for_handoff").map((node) => node.id),
      blocked_nodes: nodes.filter((node) => node.status !== "ready_for_handoff").map((node) => node.id),
    },
  };
}

function renderNode(node) {
  return `## ${node.id}: ${node.title}

- Type: ${node.type}
- Goal: ${node.goal}
- Depends on: ${node.depends_on.join(", ") || "None"}
- Acceptance criteria: ${node.acceptance_criteria.join(" | ")}
- Verification plan: automated ${node.verification_plan.automated.join(" | ")} ; manual ${node.verification_plan.manual.join(" | ")}
- Write surface: ${node.write_surface.join(" | ")}
- Risk: ${node.risk}
- Conflict surface: ${node.conflict_surface}
- Provider eligible: ${node.provider_eligible ? "yes" : "no"}
- Human gate required: ${node.human_gate_required ? "yes" : "no"}
- Status: ${node.status}
- Review status: ${node.review_status}
- QA status: ${node.qa_status}
- Conflict reasoning: ${node.conflict_reasoning}
`;
}

export function renderIssueDagMarkdown(dag) {
  const edges = dag.edges.length > 0
    ? dag.edges.map((edge) => `- ${edge.from} -> ${edge.to}`).join("\n")
    : "- None";
  const waves = dag.waves.map((wave) => `### Wave ${wave.wave}

- Runnable nodes: ${wave.runnable_nodes.join(", ") || "None"}
- Blocked nodes: ${wave.blocked_nodes.join(", ") || "None"}
- Reason: ${wave.reason}
`).join("\n");

  return `# Issue DAG

Source PRD: ${dag.source_prd}
Source PRD status: ${dag.source_prd_status}
Source context: ${dag.source_context || "unknown"}

## Graph Summary

- Nodes: ${dag.nodes.length}
- Edges: ${dag.edges.length}
- Provider-eligible nodes: ${dag.provider_eligible_nodes.join(", ") || "None"}
- Human-gated nodes: ${dag.human_gated_nodes.join(", ") || "None"}

## Dependency Edges

${edges}

## Nodes

${dag.nodes.map(renderNode).join("\n")}

## Execution Waves

${waves || "No execution waves computed."}
`;
}
