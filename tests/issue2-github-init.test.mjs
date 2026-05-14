import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_LABEL_DEFINITIONS,
  buildCanonicalLabelDefinitions,
  createGitHubBootstrapReport,
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

test("project fields and views remain report-only in bootstrap output", async () => {
  const config = makeConfig();
  const report = await createGitHubBootstrapReport(config, {
    existingLabels: buildCanonicalLabelDefinitions(config),
  });

  assert.match(report.text, /## Required Project Fields/);
  assert.match(report.text, /Execution Stage: Inbox, Done/);
  assert.match(report.text, /Dispatch ID: text/);
  assert.match(report.text, /## Recommended Project Views/);
  assert.match(report.text, /- Intake/);
  assert.match(report.text, /- Validation/);
  assert.match(report.text, /Project fields and views are report-only in this bootstrap module/);
});
