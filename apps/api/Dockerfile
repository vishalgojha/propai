FROM node:20-slim
WORKDIR /app
COPY apps/api/package*.json ./
RUN npm install
COPY apps/api .
RUN npx tsc
EXPOSE ${PORT:-3001}
CMD ["node", "dist/index.js"]
