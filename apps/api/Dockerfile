# Backend Dockerfile
FROM node:20-slim
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build TypeScript to JavaScript
RUN npm run build

# Start the compiled JavaScript
EXPOSE 3001
CMD ["npm", "start"]
