import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");
const opsScript = path.join(repoRoot, "scripts", "ops.mjs");

async function makeWorkspace(config = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "autopocock-"));
  await mkdir(path.join(dir, ".ai"), { recursive: true });
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
          ...(config.github || {}),
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
        ...(config.root || {}),
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

test("github:export refuses to run without a project reference", async () => {
  const cwd = await makeWorkspace();
  const result = await runOps(cwd, ["github:export"]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /GitHub project reference is required/);
});

test("github:export writes a non-Done queue snapshot from an input fixture", async () => {
  const cwd = await makeWorkspace();
  const inputPath = path.join(cwd, "project-items.json");
  const outputPath = path.join(cwd, ".ai", "queue.json");
  await writeFile(
    inputPath,
    `${JSON.stringify(
      {
        items: [
          {
            content: {
              number: 1,
              url: "https://github.com/example/repo/issues/1",
              title: "Ready slice",
              labels: [{ name: "enhancement" }, { name: "ready-for-agent" }],
              updatedAt: "2026-05-14T00:00:00Z",
            },
            fieldValues: [
              { field: { name: "Execution Stage" }, value: { name: "Ready for Handoff" } },
              { field: { name: "Execution Lane" }, value: { name: "Handoff" } },
              { field: { name: "Queue Class" }, value: { name: "tracer-bullet" } },
              { field: { name: "Risk" }, value: { name: "low" } },
              { field: { name: "Dependency" }, value: { name: "unblocked" } },
              { field: { name: "Conflict Surface" }, value: { name: "low" } },
              { field: { name: "Feature Track" }, text: "github-workflow" },
            ],
          },
          {
            content: {
              number: 2,
              url: "https://github.com/example/repo/issues/2",
              title: "Completed slice",
              labels: [{ name: "enhancement" }],
            },
            fieldValues: [{ field: { name: "Execution Stage" }, value: { name: "Done" } }],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["github:export", "--input", inputPath, "--output", outputPath]);
  const queue = JSON.parse(await readFile(outputPath, "utf8"));

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Exported 1 non-Done item/);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, "#1");
  assert.equal(queue[0].stage, "Ready for Handoff");
  assert.equal(queue[0].queueClass, "tracer-bullet");
  assert.deepEqual(queue[0].labels, ["enhancement", "ready-for-agent"]);
});

test("run refuses dispatch artifacts that are not claimed", async () => {
  const cwd = await makeWorkspace();
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        status: "queued",
        forbidden_actions: ["merge PR"],
        expected_branch: "agent/test",
        isolation_mode: "branch",
        handoff_artifact: "",
        completion_report_target: "docs/agents/completions/dispatch-test.md",
        claim: null,
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["run", "--dispatch", dispatchPath]);

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /is queued, not claimed/);
});

test("run validates a claimed dispatch without invoking a provider", async () => {
  const cwd = await makeWorkspace();
  const dispatchPath = path.join(cwd, "docs", "agents", "dispatches", "dispatch-test.json");
  await writeFile(
    dispatchPath,
    `${JSON.stringify(
      {
        dispatch_id: "dispatch-test",
        status: "claimed",
        forbidden_actions: ["merge PR", "handle secrets"],
        expected_branch: "agent/test",
        isolation_mode: "worktree",
        handoff_artifact: "docs/agents/handoffs/test.md",
        completion_report_target: "docs/agents/completions/dispatch-test.md",
        claim: {
          claimed_by: "test-runner",
          claimed_at: "2026-05-14T00:00:00.000Z",
          isolation_mode: "worktree",
        },
      },
      null,
      2,
    )}\n`,
  );

  const result = await runOps(cwd, ["run", "--dispatch", dispatchPath]);

  assert.equal(result.code, 0);
  assert.match(result.stdout, /Runner Plan/);
  assert.match(result.stdout, /Dispatch: dispatch-test/);
  assert.match(result.stdout, /No provider was invoked/);
});
