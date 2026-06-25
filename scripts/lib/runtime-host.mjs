import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const INIT_STRUCTURE_DIRS = [
  "docs/PRDs",
  "docs/QA",
  "docs/adr",
  "docs/agents/contexts",
  "docs/agents/handoffs",
  "docs/agents/hitl",
  "docs/agents/completions",
  "docs/agents/reviews",
  "docs/agents/loop-specs",
  "docs/agents/memory-proposals",
  "docs/agents/feedback",
  "docs/agents/schedules",
  "docs/agents/dispatches",
  ".ai/provider-runs",
  "issues",
  ".github/ISSUE_TEMPLATE",
  ".ai/prompts",
  ".ai/memory",
  "skills/engineering/agentic-ops",
  "skills/engineering/subagent-handoff",
];

export function resolveRepoPath(cwd, target) {
  return path.isAbsolute(target) ? target : path.join(cwd, target);
}

export async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDirectories(cwd, dirs = INIT_STRUCTURE_DIRS) {
  await Promise.all(dirs.map((dir) => mkdir(resolveRepoPath(cwd, dir), { recursive: true })));
}

export async function ensureWorktreePath(worktreePath) {
  await mkdir(worktreePath, { recursive: true });
  return worktreePath;
}

export async function runCommand(command, args = [], options = {}) {
  return execFileAsync(command, args, {
    cwd: options.cwd,
    windowsHide: true,
    maxBuffer: options.maxBuffer ?? 1024 * 1024,
    env: options.env ?? process.env,
  });
}

function quoteCmdPart(value) {
  const text = String(value);
  if (!/[\s&()^|<>"]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '\\"')}"`;
}

async function runCommandAvailabilityCandidate(command, args = [], options = {}) {
  const platform = options.platform ?? process.platform;
  const extension = path.extname(command).toLowerCase();

  if (platform === "win32" && [".cmd", ".bat"].includes(extension)) {
    const shell = options.env?.ComSpec || process.env.ComSpec || "cmd.exe";
    const commandLine = [command, ...args].map(quoteCmdPart).join(" ");
    return execFileAsync(shell, ["/d", "/s", "/c", commandLine], {
      cwd: options.cwd,
      windowsHide: true,
      maxBuffer: options.maxBuffer ?? 1024 * 1024,
      env: options.env ?? process.env,
    });
  }

  return runCommand(command, args, options);
}

export function commandCandidatesForPlatform(command, platform = process.platform) {
  const commandText = String(command || "");
  const isBareCommand = commandText && !path.isAbsolute(commandText) && !/[\\/]/.test(commandText) && !path.extname(commandText);

  if (platform !== "win32" || !isBareCommand) {
    return [commandText];
  }

  return [`${commandText}.cmd`, `${commandText}.exe`, `${commandText}.bat`, commandText];
}

export async function commandAvailable(command, args = ["--version"], options = {}) {
  const candidates = commandCandidatesForPlatform(command, options.platform ?? process.platform);
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const result = await runCommandAvailabilityCandidate(candidate, args, options);
      return { available: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
    } catch (error) {
      lastError = error;
    }
  }

  const error = lastError || new Error(`No command candidate resolved for ${command}`);
  const tried = candidates.length > 1 ? `Tried: ${candidates.join(", ")}. ` : "";
  return {
    available: false,
    stdout: `${error.stdout || ""}`.trim(),
    stderr: `${tried}${error.stderr || error.message || ""}`.trim(),
  };
}

export function detectShell(env = process.env, platform = process.platform) {
  if (platform === "win32") {
    return env.PSModulePath ? "powershell" : env.ComSpec || "cmd.exe";
  }
  return env.SHELL || "unknown";
}

export function detectHostEnvironment({ cwd, env = process.env, platform = process.platform, execPath = process.execPath } = {}) {
  const pathSeparator = platform === "win32" ? "\\" : "/";

  return {
    os: platform === "win32" ? "windows" : platform,
    platform,
    arch: process.arch,
    shell: detectShell(env, platform),
    node_path: execPath,
    path_separator: pathSeparator,
    workspace: cwd,
  };
}
