import { compileLayeredDag } from "./layered-dag-compiler.mjs";

const NON_MERGEABLE_FIELDS = new Set(["id", "feature_track", "tracker_identity", "field_provenance", "node_provenance"]);
const COMPATIBILITY_REFERENCE_FIELDS = new Set(["depends_on"]);

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function listAcceptanceCriteria(prdText) {
  return String(prdText || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.match(/^\s*-\s+\[[ xX]\]\s+(.*)$/)?.[1] || "")
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function inferFieldProvenance(node, field) {
  const provenance = node?.field_provenance?.[field];
  if (provenance && typeof provenance === "object") {
    return provenance;
  }
  return {
    source: "generated",
    stale: false,
    generated_value: undefined,
    stale_reason: "",
  };
}

function inferNodeOrigin(node) {
  if (node?.node_provenance?.origin) {
    return node.node_provenance.origin;
  }
  const id = normalizeText(node?.id);
  if (/^(initiative|tracer-bullet|implementation)-/.test(id)) {
    return "generated";
  }
  return "graph_only";
}

function isCompatiblePreservedValue(field, preservedValue, knownNodeIds, freshNode) {
  if (field === "parent_id") {
    return !preservedValue || knownNodeIds.has(preservedValue);
  }
  if (COMPATIBILITY_REFERENCE_FIELDS.has(field)) {
    return Array.isArray(preservedValue) && preservedValue.every((entry) => knownNodeIds.has(entry));
  }
  if (field === "tracker_identity") {
    return preservedValue?.graph_node_id === freshNode.id;
  }
  return true;
}

function recalculateTopologicalOrder(nodes) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const indegree = new Map();
  const outgoing = new Map();

  for (const node of nodes) {
    indegree.set(node.id, 0);
    outgoing.set(node.id, []);
  }

  for (const node of nodes) {
    for (const dependency of Array.isArray(node.depends_on) ? node.depends_on : []) {
      if (!nodeIds.has(dependency)) {
        continue;
      }
      indegree.set(node.id, (indegree.get(node.id) || 0) + 1);
      outgoing.get(dependency).push(node.id);
    }
  }

  const queue = nodes
    .filter((node) => (indegree.get(node.id) || 0) === 0)
    .sort((left, right) => (left.topological_index || 0) - (right.topological_index || 0));
  const order = [];

  while (queue.length > 0) {
    const node = queue.shift();
    order.push(node.id);
    for (const target of outgoing.get(node.id) || []) {
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) {
        queue.push(nodes.find((entry) => entry.id === target));
        queue.sort((left, right) => (left.topological_index || 0) - (right.topological_index || 0));
      }
    }
  }

  for (const node of nodes) {
    if (!order.includes(node.id)) {
      order.push(node.id);
    }
  }

  return order;
}

function buildEdges(nodes, previousDag) {
  const knownNodeIds = new Set(nodes.map((node) => node.id));
  const edges = [];

  for (const node of nodes) {
    for (const dependency of Array.isArray(node.depends_on) ? node.depends_on : []) {
      if (!knownNodeIds.has(dependency)) {
        continue;
      }
      edges.push({
        from: dependency,
        to: node.id,
        kind: "depends_on",
      });
    }
  }

  for (const edge of Array.isArray(previousDag?.edges) ? previousDag.edges : []) {
    if (!knownNodeIds.has(edge?.from) || !knownNodeIds.has(edge?.to)) {
      continue;
    }
    if (edges.some((candidate) => candidate.from === edge.from && candidate.to === edge.to && candidate.kind === edge.kind)) {
      continue;
    }
    edges.push(cloneValue(edge));
  }

  return edges;
}

function collectCoverageGaps(prdAcceptanceCriteria, nodes) {
  const covered = new Set(
    nodes
      .filter((node) => node.actionable !== false)
      .flatMap((node) => Array.isArray(node.acceptance_criteria) ? node.acceptance_criteria : [])
      .map((entry) => normalizeText(entry))
      .filter(Boolean),
  );

  return prdAcceptanceCriteria.filter((criterion) => !covered.has(criterion));
}

function mergeNode({ freshNode, previousNode, knownNodeIds }) {
  const mergedNode = cloneValue(freshNode);
  const fieldProvenance = {};
  const preservedFields = [];
  const staleFields = [];

  for (const [field, freshValue] of Object.entries(freshNode)) {
    if (NON_MERGEABLE_FIELDS.has(field)) {
      fieldProvenance[field] = {
        source: "generated",
        stale: false,
        generated_value: cloneValue(freshValue),
        stale_reason: "",
      };
      continue;
    }

    const previousValue = previousNode?.[field];
    const previousProvenance = inferFieldProvenance(previousNode, field);
    const hadLegacyNoProvenance = !previousNode?.field_provenance;
    const hasUserEdit = previousNode
      && (
        previousProvenance.source === "user_edited"
        || (previousProvenance.generated_value !== undefined && !deepEqual(previousValue, previousProvenance.generated_value))
        || (hadLegacyNoProvenance && !deepEqual(previousValue, freshValue))
      );
    const upstreamChanged = previousProvenance.generated_value !== undefined
      ? !deepEqual(previousProvenance.generated_value, freshValue)
      : !deepEqual(previousValue, freshValue);
    const compatible = isCompatiblePreservedValue(field, previousValue, knownNodeIds, freshNode);

    if (hasUserEdit && compatible) {
      mergedNode[field] = cloneValue(previousValue);
      preservedFields.push(field);
      if (upstreamChanged) {
        staleFields.push(field);
      }
      fieldProvenance[field] = {
        source: "user_edited",
        stale: upstreamChanged,
        generated_value: cloneValue(freshValue),
        stale_reason: upstreamChanged ? "Upstream PRD changes invalidated the previous planner output for this field." : "",
      };
      continue;
    }

    mergedNode[field] = cloneValue(freshValue);
    fieldProvenance[field] = {
      source: "generated",
      stale: false,
      generated_value: cloneValue(freshValue),
      stale_reason: "",
    };
  }

  mergedNode.provenance_status = preservedFields.length > 0 ? "merged" : "generated";
  mergedNode.node_provenance = {
    origin: "generated",
    generated_at: freshNode?.node_provenance?.generated_at || "",
    regenerated_at: freshNode?.node_provenance?.generated_at || "",
    previous_node_id: previousNode?.id || "",
  };
  mergedNode.field_provenance = fieldProvenance;

  return {
    node: mergedNode,
    preservedFields,
    staleFields,
  };
}

function buildGraphOnlyNode(node, now) {
  const cloned = cloneValue(node);
  const fieldProvenance = {};

  for (const [field, value] of Object.entries(cloned)) {
    if (field === "field_provenance" || field === "node_provenance") {
      continue;
    }
    fieldProvenance[field] = {
      source: inferFieldProvenance(node, field).source === "generated" ? "user_edited" : inferFieldProvenance(node, field).source,
      stale: true,
      generated_value: null,
      stale_reason: "This node is no longer generated from the current PRD and requires operator review.",
    };
  }

  cloned.provenance_status = "graph_only";
  cloned.node_provenance = {
    origin: "graph_only",
    generated_at: normalizeText(node?.node_provenance?.generated_at),
    regenerated_at: now,
    previous_node_id: normalizeText(node?.id),
  };
  cloned.field_provenance = fieldProvenance;
  return cloned;
}

export function regenerateLayeredDag({ prdPath, prdText, previousDag, now = new Date().toISOString() }) {
  const freshDag = compileLayeredDag({ prdPath, prdText, now });
  if (!previousDag || !Array.isArray(previousDag.nodes) || previousDag.nodes.length === 0) {
    return {
      dag: freshDag,
      diff: {
        schema_version: "layered-dag-regeneration/v1",
        regenerated_at: now,
        source_prd: freshDag.source_prd,
        added_nodes: freshDag.nodes.map((node) => node.id),
        removed_nodes: [],
        changed_dependencies: [],
        changed_acceptance_shape: [],
        prd_gaps: [],
        graph_only_nodes: [],
        preserved_user_edits: [],
        stale_fields: [],
      },
    };
  }

  const previousNodesById = new Map(previousDag.nodes.map((node) => [node.id, node]));
  const freshNodeIds = new Set(freshDag.nodes.map((node) => node.id));
  const previousOnlyIds = previousDag.nodes
    .map((node) => node.id)
    .filter((nodeId) => !freshNodeIds.has(nodeId));
  const knownNodeIds = new Set([
    ...freshDag.nodes.map((node) => node.id),
    ...previousOnlyIds,
  ]);

  const mergedNodes = [];
  const preservedUserEdits = [];
  const staleFields = [];
  const changedDependencies = [];
  const changedAcceptanceShape = [];

  for (const freshNode of freshDag.nodes) {
    const previousNode = previousNodesById.get(freshNode.id);
    if (!previousNode) {
      mergedNodes.push(freshNode);
      continue;
    }

    const merged = mergeNode({ freshNode, previousNode, knownNodeIds });
    mergedNodes.push(merged.node);

    if (merged.preservedFields.length > 0) {
      preservedUserEdits.push({
        node_id: freshNode.id,
        fields: merged.preservedFields,
      });
    }
    if (merged.staleFields.length > 0) {
      staleFields.push({
        node_id: freshNode.id,
        fields: merged.staleFields,
      });
    }
    if (freshNode.actionable !== false && !deepEqual(previousNode.depends_on, freshNode.depends_on)) {
      changedDependencies.push({
        node_id: freshNode.id,
        previous: cloneValue(previousNode.depends_on),
        current: cloneValue(freshNode.depends_on),
      });
    }
    if (freshNode.actionable !== false && !deepEqual(previousNode.acceptance_criteria, freshNode.acceptance_criteria)) {
      changedAcceptanceShape.push({
        node_id: freshNode.id,
        previous: cloneValue(previousNode.acceptance_criteria),
        current: cloneValue(freshNode.acceptance_criteria),
      });
    }
  }

  const graphOnlyNodes = [];
  const removedNodes = [];
  for (const nodeId of previousOnlyIds) {
    const previousNode = previousNodesById.get(nodeId);
    if (inferNodeOrigin(previousNode) === "generated") {
      removedNodes.push(nodeId);
    } else {
      graphOnlyNodes.push(nodeId);
    }
    mergedNodes.push(buildGraphOnlyNode(previousNode, now));
  }

  const prdAcceptanceCriteria = listAcceptanceCriteria(prdText);
  const prdGaps = collectCoverageGaps(prdAcceptanceCriteria, mergedNodes);
  const edges = buildEdges(mergedNodes, previousDag);
  const topologicalOrder = recalculateTopologicalOrder(mergedNodes);

  const dag = {
    ...freshDag,
    nodes: mergedNodes,
    edges,
    topological_order: topologicalOrder,
    dag_provenance: {
      generated_at: freshDag.dag_provenance?.generated_at || now,
      regenerated_at: now,
      previous_source_prd: normalizeText(previousDag?.source_prd),
      regeneration_status: "regenerated",
    },
    regeneration: {
      regenerated_at: now,
      previous_node_count: previousDag.nodes.length,
      graph_only_node_ids: graphOnlyNodes,
      prd_gap_count: prdGaps.length,
    },
    coverage_report: {
      prd_acceptance_criteria: prdAcceptanceCriteria,
      prd_gaps: prdGaps,
      graph_only_nodes: graphOnlyNodes,
    },
  };

  const diff = {
    schema_version: "layered-dag-regeneration/v1",
    regenerated_at: now,
    source_prd: freshDag.source_prd,
    previous_source_prd: normalizeText(previousDag?.source_prd),
    added_nodes: freshDag.nodes
      .map((node) => node.id)
      .filter((nodeId) => !previousNodesById.has(nodeId)),
    removed_nodes: removedNodes,
    changed_dependencies: changedDependencies,
    changed_acceptance_shape: changedAcceptanceShape,
    prd_gaps: prdGaps,
    graph_only_nodes: graphOnlyNodes,
    preserved_user_edits: preservedUserEdits,
    stale_fields: staleFields,
    summary: {
      added_nodes: freshDag.nodes.filter((node) => !previousNodesById.has(node.id)).length,
      removed_nodes: removedNodes.length,
      changed_dependencies: changedDependencies.length,
      changed_acceptance_shape: changedAcceptanceShape.length,
      prd_gaps: prdGaps.length,
      graph_only_nodes: graphOnlyNodes.length,
      preserved_user_edits: preservedUserEdits.length,
      stale_fields: staleFields.length,
    },
  };

  return { dag, diff };
}

function renderFieldList(items, formatItem) {
  if (!Array.isArray(items) || items.length === 0) {
    return "- None";
  }
  return items.map((item) => `- ${formatItem(item)}`).join("\n");
}

export function renderLayeredDagRegenerationMarkdown(diff) {
  return `# DAG Regeneration Diff

Regenerated at: ${diff.regenerated_at}
Source PRD: ${diff.source_prd}
Previous source PRD: ${diff.previous_source_prd || "None"}

## Summary

- Added nodes: ${diff.summary?.added_nodes ?? diff.added_nodes.length}
- Removed nodes: ${diff.summary?.removed_nodes ?? diff.removed_nodes.length}
- Changed dependencies: ${diff.summary?.changed_dependencies ?? diff.changed_dependencies.length}
- Changed acceptance shape: ${diff.summary?.changed_acceptance_shape ?? diff.changed_acceptance_shape.length}
- PRD gaps: ${diff.summary?.prd_gaps ?? diff.prd_gaps.length}
- Graph-only nodes: ${diff.summary?.graph_only_nodes ?? diff.graph_only_nodes.length}
- Preserved user edits: ${diff.summary?.preserved_user_edits ?? diff.preserved_user_edits.length}
- Stale fields: ${diff.summary?.stale_fields ?? diff.stale_fields.length}

## Added Nodes

${renderFieldList(diff.added_nodes, (item) => item)}

## Removed Nodes

${renderFieldList(diff.removed_nodes, (item) => item)}

## Changed Dependencies

${renderFieldList(diff.changed_dependencies, (item) => `${item.node_id}: ${item.previous?.join(", ") || "None"} -> ${item.current?.join(", ") || "None"}`)}

## Changed Acceptance Shape

${renderFieldList(diff.changed_acceptance_shape, (item) => `${item.node_id}: ${item.previous?.join(" | ") || "None"} -> ${item.current?.join(" | ") || "None"}`)}

## PRD Gaps

${renderFieldList(diff.prd_gaps, (item) => item)}

## Graph-Only Nodes

${renderFieldList(diff.graph_only_nodes, (item) => item)}

## Preserved User Edits

${renderFieldList(diff.preserved_user_edits, (item) => `${item.node_id}: ${item.fields.join(", ")}`)}

## Stale Fields

${renderFieldList(diff.stale_fields, (item) => `${item.node_id}: ${item.fields.join(", ")}`)}
`;
}
