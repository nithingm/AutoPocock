import { createCodexProvider } from "./codex-provider.mjs";
import { createClaudeProvider } from "./claude-provider.mjs";

export const CANONICAL_PROVIDER_NAMES = ["codex", "claude"];

export const PROVIDER_DEFINITIONS = [
  {
    name: "codex",
    aliases: [],
    command: "codex",
    credentialEnv: ["CODEX_HOME"],
  },
  {
    name: "claude",
    aliases: ["claude-code"],
    command: "claude",
    credentialEnv: ["CLAUDE_CONFIG_DIR"],
  },
];

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

export function listProviderDefinitions() {
  return PROVIDER_DEFINITIONS.map((definition) => ({
    ...definition,
    aliases: [...definition.aliases],
    credentialEnv: [...definition.credentialEnv],
  }));
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
