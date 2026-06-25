import { createCodexProvider } from "./codex-provider.mjs";
import { createClaudeProvider } from "./claude-provider.mjs";

export function createProviderRegistry({ commandAvailable, cwd }) {
  return {
    codex: createCodexProvider({ commandAvailable, cwd }),
    claude: createClaudeProvider({ commandAvailable, cwd }),
    "claude-code": createClaudeProvider({ commandAvailable, cwd }),
  };
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
