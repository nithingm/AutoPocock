function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function normalizeList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((value) => normalizeText(value)).filter(Boolean);
}

function cloneObject(value) {
  return value && typeof value === "object" ? { ...value } : {};
}

export const LAYERED_DAG_SCHEMA_VERSION = "layered-dag/v1";

export const DAG_NODE_LAYERS = Object.freeze({
  initiative: "initiative",
  tracerBullet: "tracer_bullet",
  implementationSlice: "implementation_slice",
  followUp: "follow_up",
  bugLoop: "bug_loop",
});

export const AUTHORITATIVE_NODE_FIELDS = Object.freeze([
  "id",
  "title",
  "layer",
  "feature_track",
  "goal",
  "depends_on",
  "acceptance_criteria",
  "verification_plan",
  "write_surface",
  "conflict_surface",
  "conflict_reasoning",
  "risk",
  "confidence",
  "ambiguity_signals",
  "provider_eligibility",
  "human_gate",
  "tracer_bullet",
  "execution",
  "tracker",
  "state",
]);

const LAYER_DEFAULTS = Object.freeze({
  [DAG_NODE_LAYERS.initiative]: Object.freeze({
    providerEligible: false,
    humanGateRequired: true,
    queueClass: "hitl",
    tracerBullet: false,
  }),
  [DAG_NODE_LAYERS.tracerBullet]: Object.freeze({
    providerEligible: true,
    humanGateRequired: false,
    queueClass: "tracer-bullet",
    tracerBullet: true,
  }),
  [DAG_NODE_LAYERS.implementationSlice]: Object.freeze({
    providerEligible: true,
    humanGateRequired: false,
    queueClass: "routine-afk",
    tracerBullet: false,
  }),
  [DAG_NODE_LAYERS.followUp]: Object.freeze({
    providerEligible: false,
    humanGateRequired: true,
    queueClass: "hitl",
    tracerBullet: false,
  }),
  [DAG_NODE_LAYERS.bugLoop]: Object.freeze({
    providerEligible: true,
    humanGateRequired: false,
    queueClass: "bug-loop",
    tracerBullet: false,
  }),
});

function normalizeVerificationPlan(value) {
  const plan = cloneObject(value);
  return {
    automated: normalizeList(plan.automated),
    manual: normalizeList(plan.manual),
    evidence_expected: normalizeList(plan.evidence_expected),
  };
}

function normalizeProviderEligibility(value, defaults) {
  const eligibility = cloneObject(value);
  const eligible = typeof eligibility.eligible === "boolean"
    ? eligibility.eligible
    : defaults.providerEligible;

  return {
    eligible,
    allowed_providers: normalizeList(eligibility.allowed_providers),
    blocked_reason: eligible ? "" : normalizeText(eligibility.blocked_reason),
    execution_mode: normalizeText(eligibility.execution_mode) || (eligible ? "afk" : "hitl"),
  };
}

function normalizeHumanGate(value, defaults) {
  const gate = cloneObject(value);
  const required = typeof gate.required === "boolean"
    ? gate.required
    : defaults.humanGateRequired;

  return {
    required,
    reason: normalizeText(gate.reason),
    approval_scope: normalizeText(gate.approval_scope) || (required ? "node-progression" : ""),
  };
}

function normalizeTracerBullet(value, layer, defaults) {
  const tracerBullet = cloneObject(value);
  const isTracerBullet = typeof tracerBullet.is_tracer_bullet === "boolean"
    ? tracerBullet.is_tracer_bullet
    : defaults.tracerBullet;

  return {
    is_tracer_bullet: isTracerBullet,
    gates_deeper_execution: typeof tracerBullet.gates_deeper_execution === "boolean"
      ? tracerBullet.gates_deeper_execution
      : layer === DAG_NODE_LAYERS.tracerBullet,
    validation_scope: normalizeText(tracerBullet.validation_scope),
  };
}

function normalizeExecution(value, defaults) {
  const execution = cloneObject(value);
  return {
    queue_class: normalizeText(execution.queue_class) || defaults.queueClass,
    parallelizable: typeof execution.parallelizable === "boolean" ? execution.parallelizable : false,
    retry_budget: Number.isInteger(execution.retry_budget) ? execution.retry_budget : 1,
    stop_conditions: normalizeList(execution.stop_conditions),
    escalation_rules: normalizeList(execution.escalation_rules),
  };
}

function normalizeTracker(value) {
  const tracker = cloneObject(value);
  return {
    issue_number: tracker.issue_number == null ? null : String(tracker.issue_number),
    labels: normalizeList(tracker.labels),
    execution_stage: normalizeText(tracker.execution_stage),
    execution_lane: normalizeText(tracker.execution_lane),
    dependency_state: normalizeText(tracker.dependency_state),
    conflict_surface: normalizeText(tracker.conflict_surface),
  };
}

function normalizeState(value) {
  const state = cloneObject(value);
  return {
    planning_status: normalizeText(state.planning_status) || "draft",
    review_status: normalizeText(state.review_status) || "pending",
    qa_status: normalizeText(state.qa_status) || "pending",
    progression_status: normalizeText(state.progression_status) || "planned",
  };
}

function normalizeFollowUp(value) {
  const followUp = cloneObject(value);
  return {
    source_node_id: normalizeText(followUp.source_node_id),
    trigger: normalizeText(followUp.trigger),
  };
}

function normalizeBugLoop(value) {
  const bugLoop = cloneObject(value);
  return {
    source_node_id: normalizeText(bugLoop.source_node_id),
    trigger: normalizeText(bugLoop.trigger),
    reentry_policy: normalizeText(bugLoop.reentry_policy),
  };
}

export function createLayeredDagNode(input) {
  const node = cloneObject(input);
  const layer = normalizeText(node.layer);
  const defaults = LAYER_DEFAULTS[layer];

  if (!defaults) {
    throw new Error(`Unsupported layered DAG node layer: ${layer || "unknown"}`);
  }

  return {
    id: normalizeText(node.id),
    title: normalizeText(node.title),
    layer,
    feature_track: normalizeText(node.feature_track),
    goal: normalizeText(node.goal),
    depends_on: normalizeList(node.depends_on),
    acceptance_criteria: normalizeList(node.acceptance_criteria),
    verification_plan: normalizeVerificationPlan(node.verification_plan),
    write_surface: normalizeList(node.write_surface),
    conflict_surface: normalizeText(node.conflict_surface),
    conflict_reasoning: normalizeText(node.conflict_reasoning),
    risk: normalizeText(node.risk) || "medium",
    confidence: normalizeText(node.confidence) || "medium",
    ambiguity_signals: normalizeList(node.ambiguity_signals),
    provider_eligibility: normalizeProviderEligibility(node.provider_eligibility, defaults),
    human_gate: normalizeHumanGate(node.human_gate, defaults),
    tracer_bullet: normalizeTracerBullet(node.tracer_bullet, layer, defaults),
    execution: normalizeExecution(node.execution, defaults),
    tracker: normalizeTracker(node.tracker),
    state: normalizeState(node.state),
    follow_up: normalizeFollowUp(node.follow_up),
    bug_loop: normalizeBugLoop(node.bug_loop),
    metadata: cloneObject(node.metadata),
  };
}

export function validateLayeredDagNode(nodeInput) {
  const errors = [];
  let node;

  try {
    node = createLayeredDagNode(nodeInput);
  } catch (error) {
    return [error.message];
  }

  for (const field of AUTHORITATIVE_NODE_FIELDS) {
    if (!(field in node)) {
      errors.push(`Missing authoritative field: ${field}`);
    }
  }

  if (!node.id) {
    errors.push("Node id is required.");
  }
  if (!node.title) {
    errors.push("Node title is required.");
  }
  if (!node.feature_track) {
    errors.push("Node feature_track is required.");
  }
  if (!node.goal) {
    errors.push("Node goal is required.");
  }
  if (node.acceptance_criteria.length === 0) {
    errors.push("Node acceptance_criteria must contain at least one item.");
  }
  if (node.write_surface.length === 0) {
    errors.push("Node write_surface must contain at least one owned path or glob.");
  }
  if (!node.conflict_surface) {
    errors.push("Node conflict_surface is required.");
  }
  if (!node.conflict_reasoning) {
    errors.push("Node conflict_reasoning is required.");
  }

  if (node.provider_eligibility.eligible && node.provider_eligibility.allowed_providers.length === 0) {
    errors.push("Provider-eligible nodes must declare at least one allowed provider.");
  }
  if (!node.provider_eligibility.eligible && !node.provider_eligibility.blocked_reason) {
    errors.push("Provider-ineligible nodes must declare blocked_reason.");
  }
  if (node.human_gate.required && !node.human_gate.reason) {
    errors.push("Human-gated nodes must declare a human_gate reason.");
  }
  if (node.layer === DAG_NODE_LAYERS.tracerBullet && !node.tracer_bullet.is_tracer_bullet) {
    errors.push("Tracer-bullet layer nodes must set tracer_bullet.is_tracer_bullet.");
  }
  if (node.layer !== DAG_NODE_LAYERS.tracerBullet && node.tracer_bullet.is_tracer_bullet) {
    errors.push("Only tracer-bullet layer nodes may set tracer_bullet.is_tracer_bullet.");
  }
  if (node.layer === DAG_NODE_LAYERS.followUp && !node.follow_up.source_node_id) {
    errors.push("Follow-up nodes must declare follow_up.source_node_id.");
  }
  if (node.layer === DAG_NODE_LAYERS.bugLoop && !node.bug_loop.source_node_id) {
    errors.push("Bug-loop nodes must declare bug_loop.source_node_id.");
  }
  if (node.layer === DAG_NODE_LAYERS.bugLoop && !node.bug_loop.trigger) {
    errors.push("Bug-loop nodes must declare bug_loop.trigger.");
  }

  return errors;
}

export function createLayeredDag(input) {
  const dag = cloneObject(input);
  const nodes = Array.isArray(dag.nodes) ? dag.nodes.map((node) => createLayeredDagNode(node)) : [];
  const layers = normalizeList(dag.layers);

  return {
    schema_version: normalizeText(dag.schema_version) || LAYERED_DAG_SCHEMA_VERSION,
    graph_id: normalizeText(dag.graph_id),
    feature_track: normalizeText(dag.feature_track),
    source: {
      prd_artifact: normalizeText(dag.source?.prd_artifact),
      context_artifact: normalizeText(dag.source?.context_artifact),
    },
    layers: layers.length > 0 ? layers : [...new Set(nodes.map((node) => node.layer))],
    nodes,
    edges: Array.isArray(dag.edges)
      ? dag.edges.map((edge) => ({
        from: normalizeText(edge?.from),
        to: normalizeText(edge?.to),
      }))
      : nodes.flatMap((node) => node.depends_on.map((dependency) => ({ from: dependency, to: node.id }))),
    semantics: {
      authoritative_contract: dag.semantics?.authoritative_contract !== false,
      provider_neutral: dag.semantics?.provider_neutral !== false,
      tracer_bullet_gates_layers: dag.semantics?.tracer_bullet_gates_layers !== false,
    },
    wave_policy: {
      allow_parallel_by_write_surface: dag.wave_policy?.allow_parallel_by_write_surface !== false,
      allow_parallel_by_conflict_surface: dag.wave_policy?.allow_parallel_by_conflict_surface !== false,
      gated_by_tracer_bullets: dag.wave_policy?.gated_by_tracer_bullets !== false,
    },
  };
}

export function validateLayeredDag(dagInput) {
  const dag = createLayeredDag(dagInput);
  const errors = [];
  const nodeIds = new Set();

  if (dag.schema_version !== LAYERED_DAG_SCHEMA_VERSION) {
    errors.push(`Unsupported layered DAG schema version: ${dag.schema_version}`);
  }
  if (!dag.graph_id) {
    errors.push("Graph graph_id is required.");
  }
  if (!dag.feature_track) {
    errors.push("Graph feature_track is required.");
  }
  if (!dag.source.prd_artifact) {
    errors.push("Graph source.prd_artifact is required.");
  }
  if (dag.nodes.length === 0) {
    errors.push("Graph must contain at least one node.");
  }

  for (const node of dag.nodes) {
    const nodeErrors = validateLayeredDagNode(node);
    for (const error of nodeErrors) {
      errors.push(`${node.id || "unknown-node"}: ${error}`);
    }

    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node id: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  for (const edge of dag.edges) {
    if (!edge.from || !edge.to) {
      errors.push("Edges must declare from and to ids.");
      continue;
    }
    if (!nodeIds.has(edge.from)) {
      errors.push(`Edge references unknown source node: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`Edge references unknown target node: ${edge.to}`);
    }
  }

  for (const layer of dag.layers) {
    if (!Object.values(DAG_NODE_LAYERS).includes(layer)) {
      errors.push(`Graph declares unsupported layer: ${layer}`);
    }
  }

  return errors;
}
