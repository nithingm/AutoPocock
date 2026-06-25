# syntax=docker/dockerfile:1

FROM node:22-bookworm

ARG CODEX_VERSION=0.142.2
ARG CLAUDE_CODE_VERSION=2.1.193
ARG PNPM_VERSION=10.13.1

LABEL org.opencontainers.image.title="AutoPocock Provider Runner"
LABEL org.opencontainers.image.description="Docker execution image for AutoPocock provider-isolated dispatches."

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    git \
    openssh-client \
    tini \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g "pnpm@${PNPM_VERSION}" "@openai/codex@${CODEX_VERSION}" "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
  && npm cache clean --force

RUN useradd --create-home --uid 10001 --shell /bin/bash runner \
  && mkdir -p /workspace /codex-cache /claude-cache \
  && chown -R runner:runner /workspace /codex-cache /claude-cache /home/runner

USER runner
WORKDIR /workspace

ENV HOME=/home/runner
ENV CODEX_HOME=/codex-cache
ENV CLAUDE_CONFIG_DIR=/claude-cache

ENTRYPOINT ["tini", "--"]
CMD ["bash"]
