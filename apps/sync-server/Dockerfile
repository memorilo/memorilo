# syntax=docker/dockerfile:1.7

FROM node:22-bookworm AS build

WORKDIR /workspace
ENV COREPACK_HOME=/tmp/corepack

RUN corepack enable \
  && corepack prepare pnpm@10.12.4 --activate

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter @memorilo/sync-server build \
  && pnpm deploy --filter @memorilo/sync-server --prod --legacy /runtime \
  && mkdir -p /runtime/dist /runtime/dist-ssr \
  && cp -a apps/sync-server/dist/. /runtime/dist/ \
  && cp -a apps/sync-server/dist-ssr/. /runtime/dist-ssr/

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
  MEMORILO_SYNC_SERVER_DATA_DIR=/var/lib/memorilo-sync \
  MEMORILO_SYNC_SERVER_HOST=0.0.0.0 \
  MEMORILO_SYNC_SERVER_PORT=6000 \
  MEMORILO_SYNC_SERVER_PEER_PORT=6001

WORKDIR /app
COPY --from=build /runtime/ ./

RUN mkdir -p /var/lib/memorilo-sync \
  && chown -R node:node /app /var/lib/memorilo-sync

USER node

EXPOSE 6000
VOLUME ["/var/lib/memorilo-sync"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:6000/livez').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node_modules/.bin/tsx", "src/index.ts"]
