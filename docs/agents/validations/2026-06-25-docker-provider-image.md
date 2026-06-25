# Docker Provider Image Validation

Date: 2026-06-25

## Commands

```bash
pnpm ops docker:build-provider -- --tag autopocock-provider-runner:local --validate
docker run --rm --network none autopocock-provider-runner:local sh -lc 'id -u && whoami && echo "$CODEX_HOME" && echo "$CLAUDE_CONFIG_DIR" && pnpm --version && codex --version && claude --version'
```

## Result

- Built image: `autopocock-provider-runner:local`
- Dockerfile: `docker/provider-runner/Dockerfile`
- Build status: passed
- No-network validation status: passed
- Required commands validated: `node`, `pnpm`, `git`, `codex`, `claude`
- Runtime user: `runner`
- Runtime UID: `10001`
- `CODEX_HOME`: `/codex-cache`
- `CLAUDE_CONFIG_DIR`: `/claude-cache`
- `pnpm`: `10.13.1`
- Codex CLI: `codex-cli 0.142.2`
- Claude Code: `2.1.193`

## Notes

The image proves the local Docker runner boundary can carry both supported provider CLIs without relying on host tools. Production deployment still needs an operator-approved registry/tag and credential package, but `pnpm ops docker:publish-provider` now makes that choice explicit by validating the local image, printing the exact tag/push commands, and requiring `--apply --approved-by` before pushing.
