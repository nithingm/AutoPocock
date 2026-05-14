import { execFile } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cwd = process.cwd();

function readOption(args, name, fallback = "") {
  const long = `--${name}`;
  const index = args.indexOf(long);
  if (index === -1) {
    return fallback;
  }
  return args[index + 1] || fallback;
}

function hasFlag(args, name) {
  return args.includes(`--${name}`);
}

async function findMatchingArtifact(dir, issue) {
  const targetDir = path.join(cwd, dir);
  let files = [];

  try {
    files = await readdir(targetDir);
  } catch {
    return null;
  }

  const match = files
    .filter((file) => file.endsWith(".md"))
    .find((file) => file.includes(issue));

  return match ? path.join(targetDir, match) : null;
}

async function findTargetedArtifacts(issue) {
  const [handoff, completion, reviewPrep] = await Promise.all([
    findMatchingArtifact(path.join("docs", "agents", "handoffs"), issue),
    findMatchingArtifact(path.join("docs", "agents", "completions"), issue),
    findMatchingArtifact(path.join("docs", "agents", "reviews"), issue),
  ]);

  return { handoff, completion, reviewPrep };
}

async function runGit(args) {
  return execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
}

async function isGitRepo() {
  try {
    const { stdout } = await runGit(["rev-parse", "--is-inside-work-tree"]);
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

async function recentCommits(limit = 5) {
  const format = ["%H", "%ad", "%an", "%s"].join("%x1f");
  let stdout = "";

  try {
    ({ stdout } = await runGit([
      "log",
      `-${limit}`,
      "--date=short",
      `--pretty=format:${format}`,
      "--name-only",
      "--no-merges",
    ]));
  } catch (error) {
    const stderr = `${error.stderr || ""}${error.stdout || ""}`;
    if (stderr.includes("does not have any commits yet")) {
      return [];
    }
    throw error;
  }

  const blocks = stdout
    .trim()
    .split(/\r?\n\r?\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const [header, ...files] = block.split(/\r?\n/);
    const [sha, date, author, subject] = header.split("\x1f");
    return {
      sha,
      shortSha: sha.slice(0, 7),
      date,
      author,
      subject,
      files: files.filter(Boolean),
    };
  });
}

function deriveFocusAreas(commits) {
  const files = commits.flatMap((commit) => commit.files);
  const unique = [...new Set(files)];

  if (unique.length === 0) {
    return [
      "Validate the primary user workflow affected by the latest issue.",
      "Confirm automated tests cover the intended behavior and one regression path.",
      "Review logs, errors, and edge cases introduced by the change.",
    ];
  }

  return unique.slice(0, 8).map((file) => {
    const normalized = file.replace(/\\/g, "/");
    if (normalized.includes("test") || normalized.includes("__tests__")) {
      return `Review whether ${file} covers a real regression and fails for the pre-fix case.`;
    }
    if (normalized.startsWith("docs/") || normalized.endsWith(".md")) {
      return `Check whether ${file} matches the shipped behavior and updated workflow.`;
    }
    if (normalized.includes("api") || normalized.includes("server")) {
      return `Exercise success, invalid input, and failure handling for code touched in ${file}.`;
    }
    if (normalized.includes("ui") || normalized.includes("src/") || normalized.endsWith(".tsx") || normalized.endsWith(".jsx")) {
      return `Manually verify the main interaction paths and obvious regressions in ${file}.`;
    }
    return `Inspect behavior and regression risk around ${file}.`;
  });
}

function renderChecklist(commits, options = {}) {
  const now = new Date();
  const generatedAt = now.toISOString();
  const focusAreas = deriveFocusAreas(commits);
  const targeted = Boolean(options.issue || options.pr);
  const artifacts = options.artifacts || {};
  const warnings = options.warnings || [];

  const commitSection =
    commits.length === 0
      ? "- No git commits were found. Start by making or importing a small change set."
      : commits
          .map((commit) => {
            const files =
              commit.files.length === 0
                ? "  - No file list captured"
                : commit.files.map((file) => `  - ${file}`).join("\n");
            return `- ${commit.shortSha} ${commit.subject} (${commit.author}, ${commit.date})\n${files}`;
          })
          .join("\n");

  const focusSection = focusAreas.map((item) => `- ${item}`).join("\n");

  const targetSection = targeted
    ? `## Target

- Issue: ${options.issue || "TBD"}
- PR: ${options.pr || "TBD"}
- Handoff: ${artifacts.handoff || "missing"}
- Completion report: ${artifacts.completion || "missing"}
- Review prep: ${artifacts.reviewPrep || "missing"}

`
    : "";
  const warningSection =
    warnings.length > 0
      ? `## Warnings

${warnings.map((warning) => `- ${warning}`).join("\n")}

`
      : "";

  return `# QA Checklist

Generated: ${generatedAt}

${targetSection}## Mode

${targeted ? "Targeted QA for tracked work." : "Generic QA from recent git activity."}

${warningSection}## Intent

Review the latest change set as a human-in-the-loop checkpoint before issue closure.

## Targeted QA Checks

${targeted ? "- Confirm the implementation matches the handoff boundaries.\n- Confirm the Completion Report claims match observable behavior.\n- Confirm Review Prep risks were evaluated.\n- Confirm acceptance criteria are verifiable from the issue and artifacts." : "- No tracked issue/PR supplied; use generic repo-level QA checks."}

## Recent Commits

${commitSection}

## Checklist

- Re-state the intended outcome of the latest issue in one sentence before testing.
- Confirm the happy path works end-to-end.
- Confirm at least one failure path or edge case works as expected.
- Run the relevant automated tests and record any gaps.
- Look for behavior drift between code, docs, and acceptance criteria.
- Capture every defect as a new issue instead of fixing it ad hoc.

## Focus Areas

${focusSection}

## Review Notes

- Status:
- Reviewer:
- Environment:
- Evidence:
- Follow-up issues:
`;
}

async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const issue = readOption(args, "issue");
  const pr = readOption(args, "pr");
  const manual = hasFlag(args, "manual");
  const targeted = Boolean(issue || pr);

  await mkdir(path.join(cwd, "docs", "QA"), { recursive: true });

  let artifacts = {};
  const warnings = [];

  if (targeted) {
    if (!issue || !pr) {
      const message = "Targeted QA requires both --issue and --pr. Use --manual to generate permissive QA.";
      if (!manual) {
        throw new Error(message);
      }
      warnings.push(message);
    }

    if (issue) {
      artifacts = await findTargetedArtifacts(issue);

      if (!artifacts.handoff) {
        const message = `Missing handoff artifact for issue ${issue}.`;
        if (!manual) {
          throw new Error(message);
        }
        warnings.push(message);
      }

      if (!artifacts.completion) {
        const message = `Missing completion report for issue ${issue}.`;
        if (!manual) {
          throw new Error(message);
        }
        warnings.push(message);
      }

      if (!artifacts.reviewPrep) {
        warnings.push(`Missing review prep artifact for issue ${issue}.`);
      }
    }
  }

  const repo = await isGitRepo();
  const commits = repo ? await recentCommits() : [];
  const checklist = renderChecklist(commits, { issue, pr, artifacts, warnings });

  const date = new Date().toISOString().slice(0, 10);
  const target = path.join(cwd, "docs", "QA", `${date}-qa-checklist.generated.md`);

  await writeFile(target, checklist, "utf8");

  process.stdout.write(`${target}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
