const DEFAULT_LABEL_DEFINITIONS = {
  bug: {
    color: "d73a4a",
    description: "Something is broken.",
  },
  enhancement: {
    color: "a2eeef",
    description: "New feature or improvement.",
  },
  "needs-triage": {
    color: "fbca04",
    description: "Maintainer needs to evaluate.",
  },
  "needs-info": {
    color: "f9d0c4",
    description: "Blocked on more context or evidence.",
  },
  "ready-for-agent": {
    color: "0e8a16",
    description: "Fully specified and AFK-ready.",
  },
  "ready-for-human": {
    color: "5319e7",
    description: "Needs human implementation or judgment.",
  },
  wontfix: {
    color: "ffffff",
    description: "Not planned for implementation.",
  },
};

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function fallbackLabelDefinition(name) {
  return {
    color: "bfd4f2",
    description: `Canonical tracker label: ${name}.`,
  };
}

export function buildCanonicalLabelDefinitions(config, options = {}) {
  const labels = unique([...(config.labels?.category || []), ...(config.labels?.state || [])]);
  const overrides = options.labelDefinitions || {};

  return labels.map((name) => {
    const base = DEFAULT_LABEL_DEFINITIONS[name] || fallbackLabelDefinition(name);
    const override = overrides[name] || {};
    return {
      name,
      color: String(override.color || base.color).toLowerCase(),
      description: override.description || base.description,
    };
  });
}

function normalizeExistingLabel(label) {
  if (!label) {
    return null;
  }

  return {
    name: label.name || "",
    color: String(label.color || "").toLowerCase(),
    description: label.description || "",
  };
}

export function inspectCanonicalLabels(canonicalLabels, existingLabels) {
  const existingByName = new Map(
    (existingLabels || [])
      .map(normalizeExistingLabel)
      .filter(Boolean)
      .map((label) => [label.name, label]),
  );

  return canonicalLabels.map((canonical) => {
    const existing = existingByName.get(canonical.name);

    if (!existing) {
      return {
        ...canonical,
        status: "missing",
        drift: [],
      };
    }

    const drift = [];
    if (existing.color !== canonical.color) {
      drift.push({
        field: "color",
        expected: canonical.color,
        actual: existing.color,
      });
    }
    if (existing.description !== canonical.description) {
      drift.push({
        field: "description",
        expected: canonical.description,
        actual: existing.description,
      });
    }

    return {
      ...canonical,
      status: drift.length > 0 ? "drift" : "present",
      actual: existing,
      drift,
    };
  });
}

export function planLabelCreateCommands(labelInspection) {
  return labelInspection
    .filter((label) => label.status === "missing")
    .map((label) => ({
      command: "gh",
      args: ["label", "create", label.name, "--color", label.color, "--description", label.description],
      label,
    }));
}

function formatMismatch(mismatch) {
  return `${mismatch.field} expected "${mismatch.expected}" actual "${mismatch.actual}"`;
}

export function renderGitHubBootstrapReport({
  mode = "dry-run",
  gh = { available: false, version: "", authenticated: false, authDetail: "" },
  repository = {},
  labelInspection = [],
  templatePresent = false,
  projectFields = [],
  projectViews = [],
  createCommands = [],
  applyResults = [],
}) {
  const lines = [
    "# GitHub Tracker Bootstrap",
    "",
    `Mode: ${mode}`,
    "",
  ];

  if (mode === "apply") {
    lines.push("Only missing canonical labels were eligible for creation.");
    lines.push("Existing labels were left untouched, including any drift.");
  } else {
    lines.push("No GitHub labels, issues, projects, fields, or comments were created or modified.");
  }

  lines.push("", "## gh CLI", "");
  if (!gh.available) {
    lines.push("- Status: missing");
    lines.push("- Install: https://cli.github.com/");
    lines.push("- After install, run: gh auth login");
  } else {
    lines.push("- Status: available");
    lines.push(`- Version: ${gh.version || "detected"}`);
    lines.push("", "## Authentication", "");
    lines.push(`- Status: ${gh.authenticated ? "authenticated" : "not authenticated or unavailable"}`);
    if (!gh.authenticated) {
      lines.push("- Next step: gh auth login");
      if (gh.authDetail) {
        lines.push(`- Detail: ${gh.authDetail}`);
      }
    }
  }

  lines.push("", "## Repository", "");
  lines.push(`- Config owner: ${repository.owner || "unset"}`);
  lines.push(`- Config repo: ${repository.repo || "unset"}`);
  lines.push(`- Project URL: ${repository.projectUrl || "unset"}`);
  lines.push(`- Project ID: ${repository.projectId || "unset"}`);
  lines.push(`- Project number: ${repository.projectNumber || "unset"}`);

  lines.push("", "## Canonical Labels", "");
  for (const label of labelInspection) {
    lines.push(`- ${label.name}: ${label.color} - ${label.description}`);
  }

  lines.push("", "## Label Inspection", "");
  if (labelInspection.length === 0) {
    lines.push("- Status: unavailable");
  } else {
    for (const label of labelInspection) {
      if (label.status === "missing") {
        lines.push(`- missing: ${label.name}`);
        continue;
      }

      if (label.status === "drift") {
        lines.push(`- Tracker Drift: ${label.name} (${label.drift.map(formatMismatch).join("; ")})`);
        continue;
      }

      lines.push(`- present: ${label.name}`);
    }
  }

  lines.push("", "## Planned Label Changes", "");
  if (createCommands.length === 0) {
    lines.push("- None");
  } else {
    for (const planned of createCommands) {
      lines.push(`- would create: ${planned.label.name}`);
    }
  }

  if (mode === "apply") {
    lines.push("", "## Apply Results", "");
    if (applyResults.length === 0) {
      lines.push("- No labels were created.");
    } else {
      for (const result of applyResults) {
        lines.push(`- created: ${result.label.name}`);
      }
    }
  }

  lines.push("", "## Issue Templates", "");
  lines.push(`- ${templatePresent ? "present" : "missing"}: .github/ISSUE_TEMPLATE/agentic-slice.md`);

  lines.push("", "## Required Project Fields", "");
  for (const field of projectFields) {
    const values = field.values?.length > 0 ? field.values.join(", ") : field.type;
    lines.push(`- ${field.name}: ${values}`);
  }

  lines.push("", "## Recommended Project Views", "");
  for (const view of projectViews) {
    lines.push(`- ${view}`);
  }

  lines.push("", "## Notes", "");
  lines.push("- Project fields and views are report-only in this bootstrap module.");
  lines.push("- Tracker Drift is reported for canonical label mismatches and never auto-corrected.");

  return `${lines.join("\n")}\n`;
}

export async function applyMissingCanonicalLabels(labelInspection, options = {}) {
  const runner = options.runner || (async () => ({ code: 0, stdout: "", stderr: "" }));
  const planned = planLabelCreateCommands(labelInspection);
  const results = [];

  for (const plannedCommand of planned) {
    const execution = await runner(plannedCommand.command, plannedCommand.args, plannedCommand.label);
    results.push({
      ...plannedCommand,
      execution,
    });
  }

  return results;
}

export async function createGitHubBootstrapReport(config, options = {}) {
  const canonicalLabels = buildCanonicalLabelDefinitions(config, options);
  const labelInspection = inspectCanonicalLabels(canonicalLabels, options.existingLabels || []);
  const createCommands = planLabelCreateCommands(labelInspection);
  const mode = options.apply ? "apply" : "dry-run";
  const applyResults = options.apply ? await applyMissingCanonicalLabels(labelInspection, options) : [];

  return {
    mode,
    canonicalLabels,
    labelInspection,
    createCommands,
    applyResults,
    text: renderGitHubBootstrapReport({
      mode,
      gh: options.gh,
      repository: {
        owner: options.repository?.owner || config.github?.owner || "",
        repo: options.repository?.repo || config.github?.repo || "",
        projectUrl: options.repository?.projectUrl || config.github?.projectUrl || "",
        projectId: options.repository?.projectId || config.github?.projectId || "",
        projectNumber: options.repository?.projectNumber || config.github?.projectNumber || "",
      },
      labelInspection,
      templatePresent: Boolean(options.templatePresent),
      projectFields: config.projectSchema?.requiredFields || [],
      projectViews: config.projectSchema?.recommendedViews || [],
      createCommands,
      applyResults,
    }),
  };
}

export { DEFAULT_LABEL_DEFINITIONS };
