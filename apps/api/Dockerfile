# Backend Dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build # Assuming a build script is added to package.json
EXPOSE 3001
CMD ["node", "dist/index.js"]
