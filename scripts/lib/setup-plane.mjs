import path from "node:path";
import { getProvider, listCanonicalProviderNames } from "./providers/index.mjs";
import {
  INIT_STRUCTURE_DIRS,
  detectHostEnvironment,
  ensureDirectories,
  pathExists,
  resolveRepoPath,
} from "./runtime-host.mjs";

function truthy(value) {
  return value ? "yes" : "no";
}

function trimDetail(value, max = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}...`;
}

export async function inspectSetupPlane({
  cwd,
  env = process.env,
  config = {},
  commandAvailable,
  loadJson,
  applyInit = false,
} = {}) {
  const host = detectHostEnvironment({ cwd, env });
  const configPath = resolveRepoPath(cwd, ".ai/ops.config.json");
  const templatePath = resolveRepoPath(cwd, ".github/ISSUE_TEMPLATE/agentic-slice.md");
  const queuePath = resolveRepoPath(cwd, config.queueFile || ".ai/queue.json");

  const [configPresent, templatePresent, queuePresent, git, node, pnpm, ghVersion, ghAuth] = await Promise.all([
    pathExists(configPath),
    pathExists(templatePath),
    pathExists(queuePath),
    commandAvailable("git", ["--version"], { cwd, env }),
    commandAvailable(process.execPath, ["--version"], { cwd, env }),
    commandAvailable("pnpm", ["--version"], { cwd, env }),
    commandAvailable("gh", ["--version"], { cwd, env }),
    commandAvailable("gh", ["auth", "status"], { cwd, env }),
  ]);

  const providers = [];
  for (const providerName of listCanonicalProviderNames()) {
    const provider = getProvider(providerName, { commandAvailable: (cmd, args) => commandAvailable(cmd, args, { cwd, env }), cwd });
    const availability = await provider.isAvailable({ requireLogin: true });
    providers.push({
      name: providerName,
      availability,
      capabilities: provider.getCapabilities(),
    });
  }

  const requiredDirs = await Promise.all(
    INIT_STRUCTURE_DIRS.map(async (dir) => ({
      path: dir,
      present: await pathExists(resolveRepoPath(cwd, dir)),
    })),
  );

  const missingDirs = requiredDirs.filter((dir) => !dir.present).map((dir) => dir.path);
  if (applyInit && missingDirs.length > 0) {
    await ensureDirectories(cwd, missingDirs);
  }

  return {
    host,
    paths: {
      config: configPath,
      template: templatePath,
      queue: queuePath,
    },
    files: {
      config_present: configPresent,
      template_present: templatePresent,
      queue_present: queuePresent,
    },
    prerequisites: {
      git,
      node,
      pnpm,
    },
    github: {
      owner: config.github?.owner || "",
      repo: config.github?.repo || "",
      project_url: config.github?.projectUrl || "",
      project_id: config.github?.projectId || "",
      project_number: config.github?.projectNumber || "",
      gh_cli: ghVersion,
      gh_auth: ghAuth,
      config_ready: Boolean(config.github?.owner && config.github?.repo && (config.github?.projectUrl || config.github?.projectId || config.github?.projectNumber)),
    },
    providers,
    directories: requiredDirs.map((dir) => ({
      ...dir,
      present: applyInit && missingDirs.includes(dir.path) ? true : dir.present,
    })),
    planned_mutations: applyInit ? missingDirs.map((dir) => `created local directory ${dir}`) : missingDirs.map((dir) => `would create local directory ${dir}`),
    mode: applyInit ? "apply-init" : "dry-run",
  };
}

export function renderSetupPlaneReport(report) {
  const lines = [
    "# Setup Plane",
    "",
    `Mode: ${report.mode}`,
    "",
    "## Host",
    "",
    `- OS: ${report.host.os}`,
    `- Platform: ${report.host.platform}`,
    `- Shell: ${report.host.shell}`,
    `- Node path: ${report.host.node_path}`,
    `- Path separator: ${report.host.path_separator}`,
    `- Workspace: ${report.host.workspace}`,
    "",
    "## Local Config",
    "",
    `- ops config present: ${truthy(report.files.config_present)} (${report.paths.config})`,
    `- queue snapshot present: ${truthy(report.files.queue_present)} (${report.paths.queue})`,
    `- issue template present: ${truthy(report.files.template_present)} (${report.paths.template})`,
    "",
    "## Runtime Prerequisites",
    "",
  ];

  for (const [name, result] of Object.entries(report.prerequisites)) {
    lines.push(`- ${name}: ${result.available ? "ready" : "missing"}`);
    if (result.stdout || result.stderr) {
      lines.push(`  detail: ${trimDetail(result.stdout || result.stderr)}`);
    }
  }

  lines.push("", "## GitHub Readiness", "");
  lines.push(`- config owner: ${report.github.owner || "unset"}`);
  lines.push(`- config repo: ${report.github.repo || "unset"}`);
  lines.push(`- project reference: ${report.github.project_url || report.github.project_id || report.github.project_number || "unset"}`);
  lines.push(`- config ready: ${truthy(report.github.config_ready)}`);
  lines.push(`- gh cli: ${report.github.gh_cli.available ? "ready" : "missing"}`);
  if (report.github.gh_cli.stdout || report.github.gh_cli.stderr) {
    lines.push(`  detail: ${trimDetail(report.github.gh_cli.stdout || report.github.gh_cli.stderr)}`);
  }
  lines.push(`- gh auth: ${report.github.gh_auth.available ? "ready" : "not ready"}`);
  if (report.github.gh_auth.stdout || report.github.gh_auth.stderr) {
    lines.push(`  detail: ${trimDetail(report.github.gh_auth.stdout || report.github.gh_auth.stderr)}`);
  }

  lines.push("", "## Providers", "");
  for (const provider of report.providers) {
    lines.push(`- ${provider.name}: ${provider.availability.ready ? "ready" : provider.availability.available ? "available but not ready" : "missing"}`);
    if (provider.availability.detail) {
      lines.push(`  detail: ${trimDetail(provider.availability.detail)}`);
    }
    lines.push(`  capabilities: ${Object.entries(provider.capabilities).filter(([, value]) => value).map(([key]) => key).join(", ")}`);
  }

  lines.push("", "## Workflow Structure", "");
  for (const dir of report.directories) {
    lines.push(`- ${dir.present ? "present" : "missing"}: ${dir.path}`);
  }

  lines.push("", "## Planned Mutations", "");
  if (report.planned_mutations.length === 0) {
    lines.push("- None");
  } else {
    for (const mutation of report.planned_mutations) {
      lines.push(`- ${mutation}`);
    }
  }

  lines.push("", "## Notes", "");
  lines.push("- Setup is dry-run-first. No GitHub or provider mutations are performed here.");
  lines.push("- Cross-platform detection uses the shared runtime host layer rather than shell-specific workflow contracts.");

  return `${lines.join("\n")}\n`;
}
