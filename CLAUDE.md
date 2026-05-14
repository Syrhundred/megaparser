# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        
npm run build        # Production build
npm run start        # Run production build

npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:push      # Apply schema changes to PostgreSQL (no migration files)
npm run db:studio    # Open Prisma Studio GUI

npm run worker       # Start BullMQ workers (scrape + send queues) — separate process
```

No test suite is configured. TypeScript checking: `npx tsc --noEmit`.

## Environment Setup

Copy `.env.example` to `.env` and fill in:
- `DATABASE_URL` — PostgreSQL connection string (`postgresql://user:pass@host:5432/megaparser`)
- `REDIS_URL` — Redis connection string (`redis://localhost:6379`) — required for BullMQ queues
- `SMTP_*` — Email sending credentials (also configurable at runtime via Settings UI → stored in the `Setting` table)

**Local dev services needed:** PostgreSQL + Redis. Quickest start:
```bash
docker run -d -p 5433:5432 -e POSTGRES_PASSWORD=password -e POSTGRES_DB=megaparser postgres:16
docker run -d -p 6379:6379 redis:7
```

## New packages (added in refactor)

```bash
npm install bullmq ioredis playwright @playwright/test
npx playwright install chromium   # download browser binary
npm install -D @types/node
```

## Architecture

MegaParser is a B2B outreach tool for electrical equipment sales. It finds companies online, scrapes their contact info, then sends templated cold emails.

### Data flow

1. **Discover** — companies are added via CSV upload (`/api/upload`) or manually
2. **Scrape** — `POST /api/companies/[id]/scrape` calls `src/lib/scraper.ts`, which fetches the company homepage + up to 4 contact-like pages, extracts emails/phones/WhatsApp, detects contact forms
3. **Message** — `src/lib/message-builder.ts` interpolates `{{company}}`, `{{product_description}}`, `{{signature}}` placeholders into a `Template`
4. **Send** — `POST /api/companies/[id]/send` sends via `src/lib/email.ts` (nodemailer), records an `Outreach` row, and updates `Company.status`

### Company status lifecycle

`site_found` → `contact_found` | `email_found` | `form_found` | `no_contacts` → `message_ready` → `sent` | `send_error` → `replied`

Status labels/colors live in `src/types/index.ts` and are the single source of truth for both API and UI.

### Database (Prisma + PostgreSQL)

Five models: `Company`, `Outreach`, `Template`, `Setting`, `Job`.

- `Company` tracks one company per unique website URL; `scrapeJobId` / `sendJobId` reference the active BullMQ jobs
- `Outreach` is an append-only log of every send attempt; `scheduledAt` / `retryCount` / `jobId` support the queue workflow
- `Template` stores reusable email templates with `{{placeholder}}` syntax
- `Setting` is a key/value store for runtime config (SMTP credentials, API keys, etc.)
- `Job` mirrors BullMQ queue entries in the DB for UI visibility — workers write `status`, `result`, `errorMsg`, `startedAt`, `finishedAt` back into this table

Use `db:push` (not `migrate`) — this project uses schema-push workflow without migration history files.

### Background job queues (BullMQ + Redis)

Three queues (defined in `src/lib/queues.ts`, TBD):
- **`scrape`** — one job per company; worker runs Playwright to extract contacts
- **`send`** — one job per outreach; worker fires nodemailer with a randomised 3–8 min delay between sends
- **`maps-scrape`** — one job per search query; worker scrapes 2GIS / Yandex Maps via Playwright

Workers run in a **separate Node.js process** (`src/workers/index.ts`, started with `npm run worker`), not inside the Next.js server. The Next.js API routes only enqueue jobs and return immediately.

### Next.js App Router layout

All pages are under `src/app/`. The root redirects to `/dashboard`. Every page is a client component (`'use client'`) fetching from its own API routes. The sidebar (`src/components/Sidebar.tsx`) is rendered in the root layout and always visible; the main content area has `ml-60` offset.

### SMTP configuration

SMTP settings can come from two places — the `Setting` table (set via the Settings page UI) takes precedence over environment variables. Both paths are resolved inside `POST /api/companies/[id]/send/route.ts`.

File attachments for emails are uploaded to `public/uploads/` via `/api/upload` and referenced by filename when sending.
