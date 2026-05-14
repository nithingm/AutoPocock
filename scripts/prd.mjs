import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function getArgs() {
  const raw = process.argv.slice(2);
  const titleParts = [];

  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index];
    if (token === "--") {
      continue;
    }
    if (token === "--title" || token === "-t") {
      const next = raw[index + 1];
      if (next) {
        titleParts.push(next);
        index += 1;
      }
      continue;
    }
    titleParts.push(token);
  }

  const title = titleParts.join(" ").trim() || "Untitled Feature";
  return { title };
}

function renderPrd(title) {
  return `# ${title}

## Problem

- What problem are we solving?
- Who is affected?
- Why does it matter now?

## User Value

- What changes for the user when this ships?
- What outcome should be noticeably better?

## Scope

- In scope:
- Out of scope:

## Acceptance Criteria

- [ ] Define the primary happy path.
- [ ] Define at least one failure path or edge case.
- [ ] Define what evidence is required for QA sign-off.

## Constraints

- Technical constraints:
- Product constraints:
- Operational constraints:

## Risks

- Risk:
- Mitigation:

## Open Questions

- Question:

## Notes For Issue Decomposition

- What can be split into independent vertical slices?
- What should explicitly not be bundled together?
`;
}

async function main() {
  const { title } = getArgs();
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(title) || "untitled-feature";
  const dir = path.join(cwd, "docs", "PRDs");
  const target = path.join(dir, `${date}-${slug}.md`);

  await mkdir(dir, { recursive: true });
  await writeFile(target, renderPrd(title), "utf8");

  process.stdout.write(`${target}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
