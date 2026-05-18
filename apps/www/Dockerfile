FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/www/package.json ./apps/www/

# Install only the www workspace and its dependencies
RUN corepack enable && \
    NODE_ENV=development pnpm install --filter www... --frozen-lockfile && \
    echo "pnpm install completed"

# Copy app sources
COPY apps/www/ ./apps/www/

WORKDIR /app/apps/www

# Build the Vite frontend
RUN pnpm run build

FROM node:20-alpine AS runner

WORKDIR /app/apps/www
ENV NODE_ENV=production
ENV PORT=3002

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/www/node_modules ./node_modules
COPY --from=builder /app/apps/www/dist ./dist
COPY --from=builder /app/apps/www/package.json ./package.json

EXPOSE 3002

CMD ["node", "dist/server.mjs"]
