# Backend Dockerfile
FROM node:20-slim
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Compile TypeScript to JavaScript
# We use tsc -p . to ensure it uses the tsconfig.json in the current directory
RUN npx tsc -p .

# Start the compiled JavaScript
EXPOSE 3001
CMD ["npm", "start"]
