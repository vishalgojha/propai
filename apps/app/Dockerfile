FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace configuration first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json from workspace packages
COPY apps/app/package.json ./apps/app/
COPY packages/pulse-core/package.json ./packages/pulse-core/

# Install dependencies
RUN corepack enable && \
    NODE_ENV=development pnpm install --filter react-example... --frozen-lockfile && \
    echo "pnpm install completed"

# Copy source
COPY apps/app/src ./apps/app/src
COPY apps/app/public ./apps/app/public
COPY apps/app/index.html ./apps/app/
COPY apps/app/tsconfig.json ./apps/app/
COPY apps/app/vite.config.ts ./apps/app/

# Build
WORKDIR /app/apps/app
RUN pnpm run build

# Production image
FROM nginx:alpine

COPY --from=builder /app/apps/app/dist /usr/share/nginx/html
COPY apps/app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
