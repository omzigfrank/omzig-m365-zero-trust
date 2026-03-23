# Multi-stage Dockerfile for Next.js standalone output
#
# NOTE: This Dockerfile builds the web app in isolation. For monorepo builds
# in CI pipelines, the pipeline must:
#   1. Copy workspace root package.json, pnpm-lock.yaml, and pnpm-workspace.yaml
#   2. Copy packages/ directory (shared, tsconfig, db)
#   3. Copy apps/web/ directory
#   4. Run pnpm install from the workspace root
#   5. Build with: pnpm --filter @omzig/web build
#
# The standalone output at apps/web/.next/standalone includes all dependencies.

# ── Stage 1: Dependencies ────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Build ───────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time environment variables (injected at CI/CD time)
ARG NEXT_PUBLIC_MSAL_CLIENT_ID
ARG NEXT_PUBLIC_AZURE_TENANT_ID
ARG NEXT_PUBLIC_MSAL_REDIRECT_URI
ARG NEXT_PUBLIC_API_URL

ENV NEXT_PUBLIC_MSAL_CLIENT_ID=$NEXT_PUBLIC_MSAL_CLIENT_ID
ENV NEXT_PUBLIC_AZURE_TENANT_ID=$NEXT_PUBLIC_AZURE_TENANT_ID
ENV NEXT_PUBLIC_MSAL_REDIRECT_URI=$NEXT_PUBLIC_MSAL_REDIRECT_URI
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm build

# ── Stage 3: Runner ──────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output and static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
