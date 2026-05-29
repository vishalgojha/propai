FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/www/package.json ./apps/www/
COPY packages/price-parser/package.json ./packages/price-parser/

# Install only the www workspace and its dependencies
RUN corepack enable && \
    NODE_ENV=development pnpm install --filter www... --no-frozen-lockfile && \
    echo "pnpm install completed"

# Copy app sources
COPY apps/www/ ./apps/www/
COPY packages/price-parser/src ./packages/price-parser/src
COPY packages/price-parser/tsconfig.json ./packages/price-parser/

WORKDIR /app/apps/www

# Build the Next app
RUN pnpm --filter @propai/price-parser build && \
    pnpm run build

FROM node:20-alpine AS runner

WORKDIR /app/apps/www
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/www/node_modules ./node_modules
COPY --from=builder /app/packages/price-parser /app/packages/price-parser
COPY --from=builder /app/apps/www/.next ./.next
COPY --from=builder /app/apps/www/public ./public
COPY --from=builder /app/apps/www/package.json ./package.json
COPY --from=builder /app/apps/www/next.config.mjs ./next.config.mjs

EXPOSE 3000

CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
