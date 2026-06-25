import { normalizeCompletionEvidence, validateCompletionEvidence } from "./completion-evidence.mjs";

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function findNode(dag, nodeId) {
  const node = dag.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`DAG node not found: ${nodeId}`);
  }
  return node;
}

function dependentsOf(dag, nodeId) {
  return dag.nodes.filter((node) => node.depends_on.includes(nodeId));
}

function recomputeProgression(dag) {
  const completedNodes = dag.nodes.filter((node) => node.status === "done").map((node) => node.id);
  const runnableNodes = dag.nodes.filter((node) => node.status === "ready_for_handoff").map((node) => node.id);
  const blockedNodes = dag.nodes.filter((node) => !["done", "ready_for_handoff"].includes(node.status)).map((node) => node.id);
  dag.progression = {
    completed_nodes: completedNodes,
    runnable_nodes: runnableNodes,
    blocked_nodes: blockedNodes,
  };
  return dag;
}

export function applyReviewDecision(dagInput, { nodeId, decision, approvedBy, reason = "" }) {
  const dag = clone(dagInput);
  const node = findNode(dag, nodeId);

  if (!approvedBy) {
    throw new Error("Review decisions require approvedBy.");
  }
  if (!["approve", "reject"].includes(decision)) {
    throw new Error(`Unsupported review decision: ${decision}`);
  }

  node.review_status = decision === "approve" ? "approved" : "rejected";
  node.review_decision = {
    by: approvedBy,
    at: nowIso(),
    reason,
  };

  if (decision === "approve") {
    node.status = "qa";
  } else {
    node.status = "ready_for_handoff";
    node.qa_status = "pending";
  }

  return recomputeProgression(dag);
}

export function applyQaDecision(dagInput, { nodeId, decision, approvedBy, reason = "", evidence = {} }) {
  const dag = clone(dagInput);
  const node = findNode(dag, nodeId);

  if (!approvedBy) {
    throw new Error("QA decisions require approvedBy.");
  }
  if (!["pass", "fail", "validation-fail"].includes(decision)) {
    throw new Error(`Unsupported QA decision: ${decision}`);
  }
  if (node.review_status !== "approved") {
    throw new Error(`QA decisions require review approval first. Node ${nodeId} review status is ${node.review_status}.`);
  }

  if (decision === "pass" || decision === "validation-fail") {
    const validation = validateCompletionEvidence(node, {
      ...evidence,
      review_evidence: {
        by: approvedBy,
        at: nowIso(),
        decision: node.review_status,
        reason: node.review_decision?.reason || "",
      },
    }, {
      requireReviewEvidence: true,
    });

    if (validation.errors.length > 0) {
      throw new Error(`Completion evidence is incomplete for node ${nodeId}: ${validation.errors.join("; ")}.`);
    }

    node.completion_evidence = normalizeCompletionEvidence(validation.evidence);
    node.validation_status = validation.ok ? "passed" : "failed";
    node.validation_summary = {
      required_test_dimensions: validation.required_test_dimensions,
      failed_test_dimensions: validation.failed_test_dimensions,
    };

    if (decision === "pass" && !validation.ok) {
      throw new Error(
        `QA pass cannot be recorded for node ${nodeId} because validation failed for: ${validation.failed_test_dimensions.join(", ")}. Use validation-fail instead.`,
      );
    }

    if (decision === "validation-fail") {
      node.qa_status = "validation_failed";
      node.qa_decision = {
        by: approvedBy,
        at: nowIso(),
        reason,
      };
      node.status = "validation_failed";
      return recomputeProgression(dag);
    }
  }

  node.qa_status = decision === "pass" ? "passed" : "failed";
  node.qa_decision = {
    by: approvedBy,
    at: nowIso(),
    reason,
  };

  if (decision === "fail") {
    node.status = "bug_loop";
    return recomputeProgression(dag);
  }

  node.status = "done";

  for (const dependent of dependentsOf(dag, nodeId)) {
    const allDependenciesDone = dependent.depends_on.every((dependencyId) => findNode(dag, dependencyId).status === "done");
    if (!allDependenciesDone) {
      continue;
    }

    dependent.status = dependent.human_gate_required ? "blocked_human_gate" : "ready_for_handoff";
  }

  return recomputeProgression(dag);
}

export function renderGateDecisionArtifact({
  kind,
  issue,
  nodeId,
  decision,
  approvedBy,
  reason,
  dagPath,
  evidenceSummary = "",
}) {
  const title = kind === "review" ? "Review Decision" : "QA Decision";
  return `# ${title}

## Identity

- Issue: ${issue}
- Node: ${nodeId}
- Decision: ${decision}
- Approved by: ${approvedBy}
- Approved at: ${nowIso()}

## Reason

- ${reason || "No explicit reason recorded."}

## DAG

- Updated artifact: ${dagPath}

${evidenceSummary ? `## Evidence Summary

- ${evidenceSummary}
` : ""}`;
}

export function renderFollowUpBugArtifact({
  issue,
  nodeId,
  approvedBy,
  reason,
}) {
  return {
    json: {
      classification: "follow-up-bug",
      issue,
      node_id: nodeId,
      created_by: approvedBy,
      reason,
      created_at: nowIso(),
    },
    markdown: `# Follow-up Bug Draft

## Source

- Issue: ${issue}
- Node: ${nodeId}
- Created by: ${approvedBy}
- Created at: ${nowIso()}

## Reason

- ${reason || "No explicit reason recorded."}
`,
  };
}
