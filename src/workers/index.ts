/**
 * Worker entry point — run with: npm run worker
 *
 * This is a standalone Node.js process separate from the Next.js server.
 * It connects to Redis and processes jobs from all three queues.
 */

import { createScrapeWorker } from './scrape.worker';
import { createSendWorker } from './send.worker';
import { createMapsScrapeWorker } from './maps-scrape.worker';
import { createCatalogImportWorker } from './catalog-import.worker';
import { closeBrowser } from '../lib/browser';

const workers = [
  createScrapeWorker(),
  createSendWorker(),
  createMapsScrapeWorker(),
  createCatalogImportWorker(),
];

console.log('[workers] started — listening on queues: scrape, send, maps-scrape, catalog-import');

// Graceful shutdown: let in-flight jobs finish, then close Playwright browser
async function shutdown(signal: string) {
  console.log(`[workers] ${signal} received — shutting down gracefully`);
  await Promise.all(workers.map((w) => w.close()));
  await closeBrowser();
  console.log('[workers] all workers closed');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
