FROM node:22-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build && npm prune --omit=dev

FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/dist dist/
COPY package.json ./
COPY public/ public/

ENV NODE_ENV=production
ENV PORT=3000
ENV HOME=/home/node

# Install gh CLI
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
      dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \
      tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /home/node && chown node:node /home/node

COPY --chmod=755 entrypoint.sh /entrypoint.sh

EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/index.js"]
