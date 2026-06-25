function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseNodeIdFromBody(body) {
  const text = normalizeText(body);
  if (!text) {
    return "";
  }

  const markers = [
    /(?:^|\n)DAG-Node:\s*([A-Za-z0-9._-]+)/i,
    /(?:^|\n)Node-ID:\s*([A-Za-z0-9._-]+)/i,
    /<!--\s*dag-node:\s*([A-Za-z0-9._-]+)\s*-->/i,
  ];

  for (const marker of markers) {
    const match = marker.exec(text);
    if (match) {
      return match[1];
    }
  }

  return "";
}

function extractLabelNames(issue) {
  const rawLabels = Array.isArray(issue?.labels) ? issue.labels : [];
  return rawLabels
    .map((label) => {
      if (typeof label === "string") {
        return label.trim();
      }
      return typeof label?.name === "string" ? label.name.trim() : "";
    })
    .filter(Boolean);
}

function normalizeLiveIssue(issue) {
  const number = Number(issue?.number);
  if (!Number.isFinite(number)) {
    throw new Error("Live GitHub issues must include a numeric `number`.");
  }

  const fields = issue?.fields && typeof issue.fields === "object" ? issue.fields : {};
  const title = normalizeText(issue?.title);
  const labels = extractLabelNames(issue);
  const explicitNodeId = normalizeText(issue?.dag_node_id || issue?.node_id);
  const nodeId = explicitNodeId || parseNodeIdFromBody(issue?.body);

  return {
    number,
    id: issue?.id ?? null,
    url: normalizeText(issue?.url),
    title,
    state: normalizeText(issue?.state) || "OPEN",
    labels,
    fields,
    node_id: nodeId,
    body: normalizeText(issue?.body),
  };
}

function normalizeMappingEntry(entry) {
  const issueNumber = Number(entry?.issue_number);
  if (!normalizeText(entry?.node_id) || !Number.isFinite(issueNumber)) {
    return null;
  }

  return {
    node_id: normalizeText(entry.node_id),
    issue_number: issueNumber,
    issue_url: normalizeText(entry.issue_url),
    issue_title: normalizeText(entry.issue_title),
    source: normalizeText(entry.source) || "persisted",
    last_seen_at: normalizeText(entry.last_seen_at),
  };
}

function defaultTrackerProjection(node) {
  return {
    title: normalizeText(node?.title),
    labels: [],
    fields: {},
  };
}

function compareIssueToProjection({ node, issue, projection }) {
  const drifts = [];

  if (projection.title && projection.title !== issue.title) {
    drifts.push({
      category: "title_drift",
      node_id: node.id,
      issue_number: issue.number,
      expected: projection.title,
      actual: issue.title,
      message: `Issue #${issue.number} title differs from DAG node ${node.id}.`,
    });
  }

  const expectedLabels = Array.isArray(projection.labels) ? projection.labels.filter(Boolean) : [];
  const missingLabels = expectedLabels.filter((label) => !issue.labels.includes(label));
  if (missingLabels.length > 0) {
    drifts.push({
      category: "label_drift",
      node_id: node.id,
      issue_number: issue.number,
      expected: missingLabels,
      actual: issue.labels,
      message: `Issue #${issue.number} is missing expected labels for DAG node ${node.id}.`,
    });
  }

  const expectedFields = projection.fields && typeof projection.fields === "object" ? projection.fields : {};
  for (const [fieldName, expectedValue] of Object.entries(expectedFields)) {
    const actualValue = issue.fields?.[fieldName];
    if (actualValue !== expectedValue) {
      drifts.push({
        category: "field_drift",
        node_id: node.id,
        issue_number: issue.number,
        field: fieldName,
        expected: expectedValue,
        actual: actualValue,
        message: `Issue #${issue.number} field \`${fieldName}\` differs from DAG expectations for ${node.id}.`,
      });
    }
  }

  return drifts;
}

function buildDriftText(entry) {
  const issuePart = entry.issue_number ? ` issue #${entry.issue_number}` : "";
  const nodePart = entry.node_id ? ` node ${entry.node_id}` : "";
  return entry.message || `${entry.category}${nodePart}${issuePart}`;
}

export function reconcileDagToGitHub({
  dag,
  previous = null,
  liveIssues = [],
  trackerProjectionForNode = defaultTrackerProjection,
  now = new Date().toISOString(),
} = {}) {
  if (!dag || !Array.isArray(dag.nodes)) {
    throw new Error("A DAG with a `nodes` array is required for reconciliation.");
  }

  const liveByNumber = new Map();
  const liveByNodeId = new Map();
  const drift = [];

  for (const issue of liveIssues.map(normalizeLiveIssue)) {
    liveByNumber.set(issue.number, issue);
    if (!issue.node_id) {
      continue;
    }
    const matches = liveByNodeId.get(issue.node_id) || [];
    matches.push(issue);
    liveByNodeId.set(issue.node_id, matches);
  }

  const previousMappings = Array.isArray(previous?.mappings) ? previous.mappings : [];
  const mappingByNodeId = new Map();
  const nodeIdByIssueNumber = new Map();

  for (const rawEntry of previousMappings) {
    const entry = normalizeMappingEntry(rawEntry);
    if (!entry) {
      continue;
    }

    if (mappingByNodeId.has(entry.node_id)) {
      drift.push({
        category: "mapping_conflict",
        node_id: entry.node_id,
        issue_number: entry.issue_number,
        message: `Persistent mapping contains duplicate entries for node ${entry.node_id}.`,
      });
      continue;
    }

    if (nodeIdByIssueNumber.has(entry.issue_number) && nodeIdByIssueNumber.get(entry.issue_number) !== entry.node_id) {
      drift.push({
        category: "mapping_conflict",
        node_id: entry.node_id,
        issue_number: entry.issue_number,
        expected: nodeIdByIssueNumber.get(entry.issue_number),
        actual: entry.node_id,
        message: `Persistent mapping assigns issue #${entry.issue_number} to multiple DAG nodes.`,
      });
      continue;
    }

    mappingByNodeId.set(entry.node_id, entry);
    nodeIdByIssueNumber.set(entry.issue_number, entry.node_id);
  }

  const mappings = [];
  const actions = {
    noop: [],
    create: [],
    update: [],
    manual_reconcile: [],
  };

  for (const node of dag.nodes) {
    const projection = trackerProjectionForNode(node) || defaultTrackerProjection(node);
    const persisted = mappingByNodeId.get(node.id) || null;
    const liveTaggedMatches = liveByNodeId.get(node.id) || [];
    let chosenIssue = null;
    let chosenSource = "unmapped";

    if (persisted) {
      const persistedIssue = liveByNumber.get(persisted.issue_number) || null;
      if (persistedIssue) {
        chosenIssue = persistedIssue;
        chosenSource = "persisted";
      } else if (liveTaggedMatches.length === 1) {
        chosenIssue = liveTaggedMatches[0];
        chosenSource = "retagged";
        drift.push({
          category: "missing_mapped_issue",
          node_id: node.id,
          issue_number: persisted.issue_number,
          expected: persisted.issue_number,
          actual: chosenIssue.number,
          message: `Persisted mapping for ${node.id} pointed to missing issue #${persisted.issue_number}; a unique tagged replacement was found.`,
        });
      } else if (liveTaggedMatches.length > 1) {
        drift.push({
          category: "duplicate_live_matches",
          node_id: node.id,
          issue_number: persisted.issue_number,
          expected: persisted.issue_number,
          actual: liveTaggedMatches.map((issue) => issue.number),
          message: `Persisted mapping for ${node.id} no longer resolves cleanly because multiple live issues claim the same DAG node.`,
        });
      } else {
        drift.push({
          category: "missing_mapped_issue",
          node_id: node.id,
          issue_number: persisted.issue_number,
          message: `Persisted mapping for ${node.id} points to missing issue #${persisted.issue_number}.`,
        });
      }
    } else if (liveTaggedMatches.length === 1) {
      chosenIssue = liveTaggedMatches[0];
      chosenSource = "live-tag";
    } else if (liveTaggedMatches.length > 1) {
      drift.push({
        category: "duplicate_live_matches",
        node_id: node.id,
        actual: liveTaggedMatches.map((issue) => issue.number),
        message: `Multiple live issues claim DAG node ${node.id}.`,
      });
    }

    if (chosenIssue) {
      if (chosenIssue.node_id && chosenIssue.node_id !== node.id) {
        drift.push({
          category: "live_issue_node_mismatch",
          node_id: node.id,
          issue_number: chosenIssue.number,
          expected: node.id,
          actual: chosenIssue.node_id,
          message: `Issue #${chosenIssue.number} claims a different DAG node than the reconciled mapping.`,
        });
      }

      const issueDrift = compareIssueToProjection({ node, issue: chosenIssue, projection });
      drift.push(...issueDrift);

      mappings.push({
        node_id: node.id,
        issue_number: chosenIssue.number,
        issue_url: chosenIssue.url,
        issue_title: chosenIssue.title,
        source: chosenSource,
        last_seen_at: now,
      });

      const hasActionableDrift = issueDrift.some((entry) =>
        entry.category === "title_drift" || entry.category === "label_drift" || entry.category === "field_drift",
      );

      if (hasActionableDrift || chosenSource === "retagged") {
        actions.update.push({
          node_id: node.id,
          issue_number: chosenIssue.number,
          reasons: issueDrift.map((entry) => entry.category).concat(chosenSource === "retagged" ? ["mapping_refresh"] : []),
        });
      } else {
        actions.noop.push({
          node_id: node.id,
          issue_number: chosenIssue.number,
        });
      }

      if (liveTaggedMatches.length > 1) {
        actions.manual_reconcile.push({
          node_id: node.id,
          issue_numbers: liveTaggedMatches.map((issue) => issue.number),
          reasons: ["duplicate_live_matches"],
        });
      }
      continue;
    }

    mappings.push({
      node_id: node.id,
      issue_number: null,
      issue_url: "",
      issue_title: "",
      source: "unmapped",
      last_seen_at: now,
    });
    actions.create.push({ node_id: node.id, title: projection.title || normalizeText(node.title) });

    if (liveTaggedMatches.length > 1) {
      actions.manual_reconcile.push({
        node_id: node.id,
        issue_numbers: liveTaggedMatches.map((issue) => issue.number),
        reasons: ["duplicate_live_matches"],
      });
    }
  }

  const knownNodeIds = new Set(dag.nodes.map((node) => node.id));
  for (const [nodeId, issues] of liveByNodeId.entries()) {
    if (!knownNodeIds.has(nodeId)) {
      drift.push({
        category: "unknown_live_node",
        node_id: nodeId,
        actual: issues.map((issue) => issue.number),
        message: `Live tracker references unknown DAG node ${nodeId}.`,
      });
    }
  }

  const dedupedDrift = [];
  const seenDrift = new Set();
  for (const entry of drift) {
    const key = JSON.stringify([
      entry.category,
      entry.node_id || "",
      entry.issue_number ?? "",
      entry.field || "",
      JSON.stringify(entry.expected ?? null),
      JSON.stringify(entry.actual ?? null),
      entry.message || "",
    ]);
    if (seenDrift.has(key)) {
      continue;
    }
    seenDrift.add(key);
    dedupedDrift.push(entry);
  }

  return {
    schema_version: "dag-github-reconcile/v1",
    reconciled_at: now,
    source_prd: dag.source_prd || "",
    source_dag_version: dag.schema_version || "",
    mappings,
    actions,
    drift: dedupedDrift,
    summary: {
      total_nodes: dag.nodes.length,
      mapped_nodes: mappings.filter((entry) => Number.isFinite(entry.issue_number)).length,
      unmapped_nodes: mappings.filter((entry) => !Number.isFinite(entry.issue_number)).map((entry) => entry.node_id),
      drift_count: dedupedDrift.length,
      create_count: actions.create.length,
      update_count: actions.update.length,
      manual_reconcile_count: actions.manual_reconcile.length,
    },
  };
}

export function renderDagGitHubReconciliation(report) {
  const lines = [
    "# DAG GitHub Reconciliation",
    "",
    `Reconciled at: ${report.reconciled_at}`,
    `Source PRD: ${report.source_prd || "unknown"}`,
    `DAG schema: ${report.source_dag_version || "unknown"}`,
    "",
    "## Summary",
    "",
    `- Total nodes: ${report.summary.total_nodes}`,
    `- Mapped nodes: ${report.summary.mapped_nodes}`,
    `- Unmapped nodes: ${report.summary.unmapped_nodes.join(", ") || "None"}`,
    `- Drift count: ${report.summary.drift_count}`,
    `- Create candidates: ${report.summary.create_count}`,
    `- Update candidates: ${report.summary.update_count}`,
    `- Manual reconcile candidates: ${report.summary.manual_reconcile_count}`,
    "",
    "## Node Mapping",
    "",
  ];

  for (const mapping of report.mappings) {
    lines.push(`- ${mapping.node_id}: ${Number.isFinite(mapping.issue_number) ? `#${mapping.issue_number}` : "unmapped"} (${mapping.source})`);
  }

  lines.push("", "## Drift", "");
  if (report.drift.length === 0) {
    lines.push("- None");
  } else {
    for (const entry of report.drift) {
      lines.push(`- ${buildDriftText(entry)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function findMappedIssueNumber(report, nodeId) {
  const mapping = report?.mappings?.find((entry) => entry.node_id === nodeId);
  return mapping?.issue_number ?? null;
}

export function buildIssueBodyNodeMarker(nodeId) {
  return `DAG-Node: ${nodeId}`;
}

export function buildIssueBodyNodeMarkerPattern(nodeId) {
  return new RegExp(`(?:^|\\n)${escapeRegExp(buildIssueBodyNodeMarker(nodeId))}(?:\\n|$)`, "i");
}
