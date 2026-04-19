# Backend Dockerfile
FROM node:20-slim
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Compile TypeScript to JavaScript
# Since we are in /app and the tsconfig is here, this should work.
RUN npx tsc

# Start the compiled JavaScript
EXPOSE 3001
CMD ["npm", "start"]
