/**
 * Playwright-based maps scraper — no API keys required.
 *
 * 2GIS:
 *   Phase 1 — navigate search results, collect firm page URLs
 *   Phase 2 — visit each firm page, extract contacts (JSON-LD → DOM fallback)
 *   Domains: kz→2gis.kz  ru→2gis.ru  uz→2gis.uz  by→2gis.ru
 *
 * Yandex Maps:
 *   Primary   — intercept the internal search-maps.yandex.ru API response that
 *               the browser fires; parse same JSON format as the paid API
 *   Fallback  — DOM scraping of result cards in the sidebar
 *   Domains: kz→yandex.kz  ru→yandex.ru  uz→yandex.uz  by→yandex.by
 */

import { BrowserContext, Page } from 'playwright';
import { getBrowser } from './browser';
import { MapsResult } from './maps-search';

// ─── Domain maps ──────────────────────────────────────────────────────────────

const DOMAIN_2GIS: Record<string, string> = {
  kz: '2gis.kz',
  ru: '2gis.ru',
  uz: '2gis.uz',
  by: '2gis.ru', // no 2gis.by
};

const DOMAIN_YANDEX: Record<string, string> = {
  kz: 'yandex.kz',
  ru: 'yandex.ru',
  uz: 'yandex.uz',
  by: 'yandex.by',
};

// Social-media domains — exclude from "website" field
const SOCIAL_DOMAINS = [
  'vk.com', 'instagram.com', 'facebook.com', 'fb.com',
  't.me', 'telegram.me', 'wa.me', 'whatsapp.com',
  'youtube.com', 'youtu.be', 'twitter.com', 'x.com',
  'ok.ru', 'tiktok.com', 'linkedin.com',
];

function isSocial(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return SOCIAL_DOMAINS.some(d => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

function isExternal(href: string, ownDomain: string): boolean {
  try {
    const host = new URL(href).hostname;
    return !host.includes(ownDomain) && !isSocial(href);
  } catch {
    return false;
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/** Scroll a container to force lazy-loaded items into the DOM. */
async function scrollToLoad(
  page: Page,
  containerSel: string,
  targetCount: number,
  itemSel: string,
  maxScrolls = 12,
): Promise<void> {
  for (let i = 0; i < maxScrolls; i++) {
    const count = await page.$$eval(itemSel, els => els.length).catch(() => 0);
    if (count >= targetCount) break;

    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.scrollTop += 1200;
      else window.scrollBy(0, 1200);
    }, containerSel);

    // Wait for network to settle after scroll-triggered requests
    await page.waitForTimeout(1_500);
  }
}

/** Extract the first matching external website from <a> elements on the page. */
async function extractWebsite(page: Page, ownDomain: string): Promise<string | null> {
  return page.evaluate((domain) => {
    const anchors = Array.from(document.querySelectorAll('a[href^="http"]'));
    for (const a of anchors) {
      const href = (a as HTMLAnchorElement).href;
      try {
        const host = new URL(href).hostname;
        const social = [
          'vk.com','instagram.com','facebook.com','fb.com',
          't.me','telegram.me','wa.me','whatsapp.com',
          'youtube.com','youtu.be','twitter.com','x.com',
          'ok.ru','tiktok.com','linkedin.com',
        ];
        if (!host.includes(domain) && !social.some(s => host === s || host.endsWith('.' + s))) {
          return href;
        }
      } catch {}
    }
    return null;
  }, ownDomain);
}

/** Parse JSON-LD blocks and return the first LocalBusiness / Organization node. */
async function extractJsonLd(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(() => {
    const scripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]'),
    );
    for (const s of scripts) {
      try {
        const json = JSON.parse(s.textContent ?? '');
        const nodes = Array.isArray(json) ? json : [json];
        for (const node of nodes) {
          const type = (node['@type'] as string | undefined) ?? '';
          if (/LocalBusiness|Organization|Store|Service/.test(type)) return node;
        }
      } catch {}
    }
    return null;
  });
}

// ─── 2GIS ─────────────────────────────────────────────────────────────────────

/** Phase 1: open search page and collect unique firm page hrefs. */
async function get2GISFirmLinks(
  query: string,
  domain: string,
  num: number,
  context: BrowserContext,
): Promise<string[]> {
  const page = await context.newPage();
  try {
    const searchUrl = `https://${domain}/search/${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30_000 });

    // Wait for any firm link to appear; bail early on timeout
    await page.waitForSelector('a[href*="/firm/"]', { timeout: 12_000 }).catch(() => null);

    // Scroll the results sidebar to load more items
    await scrollToLoad(
      page,
      '._2TiF-, ._sidebar, [class*="search-result"], [class*="results-list"]',
      num,
      'a[href*="/firm/"]',
    );

    // Collect + deduplicate firm page URLs
    const links = await page.$$eval(
      'a[href*="/firm/"]',
      (els, d) => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const el of els) {
          const href = (el as HTMLAnchorElement).href;
          if (!href.includes('/firm/')) continue;
          // normalise: strip query string and hash
          const clean = href.split('?')[0].split('#')[0];
          if (!seen.has(clean)) { seen.add(clean); out.push(href); }
          if (out.length >= (d as number)) break;
        }
        return out;
      },
      num,
    );

    return links;
  } catch (err) {
    console.warn(`[2gis] search page failed for "${query}":`, (err as Error).message);
    return [];
  } finally {
    await page.close().catch(() => null);
  }
}

/** Phase 2: scrape a single 2GIS firm detail page. */
async function scrape2GISFirmPage(
  url: string,
  domain: string,
  context: BrowserContext,
): Promise<MapsResult | null> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

    // Give JS-rendered content time to settle
    await page.waitForTimeout(800);

    // 2GIS hides phone numbers behind a "show phone" button — click it if present.
    // Use text-based detection first — 2GIS obfuscates CSS class names heavily.
    try {
      const showBtn = page.getByRole('button', { name: /показать|позвонить|открыть/i }).first();
      if (await showBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await showBtn.click();
        await page.waitForTimeout(600);
      }
    } catch {}
    // Secondary fallback: attribute-based selectors (data-qa, data-testid)
    if (!(await page.$('a[href^="tel:"]').catch(() => null))) {
      for (const sel of [
        '[data-qa*="phone"]',
        '[data-testid*="phone"]',
        '[class*="phone"] button',
        'button[class*="phone"]',
      ]) {
        try {
          const btn = await page.$(sel);
          if (btn) { await btn.click(); await page.waitForTimeout(500); break; }
        } catch {}
      }
    }

    // Wait for tel: links to appear in DOM after possible reveal click
    await page.waitForSelector('a[href^="tel:"]', { timeout: 5_000 }).catch(() => null);

    // ── Strategy 1: JSON-LD ──
    const ld = await extractJsonLd(page);
    const ldName    = ld?.name    ? String(ld.name)    : null;
    const ldPhone   = ld?.telephone
      ? (typeof ld.telephone === 'string'
          ? ld.telephone
          : Array.isArray(ld.telephone)
          ? String((ld.telephone as unknown[])[0] ?? '')
          : null)
      : null;
    const ldWebsite = ld?.url   ? String(ld.url)   : null;
    const ldEmail   = ld?.email ? String(ld.email) : null;
    const ldAddress = ld?.address
      ? String((ld.address as { streetAddress?: string } | undefined)?.streetAddress ?? ld.address)
      : null;

    // ── Strategy 2: DOM extraction (always runs — fills gaps left by JSON-LD) ──
    const dom = await page.evaluate((domain) => {
      const nameEl = document.querySelector(
        '[data-qa*="title"] h1, [data-qa*="header"] h1, h1',
      ) as HTMLElement | null;
      const name = nameEl?.textContent?.trim() ?? '';

      const phones = Array.from(document.querySelectorAll('a[href^="tel:"]')).map(
        el => (el as HTMLAnchorElement).href.replace('tel:', '').trim(),
      );

      const addrEl = document.querySelector(
        '[itemprop="address"], [class*="address__value"], [class*="address-item"]',
      ) as HTMLElement | null;
      const address = addrEl?.textContent?.trim() ?? '';

      // Email: regex scan of visible page text
      const bodyText = (document.body as HTMLElement).innerText ?? '';
      const emailMatch = bodyText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      const email = emailMatch ? emailMatch[0] : null;

      const social = ['vk.com','instagram.com','facebook.com','t.me','wa.me','youtube.com','twitter.com','ok.ru','tiktok.com'];
      let website: string | null = null;
      for (const a of Array.from(document.querySelectorAll('a[href^="http"]'))) {
        const href = (a as HTMLAnchorElement).href;
        try {
          const host = new URL(href).hostname;
          if (!host.includes(domain) && !social.some(s => host === s || host.endsWith('.' + s))) {
            website = href;
            break;
          }
        } catch {}
      }

      return { name, phones, address, email, website };
    }, domain);

    // ── Merge: prefer JSON-LD, fill gaps from DOM ──
    const name = ldName || dom.name;
    if (!name) return null;

    return {
      name,
      address: ldAddress || dom.address,
      phone:   ldPhone   || dom.phones[0] || null,
      website: ldWebsite || dom.website   || null,
      email:   ldEmail   || dom.email     || null,
      source:  '2gis' as const,
    };
  } catch (err) {
    console.warn(`[2gis] firm page failed ${url}:`, (err as Error).message);
    return null;
  } finally {
    await page.close().catch(() => null);
  }
}

async function scrape2GIS(
  query: string,
  gl: string,
  num: number,
  context: BrowserContext,
): Promise<MapsResult[]> {
  const domain = DOMAIN_2GIS[gl] ?? '2gis.kz';

  console.log(`[2gis] searching "${query}" on ${domain} (num=${num})`);
  const firmLinks = await get2GISFirmLinks(query, domain, num, context);
  console.log(`[2gis] found ${firmLinks.length} firm links`);

  const results: MapsResult[] = [];
  const BATCH = 3; // parallel firm page visits

  for (let i = 0; i < firmLinks.slice(0, num).length; i += BATCH) {
    const batch = firmLinks.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(url => scrape2GISFirmPage(url, domain, context)),
    );
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value);
    }
  }

  console.log(`[2gis] scraped ${results.length} companies`);
  return results;
}

// ─── Yandex Maps ─────────────────────────────────────────────────────────────

/** Parse the Yandex Maps internal API JSON response (same schema as the paid API). */
function parseYandexApiJson(data: unknown, num: number): MapsResult[] {
  const features = ((data as Record<string, unknown>)?.features as Array<Record<string, unknown>>) ?? [];
  const results: MapsResult[] = [];

  for (const f of features.slice(0, num)) {
    const props = (f.properties as Record<string, unknown>) ?? {};
    const meta  = (props.CompanyMetaData as Record<string, unknown>) ?? {};
    const phones = (meta.Phones as Array<{ formatted?: string }>) ?? [];

    const name = String(meta.name ?? props.name ?? '').trim();
    if (!name) continue;

    results.push({
      name,
      address: String(meta.address ?? ''),
      phone:   phones[0]?.formatted ?? null,
      website: String(meta.url ?? '') || null,
      email:   String(meta.email ?? '') || null,
      source:  'yandex_maps' as const,
    });
  }

  return results;
}

/** DOM fallback — extract from result cards visible in the sidebar. */
async function scrapeYandexMapsDom(page: Page, num: number): Promise<MapsResult[]> {
  // Wait for at least one search result card
  const cardSel = [
    '.search-snippet-view',
    '[class*="search-business-snippet"]',
    '[class*="search-snippet"]',
    'li[class*="search-result"]',
  ].join(', ');

  await page.waitForSelector(cardSel, { timeout: 15_000 }).catch(() => null);

  return page.evaluate(
    ({ cardSel, num }) => {
      const cards = Array.from(document.querySelectorAll(cardSel)).slice(0, num);
      return cards.map(card => {
        const getText = (...sels: string[]) => {
          for (const s of sels) {
            const el = card.querySelector(s) as HTMLElement | null;
            if (el?.textContent?.trim()) return el.textContent.trim();
          }
          return '';
        };

        const name = getText(
          '[class*="title"]',
          '[class*="name"]',
          'h2', 'h3',
        );

        const address = getText(
          '[class*="address"]',
          '[class*="subtitle"]',
        );

        const phoneEl = card.querySelector('a[href^="tel:"]') as HTMLAnchorElement | null;
        const phone   = phoneEl?.href?.replace('tel:', '').trim() ?? null;

        const websiteEl = Array.from(card.querySelectorAll('a[href^="http"]')).find(a => {
          const href = (a as HTMLAnchorElement).href;
          return !href.includes('yandex') && !href.includes('maps');
        }) as HTMLAnchorElement | null;
        const website = websiteEl?.href ?? null;

        const cardText = (card as HTMLElement).innerText ?? '';
        const emailMatch = cardText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[0] : null;

        return { name, address, phone, website, email, source: 'yandex_maps' as const };
      }).filter(r => !!r.name);
    },
    { cardSel, num },
  );
}

async function scrapeYandexMaps(
  query: string,
  gl: string,
  num: number,
  context: BrowserContext,
): Promise<MapsResult[]> {
  const domain = DOMAIN_YANDEX[gl] ?? 'yandex.kz';
  const searchUrl = `https://${domain}/maps/?text=${encodeURIComponent(query)}`;

  const page = await context.newPage();
  let capturedResults: MapsResult[] | null = null;

  // ── Primary: intercept the internal Yandex Maps search API response ──
  // When the browser opens Yandex Maps and searches, it makes a request to
  // search-maps.yandex.ru (same endpoint as the paid API but authenticated
  // via the browser session). We capture and parse that JSON directly.
  page.on('response', async (response) => {
    if (capturedResults) return; // already captured
    const url = response.url();
    if (
      url.includes('search-maps.yandex') ||
      (url.includes('yandex') && url.includes('type=biz'))
    ) {
      try {
        const json = await response.json();
        const parsed = parseYandexApiJson(json, num);
        if (parsed.length > 0) capturedResults = parsed;
      } catch {}
    }
  });

  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 35_000 });

    // Give the interceptor a moment to finish processing async json()
    await page.waitForTimeout(1_000);

    const captured = capturedResults as MapsResult[] | null;
    if (captured && captured.length > 0) {
      console.log(`[yandex-maps] intercepted API response — ${captured.length} results`);
      return captured;
    }

    // ── Fallback: DOM scraping ──
    console.log('[yandex-maps] no API response captured — falling back to DOM scraping');

    // Scroll sidebar to load more results before extracting
    await scrollToLoad(
      page,
      '.sidebar, [class*="sidebar"], [class*="search-list"]',
      num,
      '.search-snippet-view, [class*="search-snippet"], [class*="search-business-snippet"]',
    );

    return await scrapeYandexMapsDom(page, num);
  } catch (err) {
    console.warn(`[yandex-maps] scrape failed for "${query}":`, (err as Error).message);
    return [];
  } finally {
    await page.close().catch(() => null);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type ScrapeMapEngine = '2gis' | 'yandex_maps' | 'both';

export interface ScrapeMapsConfig {
  engine?: ScrapeMapEngine;
  num?: number;
  gl?: string;
}

/**
 * Scrape business data from 2GIS and/or Yandex Maps using a headless browser.
 * Results are deduplicated by company name.
 */
export async function scrapeMaps(
  query: string,
  config: ScrapeMapsConfig = {},
): Promise<MapsResult[]> {
  const engine = config.engine ?? '2gis';
  const num    = config.num    ?? 20;
  const gl     = config.gl    ?? 'kz';

  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
    extraHTTPHeaders: { 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8' },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    if (engine === '2gis') {
      return await scrape2GIS(query, gl, num, context);
    }

    if (engine === 'yandex_maps') {
      return await scrapeYandexMaps(query, gl, num, context);
    }

    if (engine === 'both') {
      const seen    = new Set<string>();
      const results: MapsResult[] = [];

      const dedup = (r: MapsResult) => {
        const key = r.name.toLowerCase().trim();
        if (!seen.has(key)) { seen.add(key); results.push(r); }
      };

      const [twoGisRes, yandexRes] = await Promise.allSettled([
        scrape2GIS(query, gl, Math.ceil(num / 2), context),
        scrapeYandexMaps(query, gl, Math.ceil(num / 2), context),
      ]);

      if (twoGisRes.status  === 'fulfilled') twoGisRes.value.forEach(dedup);
      if (yandexRes.status  === 'fulfilled') yandexRes.value.forEach(dedup);

      return results;
    }

    throw new Error(`Unknown maps scrape engine: ${engine}`);
  } finally {
    await context.close().catch(() => null);
  }
}
