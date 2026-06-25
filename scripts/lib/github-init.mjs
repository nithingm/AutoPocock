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

function normalizeExistingProjectView(view) {
  if (!view) {
    return null;
  }

  return {
    name: view.name || "",
    normalizedName: String(view.name || "").trim().toLowerCase(),
    layout: view.layout || "",
    number: view.number || "",
  };
}

export function inspectProjectViews(recommendedViews = [], existingViews = []) {
  const existingByName = new Map(
    (existingViews || [])
      .map(normalizeExistingProjectView)
      .filter(Boolean)
      .map((view) => [view.name.toLowerCase(), view]),
  );
  const existingByTrimmedName = new Map(
    (existingViews || [])
      .map(normalizeExistingProjectView)
      .filter(Boolean)
      .map((view) => [view.normalizedName, view]),
  );

  return (recommendedViews || []).map((name) => {
    const expectedName = String(name || "");
    const exact = existingByName.get(expectedName.toLowerCase());
    if (exact) {
      return {
        name: expectedName,
        status: "present",
        layout: exact.layout,
        number: exact.number,
        actual: exact,
        drift: [],
      };
    }

    const trimmedMatch = existingByTrimmedName.get(expectedName.trim().toLowerCase());
    if (trimmedMatch) {
      return {
        name: expectedName,
        status: "drift",
        layout: trimmedMatch.layout,
        number: trimmedMatch.number,
        actual: trimmedMatch,
        drift: [
          {
            field: "name",
            expected: expectedName,
            actual: trimmedMatch.name,
          },
        ],
      };
    }

    return {
      name: expectedName,
      status: "missing",
      layout: "",
      number: "",
      drift: [],
    };
  });
}

export function buildProjectViewPlan({
  repository = {},
  projectViews = [],
  projectViewInspection = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const missing = projectViewInspection.filter((view) => view.status === "missing");
  const drift = projectViewInspection.filter((view) => view.status === "drift");
  const present = projectViewInspection.filter((view) => view.status === "present");
  const projectUrl = repository.projectUrl
    || (repository.owner && repository.projectNumber ? `https://github.com/users/${repository.owner}/projects/${repository.projectNumber}` : "");
  const inspectionAvailable = projectViewInspection.length > 0;

  return {
    schema_version: "github-project-view-plan/v1",
    generated_at: generatedAt,
    repository: {
      owner: repository.owner || "",
      repo: repository.repo || "",
      project_url: projectUrl,
      project_id: repository.projectId || "",
      project_number: repository.projectNumber || "",
    },
    api_status: {
      view_mutations_available: false,
      reason: "GitHub CLI/GraphQL expose ProjectV2 project, item, and field mutations, but not ProjectV2 view create/update/rename mutations.",
    },
    summary: {
      recommended_views: projectViews.length,
      inspection_available: inspectionAvailable,
      present: present.length,
      missing: missing.length,
      drift: drift.length,
    },
    actions: [
      ...missing.map((view) => ({
        type: "manual_create_view",
        view_name: view.name,
        expected_layout: "TABLE_LAYOUT",
        reason: "Recommended view is missing from the Project.",
      })),
      ...drift.map((view) => ({
        type: "manual_rename_view",
        view_name: view.name,
        current_name: view.actual?.name || "",
        view_number: view.number || view.actual?.number || "",
        reason: "Recommended view exists only with name drift.",
      })),
    ],
    verification: {
      command: "pnpm ops github:init",
      expected: "Project View Inspection reports all recommended views as present and no Project View Drift entries remain.",
    },
    workarounds: [
      {
        name: "template_project_copy",
        status: "candidate",
        guidance: "For fresh setups, maintain a template Project with the desired views and empirically verify whether GitHub's Project copy flow preserves those views before using it as the bootstrap path.",
      },
      {
        name: "browser_ui_automation",
        status: "last_resort",
        guidance: "A one-off browser automation helper can drive the GitHub UI, but it should stay outside core automation because Project view UI selectors and flows are not stable contracts.",
      },
    ],
  };
}

export function renderProjectViewPlanMarkdown(plan) {
  const lines = [
    "# Prepared Human Step: GitHub Project Views",
    "",
    `Generated: ${plan.generated_at}`,
    `Project: ${plan.repository.project_url || plan.repository.project_id || plan.repository.project_number || "unconfigured"}`,
    "",
    "## API Status",
    "",
    `- View mutations available: ${plan.api_status.view_mutations_available ? "yes" : "no"}`,
    `- Reason: ${plan.api_status.reason}`,
    "",
    "## Summary",
    "",
    `- Recommended views: ${plan.summary.recommended_views}`,
    `- Inspection available: ${plan.summary.inspection_available ? "yes" : "no"}`,
    `- Present: ${plan.summary.present}`,
    `- Missing: ${plan.summary.missing}`,
    `- Drift: ${plan.summary.drift}`,
    "",
    "## Manual Actions",
    "",
  ];

  if (plan.actions.length === 0) {
    lines.push("- None. Re-run verification before relying on this snapshot.");
  } else {
    for (const action of plan.actions) {
      if (action.type === "manual_create_view") {
        lines.push(`- Create Project view: ${action.view_name} (${action.expected_layout}).`);
      } else if (action.type === "manual_rename_view") {
        lines.push(`- Rename Project view${action.view_number ? ` #${action.view_number}` : ""}: ${action.current_name} -> ${action.view_name}.`);
      }
    }
  }

  lines.push(
    "",
    "## Verification",
    "",
    `- Command: \`${plan.verification.command}\``,
    `- Expected: ${plan.verification.expected}`,
    "",
    "## Workarounds",
    "",
  );

  for (const workaround of plan.workarounds) {
    lines.push(`- ${workaround.name} (${workaround.status}): ${workaround.guidance}`);
  }

  return `${lines.join("\n")}\n`;
}

function formatMismatch(mismatch) {
  return `${mismatch.field} expected "${mismatch.expected}" actual "${mismatch.actual}"`;
}

function projectTitle(config, options = {}) {
  return options.projectTitle || config.github?.projectTitle || config.github?.repo || "AutoPocock";
}

export function planProjectCreateCommand({ owner = "", title = "" } = {}) {
  if (!owner || !title) {
    return null;
  }

  return {
    command: "gh",
    args: ["project", "create", "--owner", owner, "--title", title, "--format", "json"],
    project: {
      owner,
      title,
    },
  };
}

function parseProjectCreateOutput(execution) {
  try {
    const parsed = JSON.parse(execution.stdout || "{}");
    return {
      id: parsed.id || "",
      number: parsed.number || parsed.projectNumber || "",
      url: parsed.url || "",
      title: parsed.title || "",
    };
  } catch {
    return {
      id: "",
      number: "",
      url: "",
      title: "",
    };
  }
}

export async function applyProjectCreate(options = {}) {
  const runner = options.projectRunner || options.runner || (async () => ({ code: 0, stdout: "", stderr: "" }));
  const planned = planProjectCreateCommand(options);
  if (!planned) {
    return null;
  }

  const execution = await runner(planned.command, planned.args, planned.project);
  return {
    ...planned,
    execution,
    createdProject: parseProjectCreateOutput(execution),
  };
}

export function renderGitHubBootstrapReport({
  mode = "dry-run",
  gh = { available: false, version: "", authenticated: false, authDetail: "" },
  repository = {},
  projectCreateCommand = null,
  projectCreateResult = null,
  labelInspection = [],
  templatePresent = false,
  projectFields = [],
  projectFieldInspection = [],
  projectViews = [],
  projectViewInspection = [],
  createCommands = [],
  projectFieldCreateCommands = [],
  applyResults = [],
  projectFieldApplyResults = [],
  createProject = false,
  createProjectFields = false,
}) {
  const lines = [
    "# GitHub Tracker Bootstrap",
    "",
    `Mode: ${mode}`,
    "",
  ];

  if (mode === "apply") {
    lines.push("Only missing canonical labels and explicitly requested Project/project-field resources were eligible for creation.");
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

  lines.push("", "## Project Creation", "");
  if (!projectCreateCommand) {
    lines.push("- None");
  } else if (createProject) {
    lines.push(`- would create: ${projectCreateCommand.project.title} for ${projectCreateCommand.project.owner}`);
  } else {
    lines.push(`- available with --create-project: ${projectCreateCommand.project.title} for ${projectCreateCommand.project.owner}`);
  }

  if (mode === "apply") {
    lines.push("", "## Project Create Results", "");
    if (!createProject) {
      lines.push("- Skipped. Add `--create-project` only for fresh setups without a configured Project reference.");
    } else if (!projectCreateResult) {
      lines.push("- No Project was created.");
    } else {
      lines.push(`- created: ${projectCreateResult.createdProject.title || projectCreateCommand.project.title}`);
      lines.push(`- number: ${projectCreateResult.createdProject.number || "unknown"}`);
      lines.push(`- url: ${projectCreateResult.createdProject.url || "unknown"}`);
    }
  }

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

  lines.push("", "## Project View Inspection", "");
  if (projectViewInspection.length === 0) {
    lines.push("- Status: unavailable");
  } else {
    for (const view of projectViewInspection) {
      if (view.status === "missing") {
        lines.push(`- missing: ${view.name}`);
        continue;
      }

      if (view.status === "drift") {
        lines.push(`- Project View Drift: ${view.name} (${view.drift.map(formatMismatch).join("; ")})`);
        continue;
      }

      lines.push(`- present: ${view.name} (${view.layout || "layout unknown"})`);
    }
  }

  lines.push("", "## Planned Project View Changes", "");
  if (projectViewInspection.some((view) => view.status === "missing" || view.status === "drift")) {
    lines.push("- No automatic Project view changes are available through GitHub CLI/GraphQL.");
    for (const view of projectViewInspection.filter((candidate) => candidate.status === "missing")) {
      lines.push(`- manual create: ${view.name}`);
    }
    for (const view of projectViewInspection.filter((candidate) => candidate.status === "drift")) {
      lines.push(`- manual rename: ${view.actual.name} -> ${view.name}`);
    }
  } else {
    lines.push("- None");
  }

  lines.push("", "## Notes", "");
  lines.push("- Project creation is allowed only with `--apply --create-project` and no existing configured Project reference.");
  lines.push("- Project fields are dry-run-first and are created only with `--apply --create-project-fields`.");
  lines.push("- Project views are inspected through GraphQL when available; creation and renaming remain manual because GitHub CLI/GraphQL do not expose ProjectV2 view mutations.");
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
  const projectFieldInspection = hasProjectFieldInspection || options.createProject ? inspectProjectFields(allProjectFields, options.existingProjectFields || []) : [];
  const hasProjectViewInspection = Object.hasOwn(options, "existingProjectViews");
  const projectViewInspection = hasProjectViewInspection ? inspectProjectViews(config.projectSchema?.recommendedViews || [], options.existingProjectViews || []) : [];
  const owner = options.repository?.owner || config.github?.owner || "";
  const title = projectTitle(config, options);
  const projectCreateCommand = planProjectCreateCommand({ owner, title });
  const projectFieldCreateCommands = hasProjectFieldInspection
    ? planProjectFieldCreateCommands(projectFieldInspection, {
        projectNumber: options.repository?.projectNumber || config.github?.projectNumber || "",
        owner,
      })
    : options.createProject
    ? planProjectFieldCreateCommands(projectFieldInspection, {
        projectNumber: "<created-project-number>",
        owner,
      })
    : [];
  const mode = options.apply ? "apply" : "dry-run";
  const applyResults = options.apply ? await applyMissingCanonicalLabels(labelInspection, options) : [];
  const projectCreateResult = options.apply && options.createProject
    ? await applyProjectCreate({ ...options, owner, title })
    : null;
  const fieldProjectNumber = projectCreateResult?.createdProject?.number || options.repository?.projectNumber || config.github?.projectNumber || "";
  const projectFieldApplyResults = options.apply && options.createProjectFields
    ? await applyMissingProjectFields(projectFieldInspection, {
        ...options,
        projectNumber: fieldProjectNumber,
        owner,
      })
    : [];

  return {
    mode,
    canonicalLabels,
    labelInspection,
    createCommands,
    projectFieldInspection,
    projectViewInspection,
    projectCreateCommand,
    projectFieldCreateCommands,
    applyResults,
    projectCreateResult,
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
      projectCreateCommand,
      projectCreateResult,
      labelInspection,
      templatePresent: Boolean(options.templatePresent),
      projectFields: config.projectSchema?.requiredFields || [],
      projectFieldInspection,
      projectViews: config.projectSchema?.recommendedViews || [],
      projectViewInspection,
      createCommands,
      projectFieldCreateCommands,
      applyResults,
      projectFieldApplyResults,
      createProject: Boolean(options.createProject),
      createProjectFields: Boolean(options.createProjectFields),
    }),
  };
}

export { DEFAULT_LABEL_DEFINITIONS };
