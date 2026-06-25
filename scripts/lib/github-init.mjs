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

function configuredProjectFields(config) {
  return [
    ...(config.projectSchema?.requiredFields || []),
    ...(config.projectSchema?.optionalFields || []),
  ];
}

function normalizeProjectFieldType(type) {
  const normalized = String(type || "text").trim().toLowerCase();
  if (normalized === "single-select" || normalized === "single_select" || normalized === "single select") {
    return "SINGLE_SELECT";
  }
  if (normalized === "number") {
    return "NUMBER";
  }
  if (normalized === "date") {
    return "DATE";
  }
  return "TEXT";
}

function normalizeExistingProjectField(field) {
  if (!field) {
    return null;
  }

  return {
    name: field.name || "",
    type: field.type || "",
    options: Array.isArray(field.options) ? field.options.map((option) => option.name || option).filter(Boolean) : [],
  };
}

export function inspectProjectFields(configuredFields, existingFields = []) {
  const existingByName = new Map(
    (existingFields || [])
      .map(normalizeExistingProjectField)
      .filter(Boolean)
      .map((field) => [field.name.toLowerCase(), field]),
  );

  return configuredFields.map((field) => {
    const expectedType = normalizeProjectFieldType(field.type);
    const expectedOptions = expectedType === "SINGLE_SELECT" ? [...(field.values || [])] : [];
    const existing = existingByName.get(String(field.name || "").toLowerCase());

    if (!existing) {
      return {
        ...field,
        dataType: expectedType,
        status: "missing",
        drift: [],
      };
    }

    const drift = [];
    if (expectedType === "SINGLE_SELECT") {
      const missingOptions = expectedOptions.filter((option) => !existing.options.includes(option));
      const extraOptions = existing.options.filter((option) => !expectedOptions.includes(option));
      if (missingOptions.length > 0 || extraOptions.length > 0) {
        drift.push({
          field: "options",
          expected: expectedOptions.join(", "),
          actual: existing.options.join(", "),
        });
      }
    }

    return {
      ...field,
      dataType: expectedType,
      status: drift.length > 0 ? "drift" : "present",
      actual: existing,
      drift,
    };
  });
}

export function planProjectFieldCreateCommands(projectFieldInspection, { projectNumber = "", owner = "" } = {}) {
  return projectFieldInspection
    .filter((field) => field.status === "missing")
    .map((field) => {
      const args = [
        "project",
        "field-create",
        String(projectNumber),
        "--owner",
        owner,
        "--name",
        field.name,
        "--data-type",
        field.dataType,
        "--format",
        "json",
      ];

      if (field.dataType === "SINGLE_SELECT") {
        args.push("--single-select-options", (field.values || []).join(","));
      }

      return {
        command: "gh",
        args,
        field,
      };
    });
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
  projectFieldInspection = [],
  projectViews = [],
  createCommands = [],
  projectFieldCreateCommands = [],
  applyResults = [],
  projectFieldApplyResults = [],
  createProjectFields = false,
}) {
  const lines = [
    "# GitHub Tracker Bootstrap",
    "",
    `Mode: ${mode}`,
    "",
  ];

  if (mode === "apply") {
    lines.push("Only missing canonical labels and explicitly requested missing Project fields were eligible for creation.");
    lines.push("Existing labels and Project fields were left untouched, including any drift.");
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

  lines.push("", "## Project Field Inspection", "");
  if (projectFieldInspection.length === 0) {
    lines.push("- Status: unavailable");
  } else {
    for (const field of projectFieldInspection) {
      if (field.status === "missing") {
        lines.push(`- missing: ${field.name} (${field.dataType})`);
        continue;
      }

      if (field.status === "drift") {
        lines.push(`- Project Drift: ${field.name} (${field.drift.map(formatMismatch).join("; ")})`);
        continue;
      }

      lines.push(`- present: ${field.name}`);
    }
  }

  lines.push("", "## Planned Project Field Changes", "");
  if (projectFieldCreateCommands.length === 0) {
    lines.push("- None");
  } else if (!createProjectFields) {
    for (const planned of projectFieldCreateCommands) {
      lines.push(`- would create with --create-project-fields: ${planned.field.name}`);
    }
  } else {
    for (const planned of projectFieldCreateCommands) {
      lines.push(`- would create: ${planned.field.name}`);
    }
  }

  if (mode === "apply") {
    lines.push("", "## Project Field Apply Results", "");
    if (!createProjectFields) {
      lines.push("- Skipped. Add `--create-project-fields` to create missing Project fields.");
    } else if (projectFieldApplyResults.length === 0) {
      lines.push("- No Project fields were created.");
    } else {
      for (const result of projectFieldApplyResults) {
        lines.push(`- created: ${result.field.name}`);
      }
    }
  }

  lines.push("", "## Recommended Project Views", "");
  for (const view of projectViews) {
    lines.push(`- ${view}`);
  }

  lines.push("", "## Notes", "");
  lines.push("- Project fields are dry-run-first and are created only with `--apply --create-project-fields`.");
  lines.push("- Project views are still report-only because the GitHub CLI does not expose view creation.");
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

export async function applyMissingProjectFields(projectFieldInspection, options = {}) {
  const runner = options.projectFieldRunner || options.runner || (async () => ({ code: 0, stdout: "", stderr: "" }));
  const planned = planProjectFieldCreateCommands(projectFieldInspection, options);
  const results = [];

  for (const plannedCommand of planned) {
    const execution = await runner(plannedCommand.command, plannedCommand.args, plannedCommand.field);
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
  const allProjectFields = configuredProjectFields(config);
  const hasProjectFieldInspection = Object.hasOwn(options, "existingProjectFields");
  const projectFieldInspection = hasProjectFieldInspection ? inspectProjectFields(allProjectFields, options.existingProjectFields || []) : [];
  const projectFieldCreateCommands = hasProjectFieldInspection
    ? planProjectFieldCreateCommands(projectFieldInspection, {
        projectNumber: options.repository?.projectNumber || config.github?.projectNumber || "",
        owner: options.repository?.owner || config.github?.owner || "",
      })
    : [];
  const mode = options.apply ? "apply" : "dry-run";
  const applyResults = options.apply ? await applyMissingCanonicalLabels(labelInspection, options) : [];
  const projectFieldApplyResults = options.apply && options.createProjectFields
    ? await applyMissingProjectFields(projectFieldInspection, {
        ...options,
        projectNumber: options.repository?.projectNumber || config.github?.projectNumber || "",
        owner: options.repository?.owner || config.github?.owner || "",
      })
    : [];

  return {
    mode,
    canonicalLabels,
    labelInspection,
    createCommands,
    projectFieldInspection,
    projectFieldCreateCommands,
    applyResults,
    projectFieldApplyResults,
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
      projectFieldInspection,
      projectViews: config.projectSchema?.recommendedViews || [],
      createCommands,
      projectFieldCreateCommands,
      applyResults,
      projectFieldApplyResults,
      createProjectFields: Boolean(options.createProjectFields),
    }),
  };
}

export { DEFAULT_LABEL_DEFINITIONS };
