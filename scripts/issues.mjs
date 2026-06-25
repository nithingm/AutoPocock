import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { ensureApprovedPrd, renderPrdTightnessReport, validatePrdTightness } from "./lib/prd-plane.mjs";
import { compileLayeredDag, renderLayeredDagMarkdown } from "./lib/layered-dag-compiler.mjs";
import {
  regenerateLayeredDag,
  renderLayeredDagRegenerationMarkdown,
} from "./lib/layered-dag-regeneration.mjs";

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

async function writePrdTightnessArtifacts({ prdPath, validation }) {
  const date = new Date().toISOString().slice(0, 10);
  const base = path.basename(prdPath, ".md");
  const normalizedBase = base.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const dir = path.join(cwd, "docs", "agents", "planning-validations");
  const markdownTarget = path.join(dir, `${date}-${normalizedBase}-prd-tightness.md`);
  const jsonTarget = path.join(dir, `${date}-${normalizedBase}-prd-tightness.json`);

  await mkdir(dir, { recursive: true });
  await writeFile(markdownTarget, renderPrdTightnessReport(validation), "utf8");
  await writeFile(jsonTarget, `${JSON.stringify(validation, null, 2)}\n`, "utf8");

  return { markdownTarget, jsonTarget };
}

async function main() {
  const { source } = getArgs();
  const prdPath = await resolvePrdPath(source);
  const prdText = await readFile(prdPath, "utf8");
  ensureApprovedPrd(prdText, prdPath);
  const validation = validatePrdTightness(prdText, prdPath);
  if (!validation.ok) {
    const artifacts = await writePrdTightnessArtifacts({ prdPath, validation });
    throw new Error(
      [
        `PRD tightness validation failed for ${prdPath}.`,
        ...validation.failures.map((failure) => `- ${failure}`),
        `Validation report: ${artifacts.markdownTarget}`,
        `Validation JSON: ${artifacts.jsonTarget}`,
      ].join("\n"),
    );
  }
  const date = new Date().toISOString().slice(0, 10);
  const base = path.basename(prdPath, ".md");
  const normalizedBase = base.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const dir = path.join(cwd, "issues");
  const markdownTarget = path.join(dir, `${date}-${normalizedBase}-issues.md`);
  const jsonTarget = path.join(dir, `${date}-${normalizedBase}-issues.json`);
  const regenerationMarkdownTarget = path.join(dir, `${date}-${normalizedBase}-issues-regeneration.md`);
  const regenerationJsonTarget = path.join(dir, `${date}-${normalizedBase}-issues-regeneration.json`);

  await mkdir(dir, { recursive: true });
  let previousDag = null;
  try {
    previousDag = JSON.parse(await readFile(jsonTarget, "utf8"));
  } catch {}

  const result = previousDag
    ? regenerateLayeredDag({ prdPath, prdText, previousDag })
    : { dag: compileLayeredDag({ prdPath, prdText }), diff: null };

  await writeFile(markdownTarget, renderLayeredDagMarkdown(result.dag), "utf8");
  await writeFile(jsonTarget, `${JSON.stringify(result.dag, null, 2)}\n`, "utf8");
  if (result.diff) {
    await writeFile(regenerationMarkdownTarget, renderLayeredDagRegenerationMarkdown(result.diff), "utf8");
    await writeFile(regenerationJsonTarget, `${JSON.stringify(result.diff, null, 2)}\n`, "utf8");
  }

  process.stdout.write(`${markdownTarget}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
