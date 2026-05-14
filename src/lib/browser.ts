import { chromium, Browser } from 'playwright';

/**
 * Lazily-launched Playwright Chromium browser, shared across the entire
 * worker process. A single Promise is stored so concurrent callers don't
 * trigger multiple launches (race-condition safe).
 *
 * On crash/disconnect the promise is cleared so the next call re-launches.
 */

let browserPromise: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          // Make automation less detectable
          '--disable-blink-features=AutomationControlled',
        ],
      })
      .then((b) => {
        // Clear the cached promise if the browser crashes so the next caller
        // gets a fresh launch instead of a rejected promise.
        b.on('disconnected', () => {
          browserPromise = null;
        });
        return b;
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

/**
 * Close the shared browser — call this during graceful worker shutdown.
 */
export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch {
      // ignore if already closed
    } finally {
      browserPromise = null;
    }
  }
}
