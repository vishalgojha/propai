# Backend Dockerfile
FROM node:20-slim
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Compile TypeScript to JavaScript
# We use npx tsc without -p . to allow it to find the tsconfig automatically
RUN npx tsc

# Start the compiled JavaScript
EXPOSE 3001
CMD ["npm", "start"]
