import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readdir } from "node:fs/promises";

const cwd = process.cwd();

function getArgs() {
  const raw = process.argv.slice(2);
  let source = "";

  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index];
    if (token === "--") {
      continue;
    }
    if (token === "--prd" || token === "-p") {
      source = raw[index + 1] || "";
      index += 1;
      continue;
    }
    if (!source) {
      source = token;
    }
  }

  return { source };
}

function issueBlock(index, title) {
  return `## Issue ${index}: ${title}

### Outcome

- Describe the user-visible or system-visible outcome.

### Scope

- Included:
- Excluded:

### Implementation Notes

- Key files or modules:
- Risks or dependencies:

### Verification

- Automated:
- Manual:

### Non-Goals

- Explicitly state what this issue will not do.
`;
}

function deriveIssueTitles(prdText) {
  const checks = [...prdText.matchAll(/^- \[ \] (.+)$/gm)].map((match) => match[1].trim());

  if (checks.length > 0) {
    return checks.map((check, index) => `Deliver acceptance criterion ${index + 1}: ${check}`);
  }

  return [
    "Establish the primary happy path",
    "Cover validation and failure handling",
    "Close QA and documentation gaps",
  ];
}

async function resolvePrdPath(source) {
  if (source) {
    return path.isAbsolute(source) ? source : path.join(cwd, source);
  }

  const prdDir = path.join(cwd, "docs", "PRDs");
  const files = (await readdir(prdDir))
    .filter((file) => file.endsWith(".md") && file !== ".gitkeep")
    .sort()
    .reverse();

  if (files.length === 0) {
    throw new Error("No PRD found. Run `pnpm prd -- --title \"Feature Name\"` first or pass --prd.");
  }

  return path.join(prdDir, files[0]);
}

function renderIssues(prdPath, prdText, issueTitles) {
  const prdName = path.basename(prdPath);
  const body = issueTitles.map((title, index) => issueBlock(index + 1, title)).join("\n");

  return `# Issue Decomposition

Source PRD: ${prdName}

## Decomposition Rules

- Keep each issue independently testable.
- Keep architecture decisions upstream of implementation.
- Split by vertical slice, not by technical layer when possible.
- Create follow-up bugs instead of silently expanding scope.

${body}`;
}

async function main() {
  const { source } = getArgs();
  const prdPath = await resolvePrdPath(source);
  const prdText = await readFile(prdPath, "utf8");
  const issueTitles = deriveIssueTitles(prdText);
  const date = new Date().toISOString().slice(0, 10);
  const base = path.basename(prdPath, ".md");
  const normalizedBase = base.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const dir = path.join(cwd, "issues");
  const target = path.join(dir, `${date}-${normalizedBase}-issues.md`);

  await mkdir(dir, { recursive: true });
  await writeFile(target, renderIssues(prdPath, prdText, issueTitles), "utf8");

  process.stdout.write(`${target}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
