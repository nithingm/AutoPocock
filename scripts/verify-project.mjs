import { spawn } from "node:child_process";
import {
  combinedOutput,
  summarizeProjectVerification,
} from "./lib/project-verifier.mjs";

const strictExternal = process.argv.includes("--strict-external");

function runCommand(label, command, args = []) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      shell: process.platform === "win32",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        label,
        command: [command, ...args].join(" "),
        status: "failed",
        exitCode: 1,
        stdout,
        stderr: `${stderr}${error.message}`,
      });
    });
    child.on("close", (exitCode) => {
      resolve({
        label,
        command: [command, ...args].join(" "),
        status: exitCode === 0 ? "passed" : "failed",
        exitCode,
        stdout,
        stderr,
      });
    });
  });
}

function oneLine(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function printResult(result) {
  const status = result.status === "passed" ? "PASS" : "FAIL";
  process.stdout.write(`- ${status}: ${result.label} (${result.command})\n`);
  if (result.status !== "passed") {
    const detail = oneLine(combinedOutput(result));
    if (detail) {
      process.stdout.write(`  detail: ${detail.slice(0, 500)}\n`);
    }
  }
}

const checks = [
  await runCommand("setup readiness", "pnpm", ["ops", "setup"]),
  await runCommand("full test suite", "pnpm", ["test"]),
  await runCommand("workflow console smoke", "pnpm", ["smoke:console"]),
  await runCommand("GitHub auth status", "gh", ["auth", "status"]),
  await runCommand("GitHub Project export/read path for #45", "pnpm", ["ops", "github:export", "--", "--issue", "45"]),
  await runCommand("GitHub issue #45 state", "gh", ["issue", "view", "45", "--json", "state"]),
];

process.stdout.write("# Project Verification\n\n");
for (const result of checks) {
  printResult(result);
}

const summary = summarizeProjectVerification({ checks, issue: "45", strictExternal });

process.stdout.write("\n## Summary\n\n");

if (summary.localFailures.length === 0) {
  process.stdout.write("- Local readiness: passed\n");
} else {
  process.stdout.write(`- Local readiness: failed (${summary.localFailures.length} check(s))\n`);
}

if (summary.externalFailures.length === 0 && summary.projectReadReady) {
  process.stdout.write("- GitHub Project read path: passed\n");
} else {
  process.stdout.write("- GitHub Project read path: failed or not authenticated\n");
}

if (summary.projectWriteReady) {
  process.stdout.write("- GitHub Project write scope: present\n");
} else {
  process.stdout.write("- GitHub Project write scope: missing; run `gh auth refresh -s project`\n");
}

if (summary.requestedIssueVisible) {
  process.stdout.write("- Issue #45 Project visibility: present\n");
} else if (summary.requestedIssueAbsent && summary.requestedIssueClosed) {
  process.stdout.write("- Issue #45 terminal state: closed and absent from active Project queue\n");
} else if (summary.requestedIssueAbsent) {
  process.stdout.write("- Issue #45 Project visibility: absent from configured Project export and not confirmed closed\n");
} else {
  process.stdout.write("- Issue #45 Project visibility: unknown\n");
}

process.stdout.write(`\n${summary.finalLine}\n`);
process.exitCode = summary.exitCode;
