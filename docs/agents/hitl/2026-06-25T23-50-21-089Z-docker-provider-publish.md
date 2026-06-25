# Prepared Human Step: Docker Provider Image Publish

Generated: 2026-06-25T23:50:21.088Z
Mode: dry-run

## Image

- Source image: autopocock-provider-runner:local
- Target image: ghcr.io/nithingm/autopocock-provider-runner:local
- Provider: codex

## Credential Package

- Credential env allowlist: CODEX_HOME
- Credential volumes: codex-cache:/codex-cache
- Policy: credentials are not baked into the image; runtime dispatches must opt in with `--docker-env` or `--docker-volume`.

## Validation

- Command: `docker run --rm --network none autopocock-provider-runner:local sh -lc set -eu && command -v node >/dev/null || { echo "missing command: node" >&2; exit 1; } && command -v pnpm >/dev/null || { echo "missing command: pnpm" >&2; exit 1; } && command -v git >/dev/null || { echo "missing command: git" >&2; exit 1; } && command -v codex >/dev/null || { echo "missing command: codex" >&2; exit 1; } && command -v claude >/dev/null || { echo "missing command: claude" >&2; exit 1; } && node --version >/dev/null && pnpm --version >/dev/null && git --version >/dev/null && codex --version >/dev/null && claude --version >/dev/null`
- Required commands: node, pnpm, git, codex, claude
- Expected: source image validates before any tag or push.

## Publish Commands

- Tag: `docker tag autopocock-provider-runner:local ghcr.io/nithingm/autopocock-provider-runner:local`
- Push: `docker push ghcr.io/nithingm/autopocock-provider-runner:local`

## Approval

- Status: dry-run only; no tag or push was executed.
- Apply: rerun with `--apply --approved-by <operator>` after `docker login`, registry/tag, and credential package are accepted.
