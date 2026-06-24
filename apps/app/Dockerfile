FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace configuration first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json from workspace packages
COPY apps/app/package.json ./apps/app/

# Install dependencies
RUN corepack enable && \
    NODE_ENV=development pnpm install --filter propai-app... --no-frozen-lockfile && \
    echo "pnpm install completed"

# Build-time args for Next public environment variables
ARG NEXT_PUBLIC_API_BASE_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_META_APP_ID
ARG VITE_API_BASE_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_META_APP_ID=$NEXT_PUBLIC_META_APP_ID

# Copy source
COPY apps/app/app ./apps/app/app
COPY apps/app/src ./apps/app/src
COPY apps/app/public ./apps/app/public
COPY apps/app/tsconfig.json ./apps/app/
COPY apps/app/next-env.d.ts ./apps/app/
COPY apps/app/next.config.mjs ./apps/app/
COPY apps/app/postcss.config.mjs ./apps/app/

# Build
WORKDIR /app/apps/app
RUN NODE_OPTIONS="--max-old-space-size=2048" \
    NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-$VITE_API_BASE_URL}" \
    NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-$VITE_SUPABASE_URL}" \
    NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-$VITE_SUPABASE_ANON_KEY}" \
    NEXT_PUBLIC_POSTHOG_KEY="${NEXT_PUBLIC_POSTHOG_KEY:-$VITE_POSTHOG_KEY}" \
    NEXT_PUBLIC_POSTHOG_HOST="${NEXT_PUBLIC_POSTHOG_HOST:-$VITE_POSTHOG_HOST}" \
    NEXT_PUBLIC_META_APP_ID="${NEXT_PUBLIC_META_APP_ID}" \
    pnpm run build

# Production image
FROM node:22-alpine

WORKDIR /app/apps/app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/app/node_modules ./node_modules
COPY --from=builder /app/apps/app/.next ./.next
COPY --from=builder /app/apps/app/public ./public
COPY --from=builder /app/apps/app/package.json ./package.json
COPY --from=builder /app/apps/app/next.config.mjs ./next.config.mjs

EXPOSE 3000

CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
