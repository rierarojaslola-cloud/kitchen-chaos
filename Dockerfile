# Generic container image (Fly.io, Koyeb, Railway, any Docker host).
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/game-logic/package.json packages/game-logic/
RUN npm ci --include=dev --ignore-scripts
COPY . .
RUN npm run build
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
