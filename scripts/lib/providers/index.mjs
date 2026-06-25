import { createCodexProvider } from "./codex-provider.mjs";
import { createClaudeProvider } from "./claude-provider.mjs";

export const CANONICAL_PROVIDER_NAMES = ["codex", "claude"];

export function createProviderRegistry({ commandAvailable, cwd }) {
  return {
    codex: createCodexProvider({ commandAvailable, cwd }),
    claude: createClaudeProvider({ commandAvailable, cwd }),
    "claude-code": createClaudeProvider({ commandAvailable, cwd }),
  };
}

export function listCanonicalProviderNames() {
  return [...CANONICAL_PROVIDER_NAMES];
}

export function getProvider(name, { commandAvailable, cwd }) {
  const normalized = String(name || "codex").trim().toLowerCase();
  const registry = createProviderRegistry({ commandAvailable, cwd });
  const provider = registry[normalized];
  if (!provider) {
    throw new Error(`Unsupported provider: ${name}`);
  }
  return provider;
}
