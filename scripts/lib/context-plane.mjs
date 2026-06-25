import path from "node:path";

function normalizeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function renderContextArtifact({
  title,
  source = "manual",
  contextMarkdown = "",
}) {
  const contextNote = normalizeText(contextMarkdown)
    .split("\n")
    .filter(Boolean)
    .slice(0, 6)
    .map((line) => `  ${line}`)
    .join("\n");

  return `# Shared Context

## Identity

- Title: ${title || "Untitled Context"}
- Status: draft
- Source: ${source}
- Approved by:
- Approved at:

## Domain Language

- Term:
- Meaning:

## Assumptions

- Assumption:

## Unknowns

- Unknown:

## Follow-up Decisions

- Decision:

## Scope Signals

- In scope:
- Out of scope:

## Context Notes

${contextNote || "- No additional CONTEXT.md excerpt captured."}
`;
}

function sectionBody(markdown, heading) {
  const text = normalizeText(markdown);
  const match = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, "m").exec(text);
  if (!match) {
    return "";
  }

  const start = match.index + match[0].length;
  const rest = text.slice(start).replace(/^\n+/, "");
  const nextHeadingIndex = rest.search(/^##\s+/m);
  return normalizeText(nextHeadingIndex === -1 ? rest : rest.slice(0, nextHeadingIndex));
}

function listItems(markdown, heading) {
  return sectionBody(markdown, heading)
    .split("\n")
    .map((line) => line.match(/^\s*-\s+(.*)$/)?.[1] || "")
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

export function parseKeyValueSection(markdown, heading) {
  const items = listItems(markdown, heading);
  const values = {};
  for (const item of items) {
    const match = item.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      values[match[1].trim().toLowerCase()] = match[2].trim();
    }
  }
  return values;
}

export function parseContextArtifact(markdown) {
  const identity = parseKeyValueSection(markdown, "Identity");
  return {
    title: identity.title || "",
    status: identity.status || "draft",
    source: identity.source || "",
    approvedBy: identity["approved by"] || "",
    approvedAt: identity["approved at"] || "",
    domainLanguage: listItems(markdown, "Domain Language"),
    assumptions: listItems(markdown, "Assumptions"),
    unknowns: listItems(markdown, "Unknowns"),
    followUpDecisions: listItems(markdown, "Follow-up Decisions"),
    scopeSignals: listItems(markdown, "Scope Signals"),
    contextNotes: sectionBody(markdown, "Context Notes"),
  };
}

export function approveContextArtifact(markdown, { approvedBy, approvedAt }) {
  return normalizeText(markdown)
    .replace(/^- Status:\s*.*$/m, "- Status: approved")
    .replace(/^- Approved by:\s*.*$/m, `- Approved by: ${approvedBy}`)
    .replace(/^- Approved at:\s*.*$/m, `- Approved at: ${approvedAt}`) + "\n";
}

export function latestArtifactPath(cwd, dir, fileNames) {
  const markdownFiles = fileNames.filter((file) => file.endsWith(".md")).sort().reverse();
  if (markdownFiles.length === 0) {
    return "";
  }
  return path.join(cwd, dir, markdownFiles[0]);
}

export function ensureApprovedContext(markdown, artifactPath = "") {
  const parsed = parseContextArtifact(markdown);
  if (parsed.status !== "approved") {
    const target = artifactPath || "context artifact";
    throw new Error(
      `Planning requires approved context. ${target} is ${parsed.status || "draft"}. Approve it with \`pnpm ops context-approve -- --context ${artifactPath || "<context.md>"} --approved-by <operator>\`.`,
    );
  }
  return parsed;
}
