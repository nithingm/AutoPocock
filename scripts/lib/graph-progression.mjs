import {
  DAG_NODE_LAYERS,
  createLayeredDag,
} from "./layered-dag-schema.mjs";
import { normalizeCompletionEvidence, validateCompletionEvidence } from "./completion-evidence.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function normalizeTrigger(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((value) => normalizeText(value)).filter(Boolean);
}

function uniqueList(values) {
  return [...new Set(values)];
}

function mergeOriginalNodeState(normalizedDag, originalGraph) {
  const originalNodes = Array.isArray(originalGraph?.nodes) ? originalGraph.nodes : [];
  for (const node of normalizedDag.nodes) {
    const originalNode = originalNodes.find((candidate) => candidate.id === node.id);
    if (!originalNode) {
      continue;
    }
    node.state = {
      ...node.state,
      ...clone(originalNode.state || {}),
    };
    node.metadata = {
      ...(node.metadata || {}),
      ...clone(originalNode.metadata || {}),
    };
  }
  return normalizedDag;
}

function normalizeGraph(graphInput) {
  return mergeOriginalNodeState(createLayeredDag(clone(graphInput)), graphInput);
}

function findNode(dag, nodeId) {
  const node = dag.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`Graph node not found: ${nodeId}`);
  }
  return node;
}

function dependencyNodes(dag, node) {
  return (node.depends_on || []).map((dependencyId) => findNode(dag, dependencyId));
}

function isNodeDone(node) {
  return node.state.qa_status === "passed";
}

function isNodeRunning(node) {
  return node.state.execution_status === "running";
}

function hasValidationPassed(node) {
  return node.state.validation_status === "passed";
}

function sourceNodeFor(node, dag) {
  const sourceNodeId = node.follow_up?.source_node_id || node.bug_loop?.source_node_id;
  return sourceNodeId ? findNode(dag, sourceNodeId) : null;
}

function nodeHistory(node) {
  if (!Array.isArray(node.metadata.progression_history)) {
    node.metadata.progression_history = [];
  }
  return node.metadata.progression_history;
}

function setState(node, updates) {
  node.state = {
    ...node.state,
    ...updates,
  };
}

function recordEvent(node, kind, payload) {
  nodeHistory(node).push({
    kind,
    at: nowIso(),
    ...payload,
  });
}

function latestEvent(node, kind) {
  const events = nodeHistory(node);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].kind === kind) {
      return events[index];
    }
  }
  return null;
}

function allDependenciesDone(node, dag) {
  return dependencyNodes(dag, node).every((dependency) => isNodeDone(dependency));
}

function tracerBulletsForFeature(dag, node) {
  return dag.nodes.filter((candidate) =>
    candidate.feature_track === node.feature_track &&
    candidate.layer === DAG_NODE_LAYERS.tracerBullet &&
    candidate.tracer_bullet?.gates_deeper_execution,
  );
}

function isBlockedByTracerBullet(node, dag) {
  if (node.layer === DAG_NODE_LAYERS.tracerBullet || node.layer === DAG_NODE_LAYERS.initiative) {
    return false;
  }
  if (node.layer === DAG_NODE_LAYERS.followUp || node.layer === DAG_NODE_LAYERS.bugLoop) {
    return false;
  }
  if (dag.wave_policy?.gated_by_tracer_bullets === false) {
    return false;
  }

  return tracerBulletsForFeature(dag, node).some((tracerBullet) => !isNodeDone(tracerBullet));
}

function triggerSatisfied(node, dag) {
  const source = sourceNodeFor(node, dag);
  if (!source) {
    return true;
  }

  const trigger = normalizeTrigger(node.follow_up?.trigger || node.bug_loop?.trigger);
  if (!trigger || trigger === "always") {
    return true;
  }

  if (trigger.includes("qa_fail")) {
    return source.state.qa_status === "failed";
  }
  if (trigger.includes("review_reject")) {
    return source.state.review_status === "rejected";
  }
  if (trigger.includes("execution_blocked") || trigger.includes("execution_fail")) {
    return ["blocked", "failed", "cancelled"].includes(source.state.execution_status);
  }
  if (trigger.includes("validation_fail")) {
    return source.state.validation_status === "failed";
  }
  if (trigger.includes("feasibility_fail")) {
    return source.state.feasibility_status === "failed";
  }
  if (trigger.includes("reclaim")) {
    return source.state.reclaim_status === "reclaimed";
  }
  if (trigger.includes("done") || trigger.includes("complete")) {
    return isNodeDone(source);
  }

  return false;
}

function computeProgressionStatus(node, dag) {
  if (isNodeDone(node)) {
    return "done";
  }
  if (isNodeRunning(node)) {
    return "executing";
  }
  if (node.state.validation_status === "failed") {
    return "validation_failed";
  }
  if (node.state.qa_status === "failed" || node.state.bug_loop_status === "open") {
    return "bug_loop";
  }
  if (node.state.review_status === "approved" && node.state.qa_status !== "passed") {
    return "qa";
  }
  if (node.state.execution_status === "succeeded" && !hasValidationPassed(node)) {
    return "awaiting_validation";
  }
  if (node.state.execution_status === "succeeded" && node.state.review_status !== "approved") {
    return "review";
  }
  if (!allDependenciesDone(node, dag)) {
    return "blocked_dependency";
  }
  if ((node.layer === DAG_NODE_LAYERS.followUp || node.layer === DAG_NODE_LAYERS.bugLoop) && !triggerSatisfied(node, dag)) {
    return "blocked_trigger";
  }
  if (isBlockedByTracerBullet(node, dag)) {
    return "blocked_tracer_bullet";
  }
  if (node.human_gate?.required) {
    return "blocked_human_gate";
  }
  return "ready_for_handoff";
}

function computeReason(node, progressionStatus) {
  switch (progressionStatus) {
    case "blocked_dependency":
      return "Waiting for dependency completion.";
    case "blocked_trigger":
      return "Waiting for the source-node trigger to fire.";
    case "blocked_tracer_bullet":
      return "Waiting for tracer-bullet validation before deeper execution.";
    case "blocked_human_gate":
      return "Waiting for explicit human approval before progression.";
    case "review":
      return "Execution completed and is waiting for review.";
    case "qa":
      return "Review completed and is waiting for QA.";
    case "bug_loop":
      return "Failure outcome requires bug-loop handling.";
    case "validation_failed":
      return "Execution completed locally, but validation evidence failed.";
    case "awaiting_validation":
      return "Execution completed and is waiting for durable completion evidence.";
    case "executing":
      return "Execution is currently in progress.";
    case "done":
      return "Node is complete.";
    default:
      return "Node is runnable.";
  }
}

function latestRepairDecisions(dag) {
  return dag.nodes
    .map((node) => {
      const decision = latestEvent(node, "repair-decision");
      if (!decision) {
        return null;
      }
      return {
        node_id: node.id,
        action: decision.action,
        reason_code: decision.reason_code || "",
        reason: decision.reason || "",
        repair_node_id: decision.repair_node_id || "",
        failed_wave_id: decision.failed_wave_id || "",
        failure_kind: decision.failure_kind || "",
      };
    })
    .filter(Boolean);
}

function repairContext(node) {
  return node.metadata?.repair_context || {};
}

function rootRepairSourceNodeId(node, dag) {
  const sourceId = node.layer === DAG_NODE_LAYERS.bugLoop
    ? (repairContext(node).root_source_node_id || node.bug_loop?.source_node_id)
    : node.id;

  if (!sourceId || sourceId === node.id) {
    return node.id;
  }

  const sourceNode = findNode(dag, sourceId);
  if (sourceNode.layer !== DAG_NODE_LAYERS.bugLoop) {
    return sourceNode.id;
  }

  return rootRepairSourceNodeId(sourceNode, dag);
}

function repairNodes(dag) {
  return dag.nodes.filter((node) => node.layer === DAG_NODE_LAYERS.bugLoop);
}

function repairNodesForRoot(dag, rootSourceNodeId) {
  return repairNodes(dag).filter((node) => repairContext(node).root_source_node_id === rootSourceNodeId);
}

function repairNodesForPrimarySource(dag, primarySourceNodeId) {
  return repairNodes(dag).filter((node) => repairContext(node).primary_source_node_id === primarySourceNodeId);
}

function repairNodesForWave(dag, failedWaveId) {
  if (!failedWaveId) {
    return [];
  }
  return repairNodes(dag).filter((node) => repairContext(node).failed_wave_id === failedWaveId);
}

function repairNodesWithCriterion(dag, rootSourceNodeId, criterion) {
  const normalizedCriterion = normalizeText(criterion);
  if (!normalizedCriterion) {
    return [];
  }

  return repairNodesForRoot(dag, rootSourceNodeId).filter((node) =>
    normalizeList(repairContext(node).failed_acceptance_criteria).includes(normalizedCriterion)
  );
}

function computedRepairDependencies(sourceNodes) {
  return uniqueList(sourceNodes.flatMap((node) => normalizeList(node.depends_on)))
    .filter((dependencyId) => !sourceNodes.some((node) => node.id === dependencyId));
}

function allowedRepairWriteSurface(sourceNodes) {
  return uniqueList(sourceNodes.flatMap((node) => normalizeList(node.write_surface)));
}

function writeSurfaceExpansion(allowedWriteSurface, requestedWriteSurface) {
  const expandedPaths = requestedWriteSurface.filter((path) => !allowedWriteSurface.includes(path));
  return {
    expanded: expandedPaths.length > 0,
    expanded_paths: expandedPaths,
  };
}

function makeRepairNodeId(dag, primarySourceNodeId) {
  const existingIds = new Set(dag.nodes.map((node) => node.id));
  let sequence = 1;
  let candidate = `${primarySourceNodeId}-bug-loop-${sequence}`;

  while (existingIds.has(candidate)) {
    sequence += 1;
    candidate = `${primarySourceNodeId}-bug-loop-${sequence}`;
  }

  return candidate;
}

function buildRepairDecision(reasonCode, reason, details = {}) {
  return {
    action: reasonCode === "repair_created" ? "create_repair_node" : "escalate",
    reason_code: reasonCode,
    reason,
    ...details,
  };
}

function planAutomaticRepair(dag, options) {
  const sourceNodeIds = uniqueList(normalizeList(options.sourceNodeIds?.length ? options.sourceNodeIds : [options.nodeId]));
  const sourceNodes = sourceNodeIds.map((nodeId) => findNode(dag, nodeId));
  const primarySourceNodeId = normalizeText(options.primarySourceNodeId) || sourceNodes[0]?.id || "";
  const primarySourceNode = findNode(dag, primarySourceNodeId);
  const rootSourceNodeId = rootRepairSourceNodeId(primarySourceNode, dag);
  const failureKind = normalizeTrigger(options.failureKind || options.outcome || "validation_fail");
  const failedWaveId = normalizeText(options.failedWaveId);
  const failureCriteria = uniqueList(normalizeList(options.failedAcceptanceCriteria));
  const allowedWriteSurface = allowedRepairWriteSurface(sourceNodes);
  const requestedWriteSurface = uniqueList(normalizeList(options.writeSurface).length > 0
    ? normalizeList(options.writeSurface)
    : allowedWriteSurface);
  const scopeCheck = writeSurfaceExpansion(allowedWriteSurface, requestedWriteSurface);
  const sameNodeRepairs = repairNodesForPrimarySource(dag, primarySourceNodeId);
  const waveRepairs = repairNodesForWave(dag, failedWaveId);
  const descendantRepairs = repairNodesForRoot(dag, rootSourceNodeId);
  const repeatedCriterion = failureCriteria.find((criterion) =>
    repairNodesWithCriterion(dag, rootSourceNodeId, criterion).length > 0
  );

  if (repeatedCriterion) {
    return buildRepairDecision(
      "repeated_acceptance_criterion",
      `Automatic repair escalated because acceptance criterion "${repeatedCriterion}" already failed in this repair lineage.`,
      {
        primary_source_node_id: primarySourceNodeId,
        root_source_node_id: rootSourceNodeId,
        source_node_ids: sourceNodeIds,
        failed_wave_id: failedWaveId,
        failure_kind: failureKind,
        failed_acceptance_criteria: failureCriteria,
      },
    );
  }

  if (scopeCheck.expanded) {
    return buildRepairDecision(
      "scope_expanded",
      "Automatic repair escalated because the proposed write surface exceeds the original affected area.",
      {
        primary_source_node_id: primarySourceNodeId,
        root_source_node_id: rootSourceNodeId,
        source_node_ids: sourceNodeIds,
        failed_wave_id: failedWaveId,
        failure_kind: failureKind,
        requested_write_surface: requestedWriteSurface,
        allowed_write_surface: allowedWriteSurface,
        expanded_paths: scopeCheck.expanded_paths,
      },
    );
  }

  if (sameNodeRepairs.length >= 2) {
    return buildRepairDecision(
      "same_node_cap_exceeded",
      `Automatic repair escalated because node ${primarySourceNodeId} already reached the same-node repair cap.`,
      {
        primary_source_node_id: primarySourceNodeId,
        root_source_node_id: rootSourceNodeId,
        source_node_ids: sourceNodeIds,
        failed_wave_id: failedWaveId,
        failure_kind: failureKind,
        same_node_repairs: sameNodeRepairs.length,
        same_node_cap: 2,
      },
    );
  }

  if (waveRepairs.length >= 2) {
    return buildRepairDecision(
      "wave_cap_exceeded",
      `Automatic repair escalated because failed wave ${failedWaveId} already reached the auto-repair cap.`,
      {
        primary_source_node_id: primarySourceNodeId,
        root_source_node_id: rootSourceNodeId,
        source_node_ids: sourceNodeIds,
        failed_wave_id: failedWaveId,
        failure_kind: failureKind,
        wave_repairs: waveRepairs.length,
        wave_cap: 2,
      },
    );
  }

  if (descendantRepairs.length >= 3) {
    return buildRepairDecision(
      "descendant_cap_exceeded",
      `Automatic repair escalated because original node ${rootSourceNodeId} already reached the descendant repair cap.`,
      {
        primary_source_node_id: primarySourceNodeId,
        root_source_node_id: rootSourceNodeId,
        source_node_ids: sourceNodeIds,
        failed_wave_id: failedWaveId,
        failure_kind: failureKind,
        descendant_repairs: descendantRepairs.length,
        descendant_cap: 3,
      },
    );
  }

  const repairNodeId = makeRepairNodeId(dag, primarySourceNodeId);
  return buildRepairDecision(
    "repair_created",
    "Automatic repair node created from the failure outcome.",
    {
      primary_source_node_id: primarySourceNodeId,
      root_source_node_id: rootSourceNodeId,
      source_node_ids: sourceNodeIds,
      failed_wave_id: failedWaveId,
      failure_kind: failureKind,
      failed_acceptance_criteria: failureCriteria,
      repair_node_id: repairNodeId,
      same_node_repairs: sameNodeRepairs.length,
      wave_repairs: waveRepairs.length,
      descendant_repairs: descendantRepairs.length,
      requested_write_surface: requestedWriteSurface,
      allowed_write_surface: allowedWriteSurface,
      depends_on: computedRepairDependencies(sourceNodes),
    },
  );
}

function createAutomaticRepairNode(dag, decision, options) {
  const primarySourceNode = findNode(dag, decision.primary_source_node_id);
  const sourceNodes = decision.source_node_ids.map((nodeId) => findNode(dag, nodeId));
  const title = normalizeText(options.title) || `Repair: ${primarySourceNode.title}`;
  const goal = normalizeText(options.goal)
    || `Repair the failure from ${decision.source_node_ids.join(", ")} without widening scope.`;
  const acceptanceCriteria = uniqueList(normalizeList(options.acceptanceCriteria).length > 0
    ? normalizeList(options.acceptanceCriteria)
    : [`Repair ${decision.failure_kind || "failure"} for ${primarySourceNode.id} without widening scope.`]);
  const verificationPlan = {
    automated: normalizeList(options.verificationPlan?.automated).length > 0
      ? normalizeList(options.verificationPlan.automated)
      : normalizeList(primarySourceNode.verification_plan?.automated),
    manual: normalizeList(options.verificationPlan?.manual),
    evidence_expected: normalizeList(options.verificationPlan?.evidence_expected).length > 0
      ? normalizeList(options.verificationPlan.evidence_expected)
      : ["Repair evidence linked to the source failure."],
  };

  return {
    id: decision.repair_node_id,
    title,
    layer: DAG_NODE_LAYERS.bugLoop,
    feature_track: primarySourceNode.feature_track,
    goal,
    depends_on: decision.depends_on,
    acceptance_criteria: acceptanceCriteria,
    verification_plan: verificationPlan,
    write_surface: decision.requested_write_surface,
    conflict_surface: primarySourceNode.conflict_surface,
    conflict_reasoning: normalizeText(options.conflictReasoning)
      || `Auto-repair inherits the affected surface from ${decision.source_node_ids.join(", ")}.`,
    risk: primarySourceNode.risk,
    confidence: "medium",
    ambiguity_signals: [],
    provider_eligibility: clone(primarySourceNode.provider_eligibility || {}),
    human_gate: {
      required: false,
      reason: "",
      approval_scope: "",
    },
    tracer_bullet: {},
    execution: {
      queue_class: "bug-loop",
      parallelizable: false,
      retry_budget: 1,
      stop_conditions: ["Repair acceptance criteria are satisfied."],
      escalation_rules: [
        "Escalate when same-node or wave-level repair caps are exceeded.",
        "Escalate when repair scope widens beyond the original affected area.",
      ],
    },
    tracker: {
      issue_number: null,
      labels: ["bug-loop", "auto-repair"],
      execution_stage: "Ready for Handoff",
      execution_lane: "Handoff",
      dependency_state: "unblocked",
      conflict_surface: primarySourceNode.conflict_surface,
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
    bug_loop: {
      source_node_id: primarySourceNode.id,
      trigger: decision.failure_kind,
      reentry_policy: "Re-enter the source path after repair validation.",
    },
    metadata: {
      repair_context: {
        auto_inserted: true,
        primary_source_node_id: decision.primary_source_node_id,
        root_source_node_id: decision.root_source_node_id,
        source_node_ids: decision.source_node_ids,
        failed_wave_id: decision.failed_wave_id,
        failure_kind: decision.failure_kind,
        failed_acceptance_criteria: decision.failed_acceptance_criteria || [],
        source_failure_reason: normalizeText(options.reason),
        lineage_depth: decision.descendant_repairs + 1,
      },
      progression_history: [
        {
          kind: "repair-created",
          at: nowIso(),
          actor: normalizeText(options.actor),
          repair_node_id: decision.repair_node_id,
          source_node_ids: decision.source_node_ids,
          failure_kind: decision.failure_kind,
          reason: normalizeText(options.reason),
        },
      ],
    },
  };
}

export function recomputeGraphProgression(graphInput) {
  const dag = normalizeGraph(graphInput);

  for (const node of dag.nodes) {
    node.metadata = node.metadata || {};
    const progressionStatus = computeProgressionStatus(node, dag);
    setState(node, {
      progression_status: progressionStatus,
      progression_reason: computeReason(node, progressionStatus),
    });
  }

  dag.progression = {
    runnable_nodes: dag.nodes
      .filter((node) => node.state.progression_status === "ready_for_handoff")
      .map((node) => node.id),
    blocked_nodes: dag.nodes
      .filter((node) => !["ready_for_handoff", "done"].includes(node.state.progression_status))
      .map((node) => node.id),
    completed_nodes: dag.nodes
      .filter((node) => node.state.progression_status === "done")
      .map((node) => node.id),
    repair_decisions: latestRepairDecisions(dag),
  };

  return dag;
}

export function applyExecutionOutcome(graphInput, { nodeId, outcome, actor = "", reason = "" }) {
  const dag = normalizeGraph(graphInput);
  const node = findNode(dag, nodeId);
  const normalizedOutcome = normalizeTrigger(outcome);

  if (!["launch", "succeeded", "blocked", "failed", "cancelled"].includes(normalizedOutcome)) {
    throw new Error(`Unsupported execution outcome: ${outcome}`);
  }

  if (normalizedOutcome === "launch") {
    setState(node, {
      execution_status: "running",
    });
  } else {
    setState(node, {
      execution_status: normalizedOutcome,
      review_status: normalizedOutcome === "succeeded" ? "pending" : node.state.review_status,
      qa_status: normalizedOutcome === "succeeded" ? "pending" : node.state.qa_status,
      validation_status: normalizedOutcome === "succeeded" ? "pending" : node.state.validation_status,
      bug_loop_status: ["blocked", "failed", "cancelled"].includes(normalizedOutcome) ? "open" : node.state.bug_loop_status,
    });
  }

  recordEvent(node, "execution", {
    actor,
    outcome: normalizedOutcome,
    reason,
  });

  return recomputeGraphProgression(dag);
}

export function applyCompletionEvidence(graphInput, {
  nodeId,
  evidence,
  actor = "",
  reason = "",
}) {
  const dag = normalizeGraph(graphInput);
  const node = findNode(dag, nodeId);
  const validation = validateCompletionEvidence(node, evidence, {
    requireReviewEvidence: false,
  });

  node.metadata = node.metadata || {};
  node.metadata.completion_evidence = normalizeCompletionEvidence(validation.evidence);
  node.metadata.completion_validation = {
    required_test_dimensions: validation.required_test_dimensions,
    failed_test_dimensions: validation.failed_test_dimensions,
    errors: validation.errors,
  };

  setState(node, {
    validation_status: validation.ok ? "passed" : "failed",
  });
  recordEvent(node, "completion-evidence", {
    actor,
    outcome: validation.ok ? "validated" : "validation_failed",
    reason,
    errors: validation.errors,
    failed_test_dimensions: validation.failed_test_dimensions,
  });

  return recomputeGraphProgression(dag);
}

export function applyReviewOutcome(graphInput, { nodeId, outcome, actor = "", reason = "" }) {
  const dag = normalizeGraph(graphInput);
  const node = findNode(dag, nodeId);
  const normalizedOutcome = normalizeTrigger(outcome);

  if (!["approved", "rejected"].includes(normalizedOutcome)) {
    throw new Error(`Unsupported review outcome: ${outcome}`);
  }
  if (normalizedOutcome === "approved" && node.state.validation_status !== "passed") {
    throw new Error(`Review approval requires validated completion evidence first. Node ${nodeId} validation status is ${node.state.validation_status || "pending"}.`);
  }

  setState(node, {
    review_status: normalizedOutcome,
    qa_status: normalizedOutcome === "rejected" ? "pending" : node.state.qa_status,
    execution_status: normalizedOutcome === "rejected" ? "pending" : node.state.execution_status,
  });
  recordEvent(node, "review", {
    actor,
    outcome: normalizedOutcome,
    reason,
  });

  return recomputeGraphProgression(dag);
}

export function applyQaOutcome(graphInput, { nodeId, outcome, actor = "", reason = "" }) {
  const dag = normalizeGraph(graphInput);
  const node = findNode(dag, nodeId);
  const normalizedOutcome = normalizeTrigger(outcome);

  if (!["passed", "failed"].includes(normalizedOutcome)) {
    throw new Error(`Unsupported QA outcome: ${outcome}`);
  }
  if (normalizedOutcome === "passed" && node.state.validation_status !== "passed") {
    throw new Error(`QA pass requires validated completion evidence first. Node ${nodeId} validation status is ${node.state.validation_status || "pending"}.`);
  }

  setState(node, {
    qa_status: normalizedOutcome,
    bug_loop_status: normalizedOutcome === "failed" ? "open" : "resolved",
  });
  recordEvent(node, "qa", {
    actor,
    outcome: normalizedOutcome,
    reason,
  });

  return recomputeGraphProgression(dag);
}

export function applyReclaimOutcome(graphInput, { nodeId, actor = "", reason = "" }) {
  const dag = normalizeGraph(graphInput);
  const node = findNode(dag, nodeId);

  setState(node, {
    execution_status: "pending",
    review_status: "pending",
    qa_status: "pending",
    validation_status: "pending",
    reclaim_status: "reclaimed",
  });
  recordEvent(node, "reclaim", {
    actor,
    outcome: "reclaimed",
    reason,
  });

  return recomputeGraphProgression(dag);
}

export function applyBugLoopOutcome(graphInput, { nodeId, outcome, actor = "", reason = "" }) {
  const dag = normalizeGraph(graphInput);
  const node = findNode(dag, nodeId);
  const normalizedOutcome = normalizeTrigger(outcome);

  if (!["opened", "resolved"].includes(normalizedOutcome)) {
    throw new Error(`Unsupported bug-loop outcome: ${outcome}`);
  }

  setState(node, {
    bug_loop_status: normalizedOutcome === "opened" ? "open" : "resolved",
    execution_status: normalizedOutcome === "resolved" ? "pending" : node.state.execution_status,
    review_status: normalizedOutcome === "resolved" ? "pending" : node.state.review_status,
    qa_status: normalizedOutcome === "resolved" ? "pending" : node.state.qa_status,
    validation_status: normalizedOutcome === "resolved" ? "pending" : node.state.validation_status,
  });
  recordEvent(node, "bug-loop", {
    actor,
    outcome: normalizedOutcome,
    reason,
  });

  return recomputeGraphProgression(dag);
}

export function applyAutomaticBugLoopRepair(graphInput, {
  nodeId,
  sourceNodeIds = [],
  primarySourceNodeId = "",
  failureKind = "",
  failedWaveId = "",
  failedAcceptanceCriteria = [],
  title = "",
  goal = "",
  acceptanceCriteria = [],
  verificationPlan = {},
  writeSurface = [],
  conflictReasoning = "",
  actor = "",
  reason = "",
}) {
  const dag = normalizeGraph(graphInput);
  const decision = planAutomaticRepair(dag, {
    nodeId,
    sourceNodeIds,
    primarySourceNodeId,
    failureKind,
    failedWaveId,
    failedAcceptanceCriteria,
    writeSurface,
  });

  for (const sourceNodeId of decision.source_node_ids || []) {
    const sourceNode = findNode(dag, sourceNodeId);
    recordEvent(sourceNode, "repair-decision", {
      actor,
      action: decision.action,
      reason_code: decision.reason_code,
      reason: decision.reason,
      repair_node_id: decision.repair_node_id || "",
      failed_wave_id: decision.failed_wave_id || "",
      failure_kind: decision.failure_kind || "",
      failed_acceptance_criteria: decision.failed_acceptance_criteria || [],
    });
  }

  if (decision.action === "create_repair_node") {
    dag.nodes.push(createAutomaticRepairNode(dag, decision, {
      actor,
      reason,
      title,
      goal,
      acceptanceCriteria,
      verificationPlan,
      conflictReasoning,
    }));
  }

  return recomputeGraphProgression(dag);
}
