# Backend Dockerfile
FROM node:20-slim
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Ensure ts-node and typescript are available
RUN npm install -g ts-node typescript

EXPOSE 3001
CMD ["npx", "ts-node", "src/index.ts"]
