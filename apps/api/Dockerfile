# Multi-stage build for Hono API
# Note: Monorepo-aware Docker build (copying workspace packages) will be
# refined in Plan 04 when Bicep deploys Container Apps.

# --- Builder stage ---
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json tsconfig.json ./
COPY src/ ./src/

RUN npm ci && npm run build && npm prune --production

# --- Runner stage ---
FROM node:22-alpine AS runner
WORKDIR /app

# Non-root user for security
RUN addgroup -g 1001 -S hono && \
    adduser -u 1001 -S hono -G hono

COPY --from=builder --chown=hono:hono /app/node_modules ./node_modules
COPY --from=builder --chown=hono:hono /app/dist ./dist
COPY --from=builder --chown=hono:hono /app/package.json ./package.json

USER hono

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "dist/index.js"]
