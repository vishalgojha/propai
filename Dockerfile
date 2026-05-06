FROM node:20-alpine AS builder

WORKDIR /app

# Install only the Wabro app dependencies.
COPY wabro/package.json wabro/package-lock.json ./wabro/
RUN cd wabro && npm ci

# Copy the app source after dependency install.
COPY wabro ./wabro

WORKDIR /app/wabro
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/wabro/.next/standalone ./
COPY --from=builder /app/wabro/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
