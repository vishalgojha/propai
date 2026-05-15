FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace configuration first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json from workspace packages
COPY apps/app/package.json ./apps/app/
COPY packages/pulse-core/package.json ./packages/pulse-core/

# Install dependencies
RUN corepack enable && \
    NODE_ENV=development pnpm install --filter react-example... --no-frozen-lockfile && \
    echo "pnpm install completed"

# Build-time args for Vite environment variables
ARG VITE_API_BASE_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SUPABASE_SERVICE_ROLE_KEY
ARG VITE_POSTHOG_KEY
ARG VITE_POSTHOG_HOST
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_SERVICE_ROLE_KEY=$VITE_SUPABASE_SERVICE_ROLE_KEY
ENV VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY
ENV VITE_POSTHOG_HOST=$VITE_POSTHOG_HOST

# Copy source
COPY apps/app/src ./apps/app/src
COPY apps/app/public ./apps/app/public
COPY apps/app/index.html ./apps/app/
COPY apps/app/tsconfig.json ./apps/app/
COPY apps/app/vite.config.ts ./apps/app/
COPY apps/app/server.js ./apps/app/server.js

# Build
WORKDIR /app/apps/app
RUN pnpm run build

# Production image
FROM node:22-alpine

WORKDIR /app/apps/app

# Copy built files and server.js
COPY --from=builder /app/apps/app/dist ./dist
COPY --from=builder /app/apps/app/server.js ./server.js

# Install production dependencies
COPY --from=builder /app/apps/app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
RUN corepack enable && \
    NODE_ENV=production pnpm install --ignore-scripts --no-frozen-lockfile && \
    echo "pnpm install completed"

EXPOSE 3002

CMD ["node", "server.js"]