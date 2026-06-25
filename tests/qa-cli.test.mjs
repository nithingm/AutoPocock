import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const qaScript = path.join(repoRoot, "scripts", "qa.mjs");

async function makeWorkspace() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "autopocock-qa-"));
  await mkdir(path.join(dir, "docs", "agents", "handoffs"), { recursive: true });
  await mkdir(path.join(dir, "docs", "agents", "completions"), { recursive: true });
  await mkdir(path.join(dir, "docs", "agents", "reviews"), { recursive: true });
  await mkdir(path.join(dir, "docs", "QA"), { recursive: true });
  return dir;
}

async function runQa(cwd, args) {
  try {
    const result = await execFileAsync(process.execPath, [qaScript, ...args], {
      cwd,
      windowsHide: true,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code || 1,
      stdout: error.stdout || "",
      stderr: error.stderr || error.message,
    };
  }
}

test("strict targeted QA writes a checklist and fails when required context is missing", async () => {
  const cwd = await makeWorkspace();

  const result = await runQa(cwd, ["--issue", "7", "--pr", "77"]);
  const outputPath = result.stdout.trim();
  const checklist = await readFile(outputPath, "utf8");

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Missing required Handoff Artifact/);
  assert.match(result.stderr, /Missing required Completion Report/);
  assert.match(checklist, /## Targeted QA Context/);
  assert.match(checklist, /QA status: fail/);
});

test("strict targeted QA warns on missing review prep and fails with needs-slicing when scope is unclear", async () => {
  const cwd = await makeWorkspace();
  await writeFile(
    path.join(cwd, "docs", "agents", "handoffs", "2026-05-14-7-slice.md"),
    `# Context Handoff

## Goal

- TBD
`,
  );
  await writeFile(
    path.join(cwd, "docs", "agents", "completions", "2026-05-14-7-slice.md"),
    `# Completion Report

## Changes

- Files or areas changed: scripts/qa.mjs
`,
  );

  const result = await runQa(cwd, ["--issue", "7", "--pr", "77"]);
  const checklist = await readFile(result.stdout.trim(), "utf8");

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /needs targeted QA|strict QA|placeholder language/i);
  assert.match(checklist, /Missing Review Prep artifact\./);
  assert.match(checklist, /QA status: needs-slicing/);
});

test("manual targeted QA stays permissive and records warnings in the generated checklist", async () => {
  const cwd = await makeWorkspace();

  const result = await runQa(cwd, ["--issue", "draft", "--pr", "draft", "--manual"]);
  const checklist = await readFile(result.stdout.trim(), "utf8");

  assert.equal(result.code, 0);
  assert.match(checklist, /Mode: manual-targeted/);
  assert.match(checklist, /Manual mode bypassed strict issue identifier validation\./);
  assert.match(checklist, /Missing required Handoff Artifact/);
});

test("strict targeted QA does not match unrelated artifacts by loose substring", async () => {
  const cwd = await makeWorkspace();
  await writeFile(
    path.join(cwd, "docs", "agents", "handoffs", "2026-05-14-123-foreign.md"),
    `# Context Handoff

## Issue

- Tracker: #123
`,
  );
  await writeFile(
    path.join(cwd, "docs", "agents", "completions", "2026-05-14-123-foreign.md"),
    `# Completion Report

## Issue

- Tracker: #123
`,
  );
  await writeFile(
    path.join(cwd, "docs", "agents", "reviews", "2026-05-14-123-foreign.md"),
    `# Review Prep
`,
  );

  const result = await runQa(cwd, ["--issue", "4", "--pr", "40"]);
  const checklist = await readFile(result.stdout.trim(), "utf8");

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Missing required Handoff Artifact/);
  assert.match(result.stderr, /Missing required Completion Report/);
  assert.doesNotMatch(checklist, /123-foreign/);
  assert.match(checklist, /- Handoff: missing/);
  assert.match(checklist, /- Completion report: missing/);
  assert.match(checklist, /### Found Artifacts\r?\n\r?\n- None/);
});
