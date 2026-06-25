# ADR: Docker Runtime Policy

## Status

Accepted

## Context

AutoPocock supports Docker-isolated dispatches for work that should not run directly on the host. The remaining production hardening question was how Docker images, credentials, and writable workspace mounts should be handled.

## Decision

Docker execution is explicit and inspectable:

- `pnpm ops run -- --prepare-docker` renders the container command without invoking Docker.
- `pnpm ops run -- --execute --execute-docker` is required before the host launches Docker.
- Docker dispatches mount the claimed worktree as the container workspace.
- No host credentials are forwarded implicitly.
- Credential forwarding is allowlist-only through `--docker-env`, stored as `docker.env`, and rendered as Docker `-e` flags.
- Extra writable mounts are declaration-only through `--docker-volume`, stored as `docker.volumes`, and rendered as additional Docker `-v` flags.
- `--live-provider` is valid only when the selected Docker image contains the provider CLI and the required allowed credentials.

## Consequences

- The rendered Docker command is the audit boundary before execution.
- Host credentials do not leak into containers by default.
- Additional writable state is visible in dispatch JSON, Provider Run metadata, and the rendered command.
- Production teams can bring hardened images and named volumes without changing the runner contract.
- `pnpm ops docker:validate` checks proposed execution images with no network, validates required provider commands, and verifies explicitly allowed credential env vars are present before live Docker dispatch use.
- `docker/provider-runner/Dockerfile` is the default repo-owned provider image for local validation. It installs pinned `pnpm`, Codex CLI, and Claude Code versions, creates a non-root `runner` user, and keeps Codex/Claude cache directories explicit.
- `pnpm ops docker:build-provider -- --tag autopocock-provider-runner:local --validate` builds that image and verifies `node`, `pnpm`, `git`, `codex`, and `claude` command/version readiness with Docker networking disabled.
- `pnpm ops docker:publish-provider -- --target-tag <registry>/<repo>:<tag> --write-plan` validates the source provider image, prints the exact `docker tag` and `docker push` commands, and records the accepted runtime credential env/volume allowlist under `docs/agents/hitl/`. It is dry-run-first; pushing requires `--apply --approved-by <operator>`.
- Provider credentials remain runtime inputs. They are not baked into the image during build or publish.
