import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { commandCandidatesForPlatform, detectHostEnvironment, detectShell, resolveRepoPath } from "../scripts/lib/runtime-host.mjs";

test("runtime host detects Windows shell and path conventions without shell-specific workflow assumptions", () => {
  assert.equal(detectShell({ PSModulePath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules" }, "win32"), "powershell");
  const host = detectHostEnvironment({
    cwd: "D:\\Projects\\AutoPocock",
    env: { PSModulePath: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules" },
    platform: "win32",
    execPath: "C:\\Program Files\\nodejs\\node.exe",
  });

  assert.equal(host.os, "windows");
  assert.equal(host.platform, "win32");
  assert.equal(host.shell, "powershell");
  assert.equal(host.path_separator, "\\");
});

test("runtime host detects Linux shell and resolves repo-relative paths centrally", () => {
  assert.equal(detectShell({ SHELL: "/bin/bash" }, "linux"), "/bin/bash");
  const host = detectHostEnvironment({
    cwd: "/workspaces/autopocock",
    env: { SHELL: "/bin/bash" },
    platform: "linux",
    execPath: "/usr/bin/node",
  });

  assert.equal(host.os, "linux");
  assert.equal(host.shell, "/bin/bash");
  assert.equal(resolveRepoPath("/workspaces/autopocock", "docs/PRDs"), path.join("/workspaces/autopocock", "docs/PRDs"));
});

test("runtime host expands bare Windows commands to shim candidates", () => {
  assert.deepEqual(commandCandidatesForPlatform("pnpm", "win32"), ["pnpm.cmd", "pnpm.exe", "pnpm.bat", "pnpm"]);
  assert.deepEqual(commandCandidatesForPlatform("gh", "win32"), ["gh.cmd", "gh.exe", "gh.bat", "gh"]);
  assert.deepEqual(commandCandidatesForPlatform("C:\\Program Files\\nodejs\\node.exe", "win32"), ["C:\\Program Files\\nodejs\\node.exe"]);
  assert.deepEqual(commandCandidatesForPlatform("pnpm", "linux"), ["pnpm"]);
});
