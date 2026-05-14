import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const opsScript = path.join(repoRoot, "scripts", "ops.mjs");

async function makeWorkspace(config = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "autopocock-issue9-"));
  await mkdir(path.join(dir, ".ai"), { recursive: true });
  await mkdir(path.join(dir, "docs", "agents", "completions"), { recursive: true });
  await mkdir(path.join(dir, "docs", "agents", "dispatches"), { recursive: true });
  await writeFile(
    path.join(dir, ".ai", "ops.config.json"),
    `${JSON.stringify(
      {
        tracker: "github",
        github: {
          owner: "",
          repo: "",
          projectUrl: "",
          projectId: "",
          projectNumber: "",
        },
        labels: {
          category: ["bug", "enhancement"],
          state: ["needs-triage", "ready-for-agent"],
        },
        projectSchema: {
          requiredFields: [],
          recommendedViews: [],
        },
        queueFile: ".ai/queue.json",
        ...config,
      },
      null,
      2,
    )}\n`,
  );
  return dir;
}

async function runOps(cwd, args) {
  try {
    const result = await execFileAsync(process.execPath, [opsScript, ...args], {
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

test("schedule suggests exact queue recovery commands when the queue file is missing", async () => {
  const cwd = await makeWorkspace();

  const result = await runOps(cwd, ["schedule", "--queue", ".ai/missing-queue.json", "--dispatch"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Queue file not found: \.ai\/missing-queue\.json\./);
  assert.match(result.stderr, /pnpm ops github:export -- --output \.ai\/missing-queue\.json/);
  assert.match(result.stderr, /pnpm ops schedule -- --queue \.ai\/queue\.example\.json/);
});

test("run suggests an exact dispatch recovery command when the dispatch artifact is missing", async () => {
  const cwd = await makeWorkspace();
  const dispatchPath = "docs/agents/dispatches/missing-dispatch.json";

  const result = await runOps(cwd, ["run", "--dispatch", dispatchPath]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Dispatch artifact not found: docs\/agents\/dispatches\/missing-dispatch\.json\./);
  assert.match(result.stderr, /pnpm ops schedule -- --queue \.ai\/queue\.json --dispatch/);
});

test("review-prep suggests an exact completion recovery command when the completion artifact is missing", async () => {
  const cwd = await makeWorkspace();
  const completionPath = path.join(cwd, "docs", "agents", "completions", "issue-6-missing.md");

  const result = await runOps(cwd, ["review-prep", "--issue", "6", "--completion", completionPath]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Completion artifact not found: .+issue-6-missing\.md\./);
  assert.match(result.stderr, /pnpm ops complete -- --issue 6 --status \"needs human review\"/);
});
