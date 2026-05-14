# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 2: Web server (slim — no Playwright needed) ─────────────────────────
FROM node:20-bookworm-slim AS web

WORKDIR /app
ENV NODE_ENV=production

# Next.js standalone output already bundles a minimal node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static     ./.next/static
COPY --from=builder /app/public           ./public
COPY --from=builder /app/prisma           ./prisma

RUN mkdir -p public/uploads

EXPOSE 3000
CMD ["node", "server.js"]

# ── Stage 3: Worker (needs Playwright / Chromium) ─────────────────────────────
FROM node:20-bookworm-slim AS worker

WORKDIR /app
ENV NODE_ENV=production

# Chromium system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/src           ./src
COPY --from=builder /app/prisma        ./prisma
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/tsconfig.json ./

RUN mkdir -p public/uploads

CMD ["npm", "run", "worker:prod"]
