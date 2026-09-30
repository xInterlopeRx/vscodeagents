FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY mcp-server ./mcp-server
COPY docs ./docs
RUN npm run build

FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS runtime

ENV NODE_ENV=production \
    MCP_HTTP_HOST=0.0.0.0 \
    MCP_HTTP_PORT=3100 \
    VSCA_DOCS_DIR=/app/docs \
    VSCA_CACHE_DIR=/home/node/.cache/vscodeagent-docs

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && mkdir -p /home/node/.cache/vscodeagent-docs \
    && chown -R node:node /app /home/node/.cache

COPY --from=build --chown=node:node /app/mcp-server/dist ./mcp-server/dist
COPY --from=build --chown=node:node /app/docs ./docs

USER node
EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e 'fetch("http://127.0.0.1:3100/healthz").then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'

CMD ["node", "mcp-server/dist/index.js", "http"]
