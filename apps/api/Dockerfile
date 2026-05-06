FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace configuration FIRST
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json from workspace packages (required for pnpm workspace resolution)
COPY apps/api/package.json ./apps/api/
COPY packages/pulse-core/package.json ./packages/pulse-core/
COPY packages/agent/package.json ./packages/agent/

# Install dependencies
RUN corepack enable && \
    NODE_ENV=development pnpm install --filter backend... --frozen-lockfile && \
    echo "pnpm install completed"

# Copy source after deps are installed (better layer caching)
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/

# Build the TypeScript project
WORKDIR /app/apps/api
RUN pnpm run build

# Production image
FROM node:20-alpine

WORKDIR /app/apps/api

# Preserve pnpm's symlink layout for runtime dependencies
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/api/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./

EXPOSE 3001

CMD ["node", "dist/index.js"]
