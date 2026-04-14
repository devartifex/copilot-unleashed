FROM node:24-slim AS builder
RUN npm install -g npm@latest
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/ scripts/
RUN npm ci
COPY . .
RUN npm run build \
 && npm prune --omit=dev \
 && mkdir -p /tmp/copilot-config/session-state \
 && if [ -d bundled-sessions ]; then cp -a bundled-sessions/. /tmp/copilot-config/session-state/; fi \
 && if [ -f bundled-session-store.db ]; then cp bundled-session-store.db /tmp/copilot-config/session-store.db; fi

FROM node:24-slim

# Stable infra layer — cached independently of source code changes
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg git \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && chmod a+r /etc/apt/keyrings/docker.asc \
 && . /etc/os-release \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g @github/copilot \
 && mkdir -p /home/node/.copilot/session-state /data/sessions /data/settings /data/chat-state /data/push-subscriptions /data/copilot-home \
 && chown -R node:node /home/node /data

ENV NODE_ENV=production
ENV PORT=3000
ENV HOME=/home/node
ENV COPILOT_CONFIG_DIR=/home/node/.copilot

WORKDIR /app

# start.sh changes rarely — keep it above volatile app layers
COPY --chown=node:node scripts/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# App artifacts — rebuild only when source or deps change
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/build build/
COPY --from=builder /app/dist dist/
COPY --from=builder /app/server.js ./
COPY package.json ./

# Customization files for the scanner (instructions, prompts, agents, skills)
COPY --from=builder /app/.github/copilot-instructions.md .github/copilot-instructions.md
COPY --from=builder /app/.github/instructions/ .github/instructions/
COPY --from=builder /app/.github/prompts/ .github/prompts/
COPY --from=builder /app/.github/agents/ .github/agents/
COPY --from=builder /app/.github/skills/ .github/skills/

# Copy bundled CLI session data if it was prepared with scripts/bundle-sessions.mjs
COPY --from=builder --chown=node:node /tmp/copilot-config/ /home/node/.copilot/

EXPOSE 3000
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["/app/start.sh"]
