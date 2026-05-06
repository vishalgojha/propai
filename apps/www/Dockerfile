FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace configuration first for dependency resolution.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/www/package.json ./apps/www/

# Install only the public-site workspace and its dependencies.
RUN corepack enable && \
    NODE_ENV=development pnpm install --filter www... --frozen-lockfile && \
    echo "pnpm install completed"

# Copy app sources after dependency install for better layer caching.
COPY apps/www/app ./apps/www/app
COPY apps/www/components ./apps/www/components
COPY apps/www/lib ./apps/www/lib
COPY apps/www/next.config.mjs ./apps/www/
COPY apps/www/next-env.d.ts ./apps/www/
COPY apps/www/postcss.config.js ./apps/www/
COPY apps/www/public ./apps/www/public
COPY apps/www/tailwind.config.ts ./apps/www/
COPY apps/www/tsconfig.json ./apps/www/

WORKDIR /app/apps/www
RUN pnpm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3002

COPY --from=builder /app/apps/www/.next/standalone ./
COPY --from=builder /app/apps/www/.next/static ./apps/www/.next/static
COPY --from=builder /app/apps/www/public ./apps/www/public

EXPOSE 3002

CMD ["node", "apps/www/server.js"]
