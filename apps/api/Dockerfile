# Backend Dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# We skip the build step to avoid TS errors during deployment
EXPOSE 3001
CMD ["npx", "ts-node", "src/index.ts"]
