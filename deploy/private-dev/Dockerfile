# Supplementary private development web backend, NOT a native platform deliverable.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-alpine
ENV NODE_ENV=production \
    HOME=/home/node \
    WORKSPACE_AI_PORT=3031
WORKDIR /app
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/server ./server
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/dist ./dist
USER node
EXPOSE 3031
CMD ["node", "server/index.mjs"]
