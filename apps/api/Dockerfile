# NestJS API image. Build context: repository root.
#   docker build -f apps/api/Dockerfile -t erp-api .
FROM node:24.11.1-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY nx.json tsconfig.base.json jest.preset.js eslint.config.mjs ./
COPY libs ./libs
COPY apps/api ./apps/api
RUN NX_DAEMON=false npx nx build api --skip-nx-cache

FROM node:24.11.1-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
# Nx emits a pruned package.json + lockfile next to the bundle; install runtime deps only.
COPY --from=build /repo/dist/apps/api ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
USER node
EXPOSE 4000
# Reads ORACLE_* from the environment or from API_ENV_FILE (written by db/install.sh).
CMD ["node", "main.js"]
