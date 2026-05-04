FROM node:20-slim
WORKDIR /app
COPY apps/mcp/package*.json ./
RUN npm install
COPY apps/mcp .
RUN npx tsc
EXPOSE 3003
CMD ["node", "dist/server.js"]
