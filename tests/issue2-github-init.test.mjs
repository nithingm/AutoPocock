import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_LABEL_DEFINITIONS,
  buildCanonicalLabelDefinitions,
  createGitHubBootstrapReport,
  inspectProjectFields,
  planProjectCreateCommand,
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

test("project field inspection plans missing configured fields while views remain report-only", async () => {
  const config = makeConfig();
  const report = await createGitHubBootstrapReport(config, {
    existingLabels: buildCanonicalLabelDefinitions(config),
    existingProjectFields: [
      { name: "Execution Stage", type: "ProjectV2SingleSelectField", options: [{ name: "Inbox" }, { name: "Done" }] },
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
  assert.match(report.text, /Project views are still report-only because the GitHub CLI does not expose view creation/);
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

test("Project field drift is reported instead of mutated", () => {
  const config = makeConfig();
  const inspection = inspectProjectFields(config.projectSchema.requiredFields, [
    { name: "Execution Stage", type: "ProjectV2SingleSelectField", options: [{ name: "Inbox" }, { name: "Ready" }] },
    { name: "Dispatch ID", type: "ProjectV2Field" },
  ]);

  assert.equal(inspection[0].status, "drift");
  assert.equal(inspection[0].drift[0].field, "options");
  assert.match(inspection[0].drift[0].expected, /Inbox, Done/);
  assert.match(inspection[0].drift[0].actual, /Inbox, Ready/);
  assert.equal(inspection[1].status, "present");
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
