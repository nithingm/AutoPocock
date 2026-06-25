function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  const text = normalizeText(value);
  return text ? [text] : [];
}

function asNodeMap(dag) {
  return new Map((Array.isArray(dag?.nodes) ? dag.nodes : []).map((node) => [node.id, node]));
}

function asLoopSpecMap(loopSpecs) {
  const map = new Map();
  for (const loopSpec of Array.isArray(loopSpecs) ? loopSpecs : []) {
    const nodeId = normalizeText(loopSpec?.dag_node_id);
    if (nodeId) {
      map.set(nodeId, loopSpec);
    }
  }
  return map;
}

function asReconciliationMap(reconciliation) {
  const map = new Map();
  for (const mapping of Array.isArray(reconciliation?.mappings) ? reconciliation.mappings : []) {
    const nodeId = normalizeText(mapping?.node_id);
    if (nodeId) {
      map.set(nodeId, mapping);
    }
  }
  return map;
}

function driftByNodeId(reconciliation) {
  const map = new Map();
  for (const entry of Array.isArray(reconciliation?.drift) ? reconciliation.drift : []) {
    const nodeId = normalizeText(entry?.node_id);
    if (!nodeId) {
      continue;
    }
    const current = map.get(nodeId) || [];
    current.push(entry);
    map.set(nodeId, current);
  }
  return map;
}

function isTracerBullet(node) {
  return (
    node?.tracer_bullet === true ||
    node?.tracer_bullet?.is_tracer_bullet === true ||
    normalizeText(node?.layer) === "tracer_bullet" ||
    normalizeText(node?.layer_kind) === "tracer_bullet" ||
    normalizeText(node?.queue_class) === "tracer-bullet" ||
    normalizeText(node?.execution?.queue_class) === "tracer-bullet"
  );
}

function isExecutionEligible(node) {
  if (typeof node?.execution_eligible === "boolean") {
    return node.execution_eligible;
  }
  if (typeof node?.execution_eligibility?.eligible === "boolean") {
    return node.execution_eligibility.eligible;
  }
  if (typeof node?.quality?.execution_eligibility?.status === "string") {
    return node.quality.execution_eligibility.status === "eligible";
  }
  if (typeof node?.quality_gate?.execution_eligible === "boolean") {
    return node.quality_gate.execution_eligible;
  }
  return node?.provider_eligible !== false && node?.human_gate_required !== true;
}

function eligibilityReasons(node) {
  return [
    ...normalizeList(node?.execution_eligibility_reasons),
    ...normalizeList(node?.execution_eligibility?.reasons),
    ...normalizeList(node?.quality_gate?.reasons),
    ...normalizeList(node?.quality?.execution_eligibility?.reasons),
  ];
}

function unmetDependencies(node, completedNodeIds) {
  return normalizeList(node?.depends_on).filter((dependencyId) => !completedNodeIds.has(dependencyId));
}

function trackerReadiness(node) {
  const executionStage = normalizeText(
    node?.tracker?.execution_stage || node?.execution_stage || node?.status || "",
  ).toLowerCase();
  const dependencyState = normalizeText(
    node?.tracker?.dependency_state || node?.dependency_state || "",
  ).toLowerCase();

  const allowedStage =
    !executionStage ||
    executionStage === "ready for handoff" ||
    executionStage === "ready_for_handoff" ||
    executionStage === "queued";
  const dependencyReady = !dependencyState || dependencyState === "unblocked";

  return {
    execution_stage: executionStage,
    dependency_state: dependencyState,
    ready: allowedStage && dependencyReady,
  };
}

function blockingDriftReasons(entries) {
  const blockingCategories = new Set([
    "mapping_conflict",
    "missing_mapped_issue",
    "duplicate_live_matches",
    "live_issue_node_mismatch",
  ]);

  return entries
    .filter((entry) => blockingCategories.has(normalizeText(entry?.category)))
    .map((entry) => normalizeText(entry?.message || entry?.category))
    .filter(Boolean);
}

function launchPriority(node) {
  const wave = Number(node?.wave ?? node?.execution_wave ?? 9999);
  const layerIndex = Number(node?.layer_index ?? 9999);
  return [Number.isFinite(wave) ? wave : 9999, Number.isFinite(layerIndex) ? layerIndex : 9999, normalizeText(node?.id)];
}

function comparePriority(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] < right[index]) {
      return -1;
    }
    if (left[index] > right[index]) {
      return 1;
    }
  }
  return 0;
}

function graphCompletedNodeIds(dag) {
  const completed = normalizeList(dag?.progression?.completed_nodes);
  return new Set(completed);
}

function graphId(dag) {
  return normalizeText(dag?.graph_id || dag?.dag_id || dag?.source_prd || "graph");
}

function nodeById(dag, nodeId) {
  return (Array.isArray(dag?.nodes) ? dag.nodes : []).find((node) => normalizeText(node?.id) === normalizeText(nodeId)) || null;
}

function allNodeIds(dag) {
  return new Set((Array.isArray(dag?.nodes) ? dag.nodes : []).map((node) => normalizeText(node?.id)).filter(Boolean));
}

function actionableNode(node) {
  if (typeof node?.actionable === "boolean") {
    return node.actionable;
  }
  return true;
}

function outgoingEdgeCounts(dag) {
  const counts = new Map();
  for (const edge of Array.isArray(dag?.edges) ? dag.edges : []) {
    const from = normalizeText(edge?.from);
    if (!from) {
      continue;
    }
    counts.set(from, (counts.get(from) || 0) + 1);
  }
  return counts;
}

function candidateReviewCost(node) {
  const explicit = Number(
    node?.estimated_review_cost ??
    node?.review_cost ??
    node?.metadata?.estimated_review_cost ??
    node?.execution?.estimated_review_cost,
  );
  if (Number.isFinite(explicit) && explicit >= 0) {
    return explicit;
  }

  return (
    normalizeList(node?.acceptance_criteria).length +
    normalizeList(node?.verification_plan?.automated).length +
    normalizeList(node?.verification_plan?.manual).length
  ) || 1;
}

function rawWriteSurfaces(node) {
  return uniqueList([
    ...normalizeList(node?.write_surface),
    ...normalizeList(node?.owned_surface),
    ...normalizeList(node?.execution?.owned_surface),
  ]);
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeSurfacePath(surface) {
  let normalized = normalizeText(surface).replace(/\\/g, "/");
  normalized = normalized.replace(/^\.\/+/, "");
  normalized = normalized.replace(/\/\*\*$/g, "");
  normalized = normalized.replace(/\/\*$/g, "");
  normalized = normalized.replace(/\*+$/g, "");
  normalized = normalized.replace(/\/+$/, "");
  return normalized;
}

function foundationSurface(surface) {
  const normalized = normalizeSurfacePath(surface).toLowerCase();
  if (!normalized) {
    return "";
  }
  if (
    normalized.includes("db/schema") ||
    normalized.includes("schema.prisma") ||
    normalized.includes("prisma/schema") ||
    normalized.includes("drizzle") ||
    normalized.includes("migrations")
  ) {
    return normalized.includes("migration")
      ? "foundation:db/migrations"
      : "foundation:db/schema";
  }
  if (
    normalized.includes("contract") ||
    normalized.includes("openapi") ||
    normalized.includes("graphql/schema") ||
    normalized.includes("shared/types") ||
    normalized.includes("generated/types") ||
    normalized.includes("api/schema")
  ) {
    return "foundation:shared/contracts";
  }
  if (
    /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|turbo\.json|tsconfig.*|vite\.config.*|webpack\.config.*|eslint.*|prettier.*)$/.test(normalized) ||
    normalized.includes(".github/workflows") ||
    normalized.includes("build/config")
  ) {
    return "foundation:build/config";
  }
  return "";
}

function trimFileSegment(normalized) {
  if (!normalized) {
    return "";
  }
  if (/\.[a-z0-9]+$/i.test(normalized)) {
    const segments = normalized.split("/");
    segments.pop();
    return segments.join("/");
  }
  return normalized;
}

function stableSurface(surface) {
  const normalized = trimFileSegment(normalizeSurfacePath(surface));
  if (!normalized) {
    return "";
  }

  const foundation = foundationSurface(normalized);
  if (foundation) {
    return foundation;
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length >= 3 && segments[0] === "scripts" && segments[1] === "lib") {
    return segments.slice(0, 3).join("/");
  }
  if (segments.length >= 2) {
    return segments.slice(0, 2).join("/");
  }
  return segments[0] || normalized;
}

function normalizedSurfaceMetadata(node) {
  const normalized = uniqueList(rawWriteSurfaces(node).map((surface) => stableSurface(surface)).filter(Boolean));
  const foundation = normalized.filter((surface) => surface.startsWith("foundation:"));
  return {
    raw_write_surfaces: rawWriteSurfaces(node),
    normalized_write_surfaces: normalized,
    primary_surface: normalized[0] || "",
    secondary_surfaces: normalized.slice(1),
    foundation_surfaces: foundation,
    parallel_safety_mode: foundation.length > 0 ? "exclusive-foundation" : "shared-safe",
  };
}

function conflictIsolationScore(surfaceMetadata, node) {
  const explicit = normalizeText(node?.conflict_surface || node?.tracker?.conflict_surface || "").toLowerCase();
  if (surfaceMetadata.foundation_surfaces.length > 0) {
    return 3;
  }
  if (explicit === "high") {
    return 2;
  }
  if (explicit === "medium") {
    return 1;
  }
  return 0;
}

function dependencyUnlockValue(node, dag, completedNodeIds) {
  const explicit = Number(node?.dependency_unlock_value ?? node?.metadata?.dependency_unlock_value);
  if (Number.isFinite(explicit) && explicit >= 0) {
    return explicit;
  }

  const nodeId = normalizeText(node?.id);
  let unlocks = 0;
  for (const candidate of Array.isArray(dag?.nodes) ? dag.nodes : []) {
    const dependencies = normalizeList(candidate?.depends_on);
    if (!dependencies.includes(nodeId)) {
      continue;
    }
    const remaining = dependencies.filter((dependencyId) => dependencyId !== nodeId && !completedNodeIds.has(dependencyId));
    if (remaining.length === 0) {
      unlocks += 1;
    }
  }
  return unlocks;
}

function topologicalPosition(node, dag) {
  const explicit = Number(node?.topological_index);
  if (Number.isFinite(explicit)) {
    return explicit;
  }
  const order = Array.isArray(dag?.topological_order) ? dag.topological_order : [];
  const index = order.indexOf(node?.id);
  return index === -1 ? 9999 : index;
}

function plannerPriority(candidate) {
  return [
    candidate.tracer_bullet ? 0 : 1,
    -candidate.dependency_unlock_value,
    candidate.conflict_isolation_score,
    candidate.estimated_review_cost,
    candidate.topological_index,
    candidate.node_id,
  ];
}

function comparePlannerPriority(left, right) {
  return comparePriority(plannerPriority(left), plannerPriority(right));
}

function readyFrontierCandidates(dag) {
  const completedNodeIds = graphCompletedNodeIds(dag);
  const knownNodeIds = allNodeIds(dag);

  return (Array.isArray(dag?.nodes) ? dag.nodes : [])
    .filter((node) => actionableNode(node))
    .filter((node) => knownNodeIds.has(node.id))
    .filter((node) => !completedNodeIds.has(node.id))
    .map((node) => {
      const unmet = unmetDependencies(node, completedNodeIds);
      const tracker = trackerReadiness(node);
      const surfaceMetadata = normalizedSurfaceMetadata(node);
      const reasons = [];

      if (!isExecutionEligible(node)) {
        reasons.push(...eligibilityReasons(node));
      }
      if (unmet.length > 0) {
        reasons.push(`Unmet dependencies: ${unmet.join(", ")}`);
      }
      if (!tracker.ready) {
        reasons.push("Tracker state is not ready for orchestration.");
      }

      return {
        node_id: node.id,
        title: normalizeText(node?.title),
        tracer_bullet: isTracerBullet(node),
        topological_index: topologicalPosition(node, dag),
        dependency_unlock_value: dependencyUnlockValue(node, dag, completedNodeIds),
        estimated_review_cost: candidateReviewCost(node),
        conflict_isolation_score: conflictIsolationScore(surfaceMetadata, node),
        unmet_dependencies: unmet,
        tracker,
        execution_parallelizable: node?.execution?.parallelizable === true || node?.parallelizable === true,
        eligible: reasons.length === 0,
        ineligible_reasons: reasons,
        ...surfaceMetadata,
        node,
      };
    })
    .filter((candidate) => candidate.unmet_dependencies.length === 0)
    .sort(comparePlannerPriority);
}

function sharedSurfaces(left, right) {
  const rightSurfaces = new Set(right.normalized_write_surfaces);
  return left.normalized_write_surfaces.filter((surface) => rightSurfaces.has(surface));
}

function samePrimarySurface(left, right) {
  return Boolean(left.primary_surface && left.primary_surface === right.primary_surface);
}

function candidateConflictReasons(candidate, selected) {
  const reasons = [];
  if (selected.length === 0) {
    return reasons;
  }

  if (!candidate.execution_parallelizable) {
    reasons.push("Node is not marked parallelizable and must run alone.");
    return reasons;
  }

  if (candidate.parallel_safety_mode === "exclusive-foundation") {
    reasons.push("Node owns a strict foundation surface and must run in an exclusive wave.");
    return reasons;
  }

  for (const active of selected) {
    if (!active.execution_parallelizable) {
      reasons.push(`Conflicts with ${active.node_id} because that node is not parallelizable.`);
      continue;
    }
    if (active.parallel_safety_mode === "exclusive-foundation") {
      reasons.push(`Conflicts with ${active.node_id} because it owns a strict foundation surface.`);
      continue;
    }
    if (samePrimarySurface(candidate, active)) {
      reasons.push(`Conflicts with ${active.node_id} on primary surface ${candidate.primary_surface}.`);
      continue;
    }

    const overlap = sharedSurfaces(candidate, active);
    if (overlap.length > 0) {
      reasons.push(`Conflicts with ${active.node_id} on shared normalized surface ${overlap.join(", ")}.`);
    }
  }

  return uniqueList(reasons);
}

function approvedBundleEntries(approvedBundle) {
  return Array.isArray(approvedBundle?.selected_nodes) ? approvedBundle.selected_nodes : [];
}

function normalizeDependencySet(value) {
  return uniqueList(normalizeList(value)).sort();
}

function providerEligibilityFromLoopSpec(loopSpec) {
  if (typeof loopSpec?.execution_contract?.eligibility?.eligible === "boolean") {
    return loopSpec.execution_contract.eligibility.eligible;
  }
  if (typeof loopSpec?.execution_contract?.provider_eligible === "boolean") {
    return loopSpec.execution_contract.provider_eligible;
  }
  return true;
}

function providerEligibilityReasonsFromLoopSpec(loopSpec) {
  return [
    ...normalizeList(loopSpec?.execution_contract?.eligibility?.reasons),
    ...normalizeList(loopSpec?.execution_contract?.escalation_rules),
  ];
}

function bundleApprovalStatus(approvedBundle) {
  return normalizeText(approvedBundle?.approval?.status).toLowerCase();
}

function findLoopSpecForNode({ bundleEntry, loopSpecMap, nodeId }) {
  const explicitId = normalizeText(bundleEntry?.loop_spec?.loop_spec_id);
  if (explicitId) {
    for (const candidate of loopSpecMap.values()) {
      if (normalizeText(candidate?.loop_spec_id) === explicitId) {
        return candidate;
      }
    }
  }
  return loopSpecMap.get(nodeId) || bundleEntry?.loop_spec || null;
}

function nodePreflightReasons({ dag, node, nodeId, loopSpec, mapping, driftEntries, completedNodeIds }) {
  const reasons = [];

  if (!node) {
    return ["Approved bundle references a DAG node that no longer exists."];
  }

  if (!mapping || !Number.isFinite(Number(mapping.issue_number))) {
    reasons.push("Node is not mapped to a synchronized GitHub issue.");
  }

  const tracker = trackerReadiness(node);
  if (!tracker.ready) {
    reasons.push("Tracker state is not ready for orchestration.");
  }

  if (!isExecutionEligible(node)) {
    reasons.push(...eligibilityReasons(node));
  }

  const unmet = unmetDependencies(node, completedNodeIds);
  if (unmet.length > 0) {
    reasons.push(`Unmet dependencies: ${unmet.join(", ")}`);
  }

  reasons.push(...blockingDriftReasons(driftEntries));

  if (!loopSpec) {
    reasons.push("Loop Spec has not been compiled for this node.");
    return uniqueList(reasons);
  }

  if (normalizeText(loopSpec?.dag_node_id) && normalizeText(loopSpec?.dag_node_id) !== nodeId) {
    reasons.push(`Loop Spec ${normalizeText(loopSpec?.loop_spec_id)} points at ${normalizeText(loopSpec?.dag_node_id)} instead of ${nodeId}.`);
  }

  if (normalizeText(loopSpec?.source?.dag_id) && normalizeText(loopSpec?.source?.dag_id) !== graphId(dag)) {
    reasons.push(`Loop Spec source DAG ${normalizeText(loopSpec?.source?.dag_id)} does not match ${graphId(dag)}.`);
  }

  const dagDependencies = normalizeDependencySet(node?.depends_on);
  const loopDependencies = normalizeDependencySet(loopSpec?.dependencies?.depends_on);
  const extraLoopDependencies = loopDependencies.filter((dependencyId) => !dagDependencies.includes(dependencyId));
  const missingLoopDependencies = dagDependencies.filter((dependencyId) => !loopDependencies.includes(dependencyId));
  if (extraLoopDependencies.length > 0 || missingLoopDependencies.length > 0) {
    const divergence = [
      extraLoopDependencies.length > 0 ? extraLoopDependencies.join(", ") : "",
      missingLoopDependencies.length > 0 ? `missing ${missingLoopDependencies.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    reasons.push(`Loop Spec dependency contract diverges from the DAG: ${divergence}.`);
  }

  if (node?.provider_eligible === false && loopSpec?.execution_contract?.provider_eligible !== false) {
    reasons.push("Loop Spec marks the node provider-eligible even though the DAG blocks provider execution.");
  }
  if (node?.human_gate_required === true && loopSpec?.execution_contract?.human_gate_required !== true) {
    reasons.push("Loop Spec omits a required human gate from the DAG contract.");
  }
  if (!providerEligibilityFromLoopSpec(loopSpec)) {
    const loopReasons = providerEligibilityReasonsFromLoopSpec(loopSpec);
    reasons.push(...(loopReasons.length > 0 ? loopReasons : ["Loop Spec execution contract is not provider-eligible."]));
  }

  return uniqueList(reasons);
}

export function planDagExecutionWave({
  dag,
  maxParallel = 1,
} = {}) {
  if (!dag || !Array.isArray(dag.nodes)) {
    throw new Error("A DAG with a nodes array is required.");
  }

  const boundedMaxParallel = Math.max(1, Number(maxParallel) || 1);
  const frontier = readyFrontierCandidates(dag);
  const readyFrontier = frontier.filter((candidate) => candidate.eligible);
  const selected = [];
  const deferred = [];
  const blocked = frontier
    .filter((candidate) => !candidate.eligible)
    .map((candidate) => ({
      node_id: candidate.node_id,
      reasons: candidate.ineligible_reasons,
    }));

  for (const candidate of readyFrontier) {
    if (selected.length >= boundedMaxParallel) {
      deferred.push({
        node_id: candidate.node_id,
        reasons: ["Deferred by max-parallel policy after higher-priority nodes were selected."],
      });
      continue;
    }

    const conflictReasons = candidateConflictReasons(candidate, selected);
    if (conflictReasons.length > 0) {
      deferred.push({
        node_id: candidate.node_id,
        reasons: conflictReasons,
      });
      continue;
    }

    selected.push(candidate);
  }

  const readyNodeIds = frontier.map((candidate) => candidate.node_id);
  const blockedByReadiness = (Array.isArray(dag?.nodes) ? dag.nodes : [])
    .filter((node) => actionableNode(node))
    .filter((node) => !readyNodeIds.includes(node.id))
    .filter((node) => !graphCompletedNodeIds(dag).has(node.id))
    .map((node) => {
      const unmet = unmetDependencies(node, graphCompletedNodeIds(dag));
      const tracker = trackerReadiness(node);
      const reasons = [];
      if (unmet.length > 0) {
        reasons.push(`Unmet dependencies: ${unmet.join(", ")}`);
      }
      if (!tracker.ready) {
        reasons.push("Tracker state is not ready for orchestration.");
      }
      if (!isExecutionEligible(node)) {
        reasons.push(...eligibilityReasons(node));
      }
      return {
        node_id: node.id,
        reasons: uniqueList(reasons),
      };
    });

  const combinedBlocked = [
    ...blocked,
    ...blockedByReadiness.filter((entry) => entry.reasons.length > 0),
  ];

  return {
    schema_version: "dag-wave-plan/v1",
    graph_id: graphId(dag),
    policy: "topological-frontier-write-surface",
    concurrency: {
      max_parallel: boundedMaxParallel,
      ready_frontier_size: readyFrontier.length,
    },
    ready_frontier: readyFrontier.map((candidate) => ({
      node_id: candidate.node_id,
      title: candidate.title,
      tracer_bullet: candidate.tracer_bullet,
      topological_index: candidate.topological_index,
      dependency_unlock_value: candidate.dependency_unlock_value,
      estimated_review_cost: candidate.estimated_review_cost,
      conflict_isolation_score: candidate.conflict_isolation_score,
      primary_surface: candidate.primary_surface,
      secondary_surfaces: candidate.secondary_surfaces,
      normalized_write_surfaces: candidate.normalized_write_surfaces,
      foundation_surfaces: candidate.foundation_surfaces,
      parallel_safety_mode: candidate.parallel_safety_mode,
      execution_parallelizable: candidate.execution_parallelizable,
      eligible: candidate.eligible,
      ineligible_reasons: candidate.ineligible_reasons,
    })),
    selected_wave: {
      runnable_node_ids: selected.map((candidate) => candidate.node_id),
      blocked_node_ids: uniqueList([
        ...deferred.map((entry) => entry.node_id),
        ...combinedBlocked.map((entry) => entry.node_id),
      ]),
      parallelizable_node_ids: selected
        .filter((candidate) => candidate.execution_parallelizable && candidate.parallel_safety_mode !== "exclusive-foundation")
        .map((candidate) => candidate.node_id),
    },
    deferred,
    blocked: combinedBlocked,
  };
}

export function selectTracerBulletWave({
  dag,
  reconciliation = {},
  loopSpecs = [],
} = {}) {
  if (!dag || !Array.isArray(dag.nodes)) {
    throw new Error("A DAG with a nodes array is required.");
  }

  const completedNodeIds = graphCompletedNodeIds(dag);
  const loopSpecMap = asLoopSpecMap(loopSpecs);
  const reconciliationMap = asReconciliationMap(reconciliation);
  const driftMap = driftByNodeId(reconciliation);

  const tracerCandidates = dag.nodes
    .filter((node) => isTracerBullet(node))
    .map((node) => {
      const unmet = unmetDependencies(node, completedNodeIds);
      const tracker = trackerReadiness(node);
      const mapping = reconciliationMap.get(node.id) || null;
      const driftReasons = blockingDriftReasons(driftMap.get(node.id) || []);
      const loopSpec = loopSpecMap.get(node.id) || null;
      const reasons = [];

      if (!isExecutionEligible(node)) {
        reasons.push(...eligibilityReasons(node));
      }
      if (unmet.length > 0) {
        reasons.push(`Unmet dependencies: ${unmet.join(", ")}`);
      }
      if (!mapping || !Number.isFinite(Number(mapping.issue_number))) {
        reasons.push("Node is not mapped to a synchronized GitHub issue.");
      }
      if (!tracker.ready) {
        reasons.push("Tracker state is not ready for orchestration.");
      }
      if (driftReasons.length > 0) {
        reasons.push(...driftReasons);
      }
      if (!loopSpec) {
        reasons.push("Loop Spec has not been compiled for this node.");
      }

      return {
        node,
        loopSpec,
        mapping,
        tracker,
        unmet_dependencies: unmet,
        eligible: reasons.length === 0,
        reasons,
      };
    })
    .sort((left, right) => comparePriority(launchPriority(left.node), launchPriority(right.node)));

  const runnable = tracerCandidates.filter((candidate) => candidate.eligible);
  const blocked = tracerCandidates.filter((candidate) => !candidate.eligible);

  return {
    schema_version: "dag-wave-selection/v1",
    graph_id: graphId(dag),
    policy: "tracer-bullet-first",
    runnable: runnable.map((candidate) => ({
      node_id: candidate.node.id,
      issue_number: Number(candidate.mapping.issue_number),
      loop_spec_id: candidate.loopSpec.loop_spec_id,
      wave: candidate.loopSpec.dependencies?.wave ?? candidate.node.wave ?? null,
      reasons: [],
    })),
    blocked: blocked.map((candidate) => ({
      node_id: candidate.node.id,
      reasons: candidate.reasons,
    })),
  };
}

export function preflightApprovedWaveBundle({
  dag,
  approvedBundle,
  reconciliation = {},
  loopSpecs = [],
} = {}) {
  if (!dag || !Array.isArray(dag.nodes)) {
    throw new Error("A DAG with a nodes array is required.");
  }
  if (!approvedBundle || typeof approvedBundle !== "object") {
    throw new Error("An approved wave bundle is required.");
  }
  if (bundleApprovalStatus(approvedBundle) !== "approved") {
    throw new Error("Wave bundle preflight requires an approved wave bundle.");
  }

  const bundleEntries = approvedBundleEntries(approvedBundle);
  const completedNodeIds = graphCompletedNodeIds(dag);
  const loopSpecMap = asLoopSpecMap(loopSpecs);
  const reconciliationMap = asReconciliationMap(reconciliation);
  const driftMap = driftByNodeId(reconciliation);

  const feasible = [];
  const withheld = [];

  for (const entry of bundleEntries) {
    const nodeId = normalizeText(entry?.dag_node_id);
    if (!nodeId) {
      continue;
    }

    const node = nodeById(dag, nodeId);
    const mapping = reconciliationMap.get(nodeId) || null;
    const loopSpec = findLoopSpecForNode({ bundleEntry: entry, loopSpecMap, nodeId });
    const durableReasons = nodePreflightReasons({
      dag,
      node,
      nodeId,
      loopSpec,
      mapping,
      driftEntries: driftMap.get(nodeId) || [],
      completedNodeIds,
    });

    const preflightEntry = {
      node_id: nodeId,
      issue_number: mapping ? Number(mapping.issue_number) : null,
      loop_spec_id: normalizeText(loopSpec?.loop_spec_id),
      durable_reasons: durableReasons,
    };

    if (durableReasons.length > 0) {
      withheld.push(preflightEntry);
      continue;
    }

    feasible.push({
      ...preflightEntry,
      title: normalizeText(node?.title || entry?.title || loopSpec?.title),
      wave: loopSpec?.dependencies?.wave ?? node?.wave ?? null,
    });
  }

  return {
    schema_version: "dag-wave-preflight/v1",
    graph_id: graphId(dag),
    wave_id: normalizeText(approvedBundle?.wave?.wave_id),
    summary: {
      feasible_count: feasible.length,
      infeasible_count: withheld.length,
      split_required: feasible.length > 0 && withheld.length > 0,
      fully_blocked: feasible.length === 0,
    },
    launchable: {
      node_ids: feasible.map((entry) => entry.node_id),
      entries: feasible,
    },
    withheld,
    reconciled_wave: {
      wave_id: normalizeText(approvedBundle?.wave?.wave_id),
      selected_node_ids: feasible.map((entry) => entry.node_id),
      withheld_node_ids: withheld.map((entry) => entry.node_id),
      preserved_launchability: feasible.length > 0,
    },
  };
}

export function buildTracerBulletLaunchPlan({
  dag,
  reconciliation = {},
  loopSpecs = [],
  claimedBy = "",
  isolationMode = "worktree",
  maxNodes = 1,
} = {}) {
  const wave = selectTracerBulletWave({ dag, reconciliation, loopSpecs });
  const loopSpecMap = asLoopSpecMap(loopSpecs);
  const reconciliationMap = asReconciliationMap(reconciliation);
  const nodeMap = asNodeMap(dag);
  const boundedRunnable = wave.runnable.slice(0, Math.max(1, Number(maxNodes) || 1));

  const launches = boundedRunnable.map((entry, index) => {
    const node = nodeMap.get(entry.node_id);
    const loopSpec = loopSpecMap.get(entry.node_id);
    const mapping = reconciliationMap.get(entry.node_id);

    return {
      launch_id: `launch-${index + 1}-${entry.node_id}`,
      dag_node_id: entry.node_id,
      issue_number: Number(mapping.issue_number),
      loop_spec_id: loopSpec.loop_spec_id,
      title: normalizeText(node?.title || loopSpec?.title),
      claimed_by: normalizeText(claimedBy),
      isolation_mode: normalizeText(isolationMode),
      queue_class: normalizeText(
        loopSpec?.tracer_bullet?.queue_class || node?.queue_class || node?.execution?.queue_class || "tracer-bullet",
      ),
      feature_track: normalizeText(loopSpec?.tracer_bullet?.feature_track || node?.feature_track || dag?.feature_track),
      owned_surface: normalizeList(loopSpec?.owned_surface),
      verification_commands: normalizeList(loopSpec?.verification_plan?.automated),
      stop_conditions: normalizeList(loopSpec?.execution_contract?.stop_conditions),
      escalation_rules: normalizeList(loopSpec?.execution_contract?.escalation_rules),
      bounded_context: {
        dependencies: normalizeList(loopSpec?.dependencies?.depends_on),
        wave: loopSpec?.dependencies?.wave ?? null,
        completion_report_target: normalizeText(loopSpec?.completion_contract?.completion_report_target),
      },
    };
  });

  return {
    schema_version: "dag-wave-launch-plan/v1",
    graph_id: graphId(dag),
    policy: wave.policy,
    bounded: true,
    max_nodes: Math.max(1, Number(maxNodes) || 1),
    claimed_by: normalizeText(claimedBy),
    isolation_mode: normalizeText(isolationMode),
    selected_wave: {
      runnable_node_ids: launches.map((launch) => launch.dag_node_id),
      blocked_node_ids: wave.blocked.map((entry) => entry.node_id),
    },
    launches,
    blocked: wave.blocked,
  };
}
