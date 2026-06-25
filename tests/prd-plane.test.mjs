import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { renderPrdTightnessReport, validatePrdTightness } from "../scripts/lib/prd-plane.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const issuesScript = path.join(repoRoot, "scripts", "issues.mjs");

function strongPrdMarkdown() {
  return `# DAG Execution Planning

## Approval

- Status: approved
- Approved by: solo-operator
- Approved at: 2026-05-14T21:00:00.000Z
- Source context: docs/agents/contexts/2026-05-14-dag-execution-planning.md
- Source context status: approved

## Problem

- The repo needs a planning gate before issue DAG generation.

## User Value

- Technical solo builders can trust issue generation to stop on weak plans instead of compiling optimistic garbage.

## Scope

- In scope: validate PRD tightness before DAG compilation.
- Out of scope: redesign the DAG compiler itself.

## Acceptance Criteria

- [ ] Refuse PRDs that lack a concrete user outcome or explicit scope boundaries.
- [ ] Refuse PRDs with non-testable decomposition input such as missing acceptance criteria.
- [ ] Persist a validation artifact that explains how to tighten the PRD before retrying.

## Constraints

- Technical constraints: Reuse the current ops CLI and artifact conventions.
- Product constraints: Keep user approval as a separate gate from structural validation.
- Operational constraints: Do not compile the DAG when validation fails.

## Notes For Issue Decomposition

- This is a code-specific repo workflow change inside scripts/issues.mjs and scripts/lib/prd-plane.mjs.
- The first slice should prove one valid PRD and one invalid PRD path end to end.
`;
}

function weakPrdMarkdown() {
  return `# Weak Planner

## Approval

- Status: approved
- Approved by: solo-operator
- Approved at: 2026-05-14T21:00:00.000Z
- Source context:
- Source context status:

## Problem

- Refactor the repo and API somehow.

## User Value

- Desired meaning or outcome: TBD

## Scope

- In scope: the shared auth contract.
- Out of scope: the shared auth contract.

## Acceptance Criteria

None captured.

## Constraints

- Technical constraints: Must use the existing shared schema.
- Product constraints: Must not use the existing shared schema.
`;
}

test("validatePrdTightness accepts PRDs with concrete outcome, scope, and tracer-bullet viability", () => {
  const result = validatePrdTightness(strongPrdMarkdown(), "docs/PRDs/2026-05-14-dag-execution-planning.md");

  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
  assert.equal(result.checks.concrete_user_outcome, "pass");
  assert.equal(result.checks.acceptance_criteria, "pass");
  assert.equal(result.checks.scope_boundaries, "pass");
  assert.equal(result.checks.tracer_bullet_viability, "pass");
  assert.equal(result.checks.code_context, "pass");
  assert.match(renderPrdTightnessReport(result), /Status: pass/);
});

test("validatePrdTightness reports actionable failure reasons for weak PRDs", () => {
  const result = validatePrdTightness(weakPrdMarkdown(), "docs/PRDs/2026-05-14-weak-planner.md");

  assert.equal(result.ok, false);
  assert.match(result.failures.join("\n"), /concrete user outcome/i);
  assert.match(result.failures.join("\n"), /testable acceptance criteria/i);
  assert.match(result.failures.join("\n"), /scope boundaries/i);
  assert.match(result.failures.join("\n"), /contradictory constraints/i);
  assert.match(result.failures.join("\n"), /repo or domain context/i);

  const markdown = renderPrdTightnessReport(result);
  assert.match(markdown, /## Failures/);
  assert.match(markdown, /Clarify the user-visible outcome/);
  assert.match(markdown, /Add at least one checklist-style acceptance criterion/);
});

test("issues.mjs refuses weak PRDs and writes a durable validation artifact", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "autopocock-prd-tightness-"));
  const prdDir = path.join(cwd, "docs", "PRDs");
  await mkdir(prdDir, { recursive: true });
  const prdPath = path.join(prdDir, "2026-05-14-weak-planner.md");
  await writeFile(prdPath, weakPrdMarkdown(), "utf8");

  await assert.rejects(
    execFileAsync(process.execPath, [issuesScript, "--prd", prdPath], {
      cwd,
      windowsHide: true,
    }),
    (error) => {
      assert.match(error.stderr, /PRD tightness validation failed/i);
      assert.match(error.stderr, /planning-validations/);
      assert.match(error.stderr, /concrete user outcome/i);
      assert.match(error.stderr, /testable acceptance criteria/i);
      return true;
    },
  );

  const validationDir = path.join(cwd, "docs", "agents", "planning-validations");
  const artifacts = await readdir(validationDir);
  const markdownPath = path.join(validationDir, artifacts.find((entry) => entry.endsWith(".md")));
  const jsonPath = path.join(validationDir, artifacts.find((entry) => entry.endsWith(".json")));
  const markdown = await readFile(markdownPath, "utf8");
  const json = JSON.parse(await readFile(jsonPath, "utf8"));

  assert.ok((await stat(markdownPath)).isFile());
  assert.ok((await stat(jsonPath)).isFile());
  assert.match(markdown, /# PRD Tightness Validation/);
  assert.match(markdown, /Status: fail/);
  assert.equal(json.ok, false);
  assert.ok(Array.isArray(json.failures));
  assert.ok(json.failures.length >= 1);
});
