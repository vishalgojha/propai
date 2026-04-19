# Frontend Dockerfile
FROM node:20-slim AS builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace configuration
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/agent/package.json ./packages/agent/

# Install dependencies
RUN pnpm install

# Copy the rest of the project
COPY . .

# Build the project - FORCING WEBPACK to avoid Turbopack parsing bugs
WORKDIR /app/apps/web
RUN NEXT_TURBOPACK_DISABLED=1 npm run build

# Production stage
FROM node:20-slim
WORKDIR /app
RUN npm install -g pnpm

# Copy built assets from builder
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["pnpm", "start"]
