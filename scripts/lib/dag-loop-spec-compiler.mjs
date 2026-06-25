function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  if (value == null) {
    return [];
  }
  const text = normalizeText(value);
  return text ? [text] : [];
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function readNodeList(node, ...paths) {
  for (const path of paths) {
    const segments = path.split(".");
    let current = node;
    let found = true;
    for (const segment of segments) {
      if (current && typeof current === "object" && segment in current) {
        current = current[segment];
      } else {
        found = false;
        break;
      }
    }
    if (found) {
      const list = normalizeList(current);
      if (list.length > 0) {
        return list;
      }
    }
  }
  return [];
}

function findNode(dag, nodeId) {
  const node = (dag?.nodes || []).find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`DAG node ${nodeId} was not found.`);
  }
  return node;
}

function isDagApproved(dag) {
  const status = normalizeText(dag?.source_prd_status || dag?.approval_status || dag?.status).toLowerCase();
  return !status || status === "approved";
}

function isNodeApproved(node) {
  if (typeof node?.approved === "boolean") {
    return node.approved;
  }
  const explicitStatus = normalizeText(
    node?.approval_status || node?.approval?.status || node?.node_approval_status || "",
  ).toLowerCase();
  return !explicitStatus || explicitStatus === "approved";
}

function eligibilityState(node) {
  const explicitFlag =
    node?.execution_eligibility?.eligible ??
    node?.execution_eligible ??
    node?.quality_gate?.execution_eligible;

  if (typeof explicitFlag === "boolean") {
    return explicitFlag;
  }
  if (node?.provider_eligible === false || node?.human_gate_required === true) {
    return false;
  }
  return true;
}

function eligibilityReasons(node) {
  return [
    ...normalizeList(node?.execution_eligibility?.reasons),
    ...normalizeList(node?.quality_gate?.reasons),
  ];
}

function tracerBulletSemantics(node, dag) {
  const queueClass = normalizeText(node?.queue_class || node?.queueClass || "");
  const explicitKind = normalizeText(node?.slice_kind || node?.sliceKind || "");
  const layerKind = normalizeText(node?.layer_kind || node?.layerKind || node?.layer || "");
  const isTracerBullet =
    node?.tracer_bullet === true ||
    explicitKind === "tracer-bullet" ||
    layerKind === "tracer-bullet" ||
    queueClass === "tracer-bullet";

  return {
    is_tracer_bullet: isTracerBullet,
    queue_class: queueClass || (isTracerBullet ? "tracer-bullet" : ""),
    feature_track: normalizeText(node?.feature_track || node?.featureTrack || dag?.feature_track || ""),
    layer: layerKind,
    wave: node?.wave ?? node?.execution_wave ?? null,
    proof_targets: readNodeList(node, "tracer_bullet.proof_targets", "proof_targets"),
  };
}

function defaultStopConditions({ node, tracer }) {
  const base = [
    "Acceptance criteria are satisfied and verification is complete.",
    "The run exceeds the owned surface or touches forbidden areas.",
    "Escalation rules are triggered by ambiguity, dependency drift, or missing context.",
    "Solo Operator approval is required before progression.",
  ];

  if (tracer.is_tracer_bullet) {
    base.splice(1, 0, "Stop when tracer-bullet proof fails or the minimal vertical slice is not demonstrated.");
  }

  if (node?.human_gate_required) {
    base.push("Stop before implementation because this node requires a human gate.");
  }

  return base;
}

function defaultEscalationRules({ node, tracer }) {
  const base = [
    "Escalate when required context artifacts are missing or stale.",
    "Escalate when work exceeds the declared owned surface or overlaps a conflict surface that was not approved.",
    "Escalate when verification cannot run, acceptance criteria are ambiguous, or dependency intent is unclear.",
  ];

  if (tracer.is_tracer_bullet) {
    base.unshift("Escalate when tracer-bullet proof would require widening scope beyond the declared minimal slice.");
  }

  const dependencyReasons = normalizeList(node?.depends_on).map((dependencyId) => `Escalate if dependency ${dependencyId} is unresolved.`);
  return [...base, ...dependencyReasons];
}

function buildSourceArtifacts(dag, node) {
  return {
    dag_artifact: normalizeText(dag?.dag_artifact || dag?.artifact_path || ""),
    source_prd: normalizeText(dag?.source_prd || ""),
    source_context: normalizeText(dag?.source_context || ""),
    handoff_artifact: normalizeText(node?.handoff_artifact || ""),
    supporting_artifacts: readNodeList(node, "context_artifacts", "supporting_artifacts"),
  };
}

export function compileLoopSpecFromDagNode({ dag, nodeId, dispatch = {}, overrides = {} }) {
  if (!dag || typeof dag !== "object") {
    throw new Error("A DAG object is required.");
  }
  if (!isDagApproved(dag)) {
    throw new Error("Loop Spec compilation requires an approved DAG or approved source PRD.");
  }

  const node = findNode(dag, nodeId);

  if (!isNodeApproved(node)) {
    throw new Error(`DAG node ${nodeId} is not approved for Loop Spec compilation.`);
  }
  if (!eligibilityState(node)) {
    const reasons = eligibilityReasons(node);
    throw new Error(
      `DAG node ${nodeId} is not execution-eligible${reasons.length ? `: ${reasons.join(" | ")}` : "."}`,
    );
  }

  const tracer = tracerBulletSemantics(node, dag);
  const ownedSurface = readNodeList(node, "owned_surface", "write_surface", "ownership.write_surface");
  const inScope = readNodeList(node, "boundaries.in_scope", "in_scope");
  const outOfScope = readNodeList(node, "boundaries.out_of_scope", "out_of_scope");
  const forbiddenActions = readNodeList(node, "boundaries.forbidden_actions", "forbidden_actions");
  const allowedCommands = readNodeList(node, "boundaries.allowed_commands", "allowed_commands");
  const stopConditions = readNodeList(node, "execution_contract.stop_conditions", "stop_conditions");
  const escalationRules = readNodeList(node, "execution_contract.escalation_rules", "escalation_rules");
  const verificationAutomated = readNodeList(node, "verification_plan.automated", "verification.automated");
  const verificationManual = readNodeList(node, "verification_plan.manual", "verification.manual");
  const evidenceExpected = readNodeList(node, "verification_plan.evidence_expected", "verification.evidence_expected");
  const retryBudget =
    node?.execution_contract?.retry_budget ??
    node?.retry_budget ??
    overrides.retry_budget ??
    1;

  const loopSpecIdSeed =
    normalizeText(dispatch.dispatch_id) ||
    normalizeText(node?.issue_id) ||
    `${normalizeText(dag?.dag_id || dag?.source_prd || "dag")}-${nodeId}`;

  return {
    schema_version: "loop-spec/v1",
    loop_spec_id: `loop-spec-${slugify(loopSpecIdSeed)}`,
    dispatch_id: normalizeText(dispatch.dispatch_id || ""),
    issue_id: normalizeText(
      dispatch.issue_id || node?.issue_id || node?.tracker_issue_id || node?.github_issue_id || "",
    ),
    dag_node_id: node.id,
    title: normalizeText(node?.title || dispatch.title || ""),
    goal: normalizeText(node?.goal || ""),
    layer: normalizeText(node?.layer_kind || node?.layerKind || node?.layer || ""),
    node_type: normalizeText(node?.type || ""),
    tracer_bullet: tracer,
    owned_surface: ownedSurface,
    acceptance_criteria: normalizeList(node?.acceptance_criteria),
    verification_plan: {
      automated: verificationAutomated,
      manual: verificationManual,
      evidence_expected: evidenceExpected,
    },
    context_artifacts: buildSourceArtifacts(dag, node),
    dependencies: {
      depends_on: normalizeList(node?.depends_on),
      blocked_by: readNodeList(node, "blocked_by"),
      wave: tracer.wave,
    },
    boundaries: {
      in_scope: inScope,
      out_of_scope: outOfScope,
      forbidden_actions: forbiddenActions,
      allowed_commands: allowedCommands,
      conflict_surface: normalizeText(node?.conflict_surface || ""),
      conflict_reasoning: normalizeText(node?.conflict_reasoning || ""),
    },
    execution_contract: {
      provider_eligible: node?.provider_eligible !== false,
      human_gate_required: node?.human_gate_required === true,
      isolation_mode: normalizeText(dispatch.isolation_mode || overrides.isolation_mode || ""),
      expected_branch: normalizeText(dispatch.expected_branch || overrides.expected_branch || ""),
      worktree_path: normalizeText(dispatch.worktree_path || overrides.worktree_path || ""),
      claimed_by: normalizeText(dispatch.claim?.claimed_by || overrides.claimed_by || ""),
      retry_budget: Number.isFinite(retryBudget) ? retryBudget : 1,
      stop_conditions: stopConditions.length > 0 ? stopConditions : defaultStopConditions({ node, tracer }),
      escalation_rules: escalationRules.length > 0 ? escalationRules : defaultEscalationRules({ node, tracer }),
      eligibility: {
        eligible: true,
        reasons: [],
      },
    },
    completion_contract: {
      completion_report_target: normalizeText(dispatch.completion_report_target || ""),
      report_back: readNodeList(node, "completion_contract.report_back", "report_back"),
      artifacts_to_update: readNodeList(node, "completion_contract.artifacts_to_update", "artifacts_to_update"),
    },
    source: {
      dag_id: normalizeText(dag?.dag_id || ""),
      dag_schema_version: normalizeText(dag?.schema_version || ""),
      source_prd_status: normalizeText(dag?.source_prd_status || ""),
      dispatch_source: normalizeText(dispatch.source || ""),
    },
  };
}

export function compileLoopSpecsFromDag({ dag, nodeIds = [], dispatchByNodeId = {}, overrides = {} }) {
  const ids = nodeIds.length > 0 ? nodeIds : (dag?.nodes || []).map((node) => node.id);
  return ids.map((nodeId) =>
    compileLoopSpecFromDagNode({
      dag,
      nodeId,
      dispatch: dispatchByNodeId[nodeId] || {},
      overrides,
    }),
  );
}
