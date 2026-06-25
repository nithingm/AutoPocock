import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureApprovedContext, parseContextArtifact } from "./lib/context-plane.mjs";
import { renderPrdFromContext } from "./lib/prd-plane.mjs";

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
  let contextPath = "";

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
    if (token === "--context" || token === "-c") {
      contextPath = raw[index + 1] || "";
      index += 1;
      continue;
    }
    titleParts.push(token);
  }

  const title = titleParts.join(" ").trim();
  return { title, contextPath };
}

async function resolveContextPath(source) {
  if (source) {
    return path.isAbsolute(source) ? source : path.join(cwd, source);
  }

  const contextDir = path.join(cwd, "docs", "agents", "contexts");
  const files = (await readdir(contextDir))
    .filter((file) => file.endsWith(".md") && file !== ".gitkeep")
    .sort()
    .reverse();

  if (files.length === 0) {
    throw new Error("No context artifact found. Run `pnpm ops context -- --title \"Feature Name\"` first or pass --context.");
  }

  return path.join(contextDir, files[0]);
}

async function main() {
  const { title, contextPath: requestedContextPath } = getArgs();
  const contextPath = await resolveContextPath(requestedContextPath);
  const contextMarkdown = await readFile(contextPath, "utf8");
  const context = ensureApprovedContext(contextMarkdown, contextPath);
  const parsed = parseContextArtifact(contextMarkdown);
  const effectiveTitle = title || parsed.title || "Untitled Feature";
  const date = new Date().toISOString().slice(0, 10);
  const slug = slugify(effectiveTitle) || "untitled-feature";
  const dir = path.join(cwd, "docs", "PRDs");
  const target = path.join(dir, `${date}-${slug}.md`);

  await mkdir(dir, { recursive: true });
  await writeFile(
    target,
    renderPrdFromContext({
      title: effectiveTitle,
      contextPath,
      context,
    }),
    "utf8",
  );

  process.stdout.write(`${target}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
