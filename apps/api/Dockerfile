# Backend Dockerfile
FROM node:20-slim
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Run tsc directly instead of via turbo to avoid package manager binary issues in the container
RUN npx tsc

# Start the compiled JavaScript
EXPOSE 3001
CMD ["npm", "start"]
