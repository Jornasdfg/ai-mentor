# ── Stage 1: deps ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Stage 2: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client (requires DATABASE_URL at build if schema validates)
# Skip if DATABASE_URL not set during build; the app handles missing DB gracefully
RUN npx prisma generate || true

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/worker ./worker
COPY --from=builder /app/scripts ./scripts

# Ensure data directory exists and is writable
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
RUN chown -R nextjs:nodejs /app/.next

USER nextjs

EXPOSE 3000
ENV PORT=3000

# Default: start web app
# Override with: command: ["npx", "tsx", "worker/index.ts"]
CMD ["npm", "start"]
