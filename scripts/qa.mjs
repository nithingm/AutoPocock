import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { renderTargetedQaChecklistContext, validateTargetedQa } from "./lib/qa-targeted.mjs";

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

function normalizeIssue(issue) {
  const match = `${issue || ""}`.match(/\d+/);
  return match ? match[0] : "";
}

function dropLeadingDateTokens(tokens) {
  if (tokens.length >= 3 && /^\d{4}$/.test(tokens[0]) && /^\d{1,2}$/.test(tokens[1]) && /^\d{1,2}$/.test(tokens[2])) {
    return tokens.slice(3);
  }
  return tokens;
}

function fileNameMatchesIssue(fileName, issue) {
  const stem = path.basename(fileName, path.extname(fileName)).toLowerCase();
  const tokens = dropLeadingDateTokens(stem.split(/[^a-z0-9]+/i).filter(Boolean));

  for (let index = 0; index < tokens.length; index += 1) {
    if ((tokens[index] === "issue" || tokens[index] === "pr") && tokens[index + 1] === issue) {
      return true;
    }
  }

  return tokens.includes(issue);
}

function contentMatchesIssue(content, issue) {
  if (!content) {
    return false;
  }

  const escapedIssue = issue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const explicitPatterns = [
    new RegExp(`\\bTracker\\s*:\\s*#?${escapedIssue}\\b`, "i"),
    new RegExp(`\\bIssue\\s*:\\s*#?${escapedIssue}\\b`, "i"),
    new RegExp(`\\bPR\\s*:\\s*#?${escapedIssue}\\b`, "i"),
  ];

  return explicitPatterns.some((pattern) => pattern.test(content));
}

async function findMatchingArtifact(dir, issue) {
  const targetDir = path.join(cwd, dir);
  let files = [];
  const normalizedIssue = normalizeIssue(issue);

  try {
    files = await readdir(targetDir);
  } catch {
    return null;
  }

  if (!normalizedIssue) {
    return null;
  }

  const candidates = await Promise.all(
    files
      .filter((file) => file.endsWith(".md"))
      .map(async (file) => {
        const fullPath = path.join(targetDir, file);
        let content = "";

        try {
          content = await readFile(fullPath, "utf8");
        } catch {
          content = "";
        }

        return {
          file,
          fullPath,
          contentMatch: contentMatchesIssue(content, normalizedIssue),
          fileMatch: fileNameMatchesIssue(file, normalizedIssue),
        };
      }),
  );

  const matches = candidates
    .filter((candidate) => candidate.contentMatch || candidate.fileMatch)
    .sort((left, right) => right.file.localeCompare(left.file));

  const match = matches[0];

  return match ? match.fullPath : null;
}

async function loadArtifact(filePath) {
  if (!filePath) {
    return null;
  }

  try {
    return {
      path: filePath,
      content: await readFile(filePath, "utf8"),
    };
  } catch {
    return {
      path: filePath,
      content: "",
    };
  }
}

async function findTargetedArtifacts(issue) {
  const [handoffPath, completionPath, reviewPrepPath] = await Promise.all([
    findMatchingArtifact(path.join("docs", "agents", "handoffs"), issue),
    findMatchingArtifact(path.join("docs", "agents", "completions"), issue),
    findMatchingArtifact(path.join("docs", "agents", "reviews"), issue),
  ]);

  const [handoff, completion, reviewPrep] = await Promise.all([
    loadArtifact(handoffPath),
    loadArtifact(completionPath),
    loadArtifact(reviewPrepPath),
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
  const targetedContext = options.targetedContext || "";

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
- Handoff: ${artifacts.handoff?.path || artifacts.handoff || "missing"}
- Completion report: ${artifacts.completion?.path || artifacts.completion || "missing"}
- Review prep: ${artifacts.reviewPrep?.path || artifacts.reviewPrep || "missing"}

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

${targetedContext ? `${targetedContext}\n` : ""}## Targeted QA Checks

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
  const repo = await isGitRepo();
  const commits = repo ? await recentCommits() : [];
  const warnings = [];
  let targetedValidation = null;
  let targetedContext = "";

  if (targeted && issue) {
    artifacts = await findTargetedArtifacts(issue);
  }

  if (targeted) {
    targetedValidation = validateTargetedQa({
      manual,
      issue,
      pr,
      artifacts,
      changedFiles: commits.flatMap((commit) => commit.files),
      recentCommits: commits,
    });
    warnings.push(...targetedValidation.warnings);
    targetedContext = renderTargetedQaChecklistContext(targetedValidation);
  }

  const checklist = renderChecklist(commits, { issue, pr, artifacts, warnings, targetedContext });

  const date = new Date().toISOString().slice(0, 10);
  const target = path.join(cwd, "docs", "QA", `${date}-qa-checklist.generated.md`);

  await writeFile(target, checklist, "utf8");

  process.stdout.write(`${target}\n`);

  if (targetedValidation && !manual && targetedValidation.status !== "pass") {
    const messages = [...targetedValidation.errors, ...targetedValidation.sliceSignals];
    throw new Error(messages.join("\n"));
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
