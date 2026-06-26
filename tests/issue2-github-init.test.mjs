import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_LABEL_DEFINITIONS,
  buildCanonicalLabelDefinitions,
  buildProjectViewPlan,
  createGitHubBootstrapReport,
  inspectProjectFields,
  inspectProjectViewMutationCapability,
  inspectProjectViews,
  planProjectFieldUpdateCommands,
  planProjectCreateCommand,
  renderProjectViewPlanMarkdown,
} from "../scripts/lib/github-init.mjs";

function makeConfig() {
  return {
    github: {
      owner: "example",
      repo: "repo",
      projectUrl: "",
      projectId: "",
      projectNumber: "7",
    },
    labels: {
      category: ["bug", "enhancement"],
      state: ["needs-triage", "ready-for-agent"],
    },
    projectSchema: {
      requiredFields: [
        { name: "Execution Stage", type: "single-select", values: ["Inbox", "Done"] },
        { name: "Dispatch ID", type: "text", values: [] },
      ],
      optionalFields: [
        { name: "Review Capacity Cost", type: "number", values: [] },
      ],
      recommendedViews: ["Intake", "Validation"],
    },
  };
}

test("dry-run reports which canonical labels would be created", async () => {
  const config = makeConfig();
  const report = await createGitHubBootstrapReport(config, {
    gh: { available: true, version: "2.70.0", authenticated: true },
    existingLabels: [{ name: "bug", ...DEFAULT_LABEL_DEFINITIONS.bug }],
    templatePresent: true,
  });

  assert.equal(report.mode, "dry-run");
  assert.deepEqual(
    report.createCommands.map((command) => command.label.name),
    ["enhancement", "needs-triage", "ready-for-agent"],
  );
  assert.match(report.text, /Mode: dry-run/);
  assert.match(report.text, /would create: enhancement/);
  assert.match(report.text, /would create: needs-triage/);
  assert.match(report.text, /would create: ready-for-agent/);
});

test("apply mode creates only missing canonical labels", async () => {
  const config = makeConfig();
  const runnerCalls = [];
  const report = await createGitHubBootstrapReport(config, {
    apply: true,
    existingLabels: [
      { name: "bug", ...DEFAULT_LABEL_DEFINITIONS.bug },
      { name: "enhancement", ...DEFAULT_LABEL_DEFINITIONS.enhancement },
    ],
    runner: async (command, args, label) => {
      runnerCalls.push({ command, args, label });
      return { code: 0, stdout: `created ${label.name}`, stderr: "" };
    },
  });

  assert.equal(report.mode, "apply");
  assert.deepEqual(
    runnerCalls.map((call) => call.label.name),
    ["needs-triage", "ready-for-agent"],
  );
  assert.deepEqual(runnerCalls[0].args, [
    "label",
    "create",
    "needs-triage",
    "--color",
    DEFAULT_LABEL_DEFINITIONS["needs-triage"].color,
    "--description",
    DEFAULT_LABEL_DEFINITIONS["needs-triage"].description,
  ]);
  assert.match(report.text, /Mode: apply/);
  assert.match(report.text, /created: needs-triage/);
  assert.match(report.text, /created: ready-for-agent/);
  assert.doesNotMatch(report.text, /created: bug/);
});

test("label color and description mismatches are reported as Tracker Drift without planning mutation", async () => {
  const config = makeConfig();
  const canonical = buildCanonicalLabelDefinitions(config);
  const report = await createGitHubBootstrapReport(config, {
    existingLabels: canonical.map((label) =>
      label.name === "needs-triage"
        ? { ...label, color: "000000", description: "Wrong description." }
        : label,
    ),
  });

  const driftEntry = report.labelInspection.find((label) => label.name === "needs-triage");
  assert.equal(driftEntry.status, "drift");
  assert.equal(report.createCommands.length, 0);
  assert.match(report.text, /Tracker Drift: needs-triage/);
  assert.match(report.text, /color expected "fbca04" actual "000000"/);
  assert.match(report.text, /description expected "Maintainer needs to evaluate\." actual "Wrong description\."/);
  assert.doesNotMatch(report.text, /would create: needs-triage/);
});

test("project field inspection plans missing configured fields and reports Project view drift", async () => {
  const config = makeConfig();
  const report = await createGitHubBootstrapReport(config, {
    existingLabels: buildCanonicalLabelDefinitions(config),
    existingProjectFields: [
      { name: "Execution Stage", type: "ProjectV2SingleSelectField", options: [{ name: "Inbox" }, { name: "Done" }] },
    ],
    existingProjectViews: [
      { name: "Intake", layout: "TABLE_LAYOUT", number: 1 },
      { name: " Validation", layout: "TABLE_LAYOUT", number: 2 },
    ],
  });

  assert.match(report.text, /## Required Project Fields/);
  assert.match(report.text, /Execution Stage: Inbox, Done/);
  assert.match(report.text, /Dispatch ID: text/);
  assert.match(report.text, /## Project Field Inspection/);
  assert.match(report.text, /present: Execution Stage/);
  assert.match(report.text, /missing: Dispatch ID \(TEXT\)/);
  assert.match(report.text, /missing: Review Capacity Cost \(NUMBER\)/);
  assert.match(report.text, /would create with --create-project-fields: Dispatch ID/);
  assert.match(report.text, /would create with --create-project-fields: Review Capacity Cost/);
  assert.match(report.text, /## Recommended Project Views/);
  assert.match(report.text, /- Intake/);
  assert.match(report.text, /- Validation/);
  assert.match(report.text, /## Project View Inspection/);
  assert.match(report.text, /present: Intake \(TABLE_LAYOUT\)/);
  assert.match(report.text, /Project View Drift: Validation \(name expected "Validation" actual " Validation"\)/);
  assert.equal(report.projectViewInspection.find((view) => view.name === "Validation").status, "drift");
  assert.match(report.text, /## Planned Project View Changes/);
  assert.match(report.text, /No automatic Project view changes are available through GitHub CLI\/GraphQL/);
});

test("apply mode creates missing Project fields only with the explicit project-field flag", async () => {
  const config = makeConfig();
  const projectCalls = [];
  const report = await createGitHubBootstrapReport(config, {
    apply: true,
    createProjectFields: true,
    existingLabels: buildCanonicalLabelDefinitions(config),
    existingProjectFields: [
      { name: "Execution Stage", type: "ProjectV2SingleSelectField", options: [{ name: "Inbox" }, { name: "Done" }] },
    ],
    projectFieldRunner: async (command, args, field) => {
      projectCalls.push({ command, args, field });
      return { code: 0, stdout: `created ${field.name}`, stderr: "" };
    },
  });

  assert.deepEqual(
    projectCalls.map((call) => call.field.name),
    ["Dispatch ID", "Review Capacity Cost"],
  );
  assert.deepEqual(projectCalls[0].args, [
    "project",
    "field-create",
    "7",
    "--owner",
    "example",
    "--name",
    "Dispatch ID",
    "--data-type",
    "TEXT",
    "--format",
    "json",
  ]);
  assert.deepEqual(projectCalls[1].args, [
    "project",
    "field-create",
    "7",
    "--owner",
    "example",
    "--name",
    "Review Capacity Cost",
    "--data-type",
    "NUMBER",
    "--format",
    "json",
  ]);
  assert.match(report.text, /Project Field Apply Results/);
  assert.match(report.text, /created: Dispatch ID/);
  assert.match(report.text, /created: Review Capacity Cost/);
});

test("Project field drift plans only supported single-select option rename updates", () => {
  const config = makeConfig();
  const inspection = inspectProjectFields(config.projectSchema.requiredFields, [
    {
      id: "field-1",
      name: "Execution Stage",
      type: "ProjectV2SingleSelectField",
      options: [
        { id: "option-1", name: "Inbox", color: "GRAY", description: "" },
        { id: "option-2", name: "done", color: "BLUE", description: "finished" },
      ],
    },
    { name: "Dispatch ID", type: "ProjectV2Field" },
  ]);
  const plans = planProjectFieldUpdateCommands(inspection);

  assert.equal(inspection[0].status, "drift");
  assert.equal(inspection[0].drift[0].field, "options");
  assert.match(inspection[0].drift[0].expected, /Inbox, Done/);
  assert.match(inspection[0].drift[0].actual, /Inbox, done/);
  assert.equal(inspection[1].status, "present");
  assert.equal(plans.length, 1);
  assert.equal(plans[0].supported, true);
  assert.equal(plans[0].mutation.variables.fieldId, "field-1");
  assert.deepEqual(plans[0].mutation.variables.singleSelectOptions, [
    { id: "option-1", name: "Inbox", color: "GRAY", description: "" },
    { id: "option-2", name: "Done", color: "BLUE", description: "finished" },
  ]);
});

test("Project field drift with unmatched options remains manual", () => {
  const config = makeConfig();
  const inspection = inspectProjectFields(config.projectSchema.requiredFields, [
    {
      id: "field-1",
      name: "Execution Stage",
      type: "ProjectV2SingleSelectField",
      options: [
        { id: "option-1", name: "Inbox", color: "GRAY", description: "" },
        { id: "option-2", name: "Ready", color: "BLUE", description: "" },
      ],
    },
  ]);
  const plans = planProjectFieldUpdateCommands(inspection);

  assert.equal(inspection[0].status, "drift");
  assert.equal(plans.length, 1);
  assert.equal(plans[0].supported, false);
  assert.match(plans[0].reason, /one-to-one single-select option rename drift/);
});

test("apply mode updates supported Project field drift only with the explicit update flag", async () => {
  const config = makeConfig();
  const updateCalls = [];
  const report = await createGitHubBootstrapReport(config, {
    apply: true,
    updateProjectFields: true,
    existingLabels: buildCanonicalLabelDefinitions(config),
    existingProjectFields: [
      {
        id: "field-1",
        name: "Execution Stage",
        type: "ProjectV2SingleSelectField",
        options: [
          { id: "option-1", name: "Inbox", color: "GRAY", description: "" },
          { id: "option-2", name: "done", color: "BLUE", description: "finished" },
        ],
      },
      { name: "Dispatch ID", type: "ProjectV2Field" },
      { name: "Review Capacity Cost", type: "ProjectV2Field" },
    ],
    projectFieldUpdateRunner: async (command, args, field, planned) => {
      updateCalls.push({ command, args, field, planned });
      return { code: 0, stdout: `updated ${field.name}`, stderr: "" };
    },
  });

  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0].args, ["api", "graphql"]);
  assert.equal(updateCalls[0].planned.mutation.variables.fieldId, "field-1");
  assert.match(report.text, /Project Field Update Results/);
  assert.match(report.text, /updated: Execution Stage/);
});

test("Project view inspection detects exact-name misses and whitespace drift", () => {
  const inspection = inspectProjectViews(["Intake", "Validation", "Done"], [
    { name: "Intake", layout: "TABLE_LAYOUT", number: 1 },
    { name: " Validation", layout: "TABLE_LAYOUT", number: 2 },
  ]);

  assert.equal(inspection[0].status, "present");
  assert.equal(inspection[1].status, "drift");
  assert.equal(inspection[1].drift[0].field, "name");
  assert.equal(inspection[1].drift[0].actual, " Validation");
  assert.equal(inspection[2].status, "missing");
});

test("Project view mutation capability is derived from live GraphQL mutation names", () => {
  const unavailable = inspectProjectViewMutationCapability([
    "createProjectV2",
    "createProjectV2Field",
    "updateProjectV2ItemFieldValue",
    "markFileAsViewed",
  ]);

  assert.equal(unavailable.inspected, true);
  assert.equal(unavailable.view_mutations_available, false);
  assert.deepEqual(unavailable.matching_mutations, []);
  assert.match(unavailable.reason, /not ProjectV2 view create\/update\/rename mutations/);

  const available = inspectProjectViewMutationCapability([
    "createProjectV2View",
    "updateProjectV2View",
    "deleteProjectV2Field",
  ]);

  assert.equal(available.inspected, true);
  assert.equal(available.view_mutations_available, true);
  assert.deepEqual(available.matching_mutations, ["createProjectV2View", "updateProjectV2View"]);
  assert.match(available.reason, /candidate ProjectV2 view mutations/);
});

test("Project view plan converts inspection gaps into a prepared human step", () => {
  const inspection = inspectProjectViews(["Intake", "Validation", "Done"], [
    { name: "Intake", layout: "TABLE_LAYOUT", number: 1 },
    { name: " Validation", layout: "TABLE_LAYOUT", number: 2 },
  ]);
  const plan = buildProjectViewPlan({
    repository: {
      owner: "example",
      repo: "repo",
      projectNumber: "7",
    },
    projectViews: ["Intake", "Validation", "Done"],
    projectViewInspection: inspection,
    generatedAt: "2026-06-25T00:00:00.000Z",
  });
  const markdown = renderProjectViewPlanMarkdown(plan);

  assert.equal(plan.api_status.view_mutations_available, false);
  assert.equal(plan.summary.present, 1);
  assert.equal(plan.summary.missing, 1);
  assert.equal(plan.summary.drift, 1);
  assert.deepEqual(
    plan.actions.map((action) => action.type),
    ["manual_create_view", "manual_rename_view"],
  );
  assert.match(markdown, /Create Project view: Done \(TABLE_LAYOUT\)/);
  assert.match(markdown, /Rename Project view #2:  Validation -> Validation/);
  assert.match(markdown, /Schema inspected: no/);
  assert.match(markdown, /Matching mutations: none/);
  assert.match(markdown, /Command: `pnpm ops github:init`/);
  assert.match(markdown, /template_project_copy/);
});

test("Project creation is planned for fresh setups without a project reference", async () => {
  const config = makeConfig();
  config.github.projectNumber = "";
  const report = await createGitHubBootstrapReport(config, {
    existingLabels: buildCanonicalLabelDefinitions(config),
    createProject: true,
    projectTitle: "Fresh Project",
  });

  assert.deepEqual(planProjectCreateCommand({ owner: "example", title: "Fresh Project" }).args, [
    "project",
    "create",
    "--owner",
    "example",
    "--title",
    "Fresh Project",
    "--format",
    "json",
  ]);
  assert.match(report.text, /Project Creation/);
  assert.match(report.text, /would create: Fresh Project for example/);
  assert.match(report.text, /would create with --create-project-fields: Execution Stage/);
});

test("apply mode can create a fresh Project and then create fields on that Project number", async () => {
  const config = makeConfig();
  config.github.projectNumber = "";
  const projectCalls = [];
  const projectFieldCalls = [];
  const report = await createGitHubBootstrapReport(config, {
    apply: true,
    createProject: true,
    createProjectFields: true,
    projectTitle: "Fresh Project",
    existingLabels: buildCanonicalLabelDefinitions(config),
    projectRunner: async (command, args, project) => {
      projectCalls.push({ command, args, project });
      return {
        code: 0,
        stdout: JSON.stringify({ number: 9, url: "https://github.com/users/example/projects/9", title: "Fresh Project" }),
        stderr: "",
      };
    },
    projectFieldRunner: async (command, args, field) => {
      projectFieldCalls.push({ command, args, field });
      return { code: 0, stdout: `created ${field.name}`, stderr: "" };
    },
  });

  assert.deepEqual(projectCalls.map((call) => call.project.title), ["Fresh Project"]);
  assert.equal(projectFieldCalls.length, 3);
  assert.deepEqual(projectFieldCalls.map((call) => call.args[2]), ["9", "9", "9"]);
  assert.match(report.text, /Project Create Results/);
  assert.match(report.text, /created: Fresh Project/);
  assert.match(report.text, /number: 9/);
  assert.match(report.text, /created: Execution Stage/);
  assert.match(report.text, /created: Dispatch ID/);
  assert.match(report.text, /created: Review Capacity Cost/);
});
