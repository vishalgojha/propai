FROM node:20-slim AS builder

WORKDIR /app

# Install git for pnpm workspace
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Copy workspace configuration FIRST
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json from workspace packages (required for pnpm workspace resolution)
COPY apps/api/package.json ./apps/api/
COPY packages/agent/package.json ./packages/agent/

# Install dependencies.
# The API package.json changes more frequently than the shared workspace lockfile
# in this repo, so avoid failing deploys on a stale root lockfile here.
RUN corepack enable && \
    NODE_ENV=development pnpm install --filter backend... --no-frozen-lockfile && \
    echo "pnpm install completed"

# Copy source after deps are installed (better layer caching)
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/

# Build the TypeScript project
WORKDIR /app/apps/api
RUN pnpm run build

# Production image
FROM node:20-slim

WORKDIR /app/apps/api

# Install runtime dependencies needed for onnxruntime-node (glibc, libstdc++)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# Preserve pnpm's symlink layout for runtime dependencies
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./

EXPOSE 3001

CMD ["node", "dist/index.js"]
