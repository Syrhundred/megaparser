import axios from 'axios';
import * as cheerio from 'cheerio';
import { BrowserContext, Page } from 'playwright';
import { getBrowser } from './browser';

// ─── Regexes ────────────────────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Russian/Kazakh numbers: +7 or 8 prefix, various separators including dots
const PHONE_RE_RU = /(?:\+7|8)[\s\-.(]*\(?\d{3}\)?[\s\-.)]*\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2}/g;
// International CIS: +998 (UZ), +375 (BY), +380 (UA), +996 (KG)
const PHONE_RE_INTL = /\+(?:998|375|380|996)[\s\-.(]?\d{2,3}[\s\-.)]*\d{3}[\s\-.]?\d{2}[\s\-.]?\d{2}/g;

const WA_RE = /(?:wa\.me|api\.whatsapp\.com\/send\?phone=|whatsapp:\/\/)[\s"']?(\+?[\d]+)/i;

// Obfuscated email patterns — English + Russian («собака» = @)
const OBFUSCATED_EMAIL_RES: RegExp[] = [
  /([a-zA-Z0-9._%+\-]+)\s*[\[\(]at[\)\]]\s*([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi,
  /([a-zA-Z0-9._%+\-]+)\s*\(собака\)\s*([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi,
  /([a-zA-Z0-9._%+\-]+)\s*\[собака\]\s*([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi,
  /([a-zA-Z0-9._%+\-]+)\s+@\s+([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g, // spaced @
];

// ─── Contact page scoring ────────────────────────────────────────────────────

const CONTACT_KW = [
  'contact', 'contacts', 'контакт', 'контакты', 'about', 'о нас', 'о компании',
  'связаться', 'связь', 'обратная', 'feedback', 'reach-us', 'reach_us',
  'get-in-touch', 'getintouch', 'write-to-us', 'about-us', 'aboutus',
  'connect', 'support', 'поддержка', 'help', 'офис', 'office',
  'реквизиты', 'адрес', 'address', 'location', 'reach',
];

function scoreUrl(url: string): number {
  const low = url.toLowerCase();
  let score = 0;
  for (const kw of CONTACT_KW) {
    if (low.includes(kw)) score += kw.length;
  }
  return score;
}

// ─── Email filtering ─────────────────────────────────────────────────────────

const IGNORE_EMAIL_PARTS = [
  'example', 'test', 'domain', '@sentry', '@schema', 'noreply', 'no-reply',
  '@2x', '.png', '.jpg', '.svg', '.gif', '.woff', '.ttf', 'wixpress',
  '@emailjs', 'youremail', 'email@email', '@example', 'user@user',
  'name@name', 'mail@mail', 'info@info', 'support@support',
];

function isValidEmail(email: string): boolean {
  const low = email.toLowerCase();
  if (IGNORE_EMAIL_PARTS.some(p => low.includes(p))) return false;
  if (email.length > 100) return false;
  const atIdx = email.lastIndexOf('@');
  if (atIdx < 1) return false;
  const domain = email.slice(atIdx + 1);
  const tld = domain.split('.').pop() ?? '';
  if (tld.length < 2 || /^\d+$/.test(tld)) return false;
  return true;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScrapeResult {
  emails: string[];
  phones: string[];
  whatsapp: string | null;
  hasForm: boolean;
  contactPageUrl: string | null;
  pagesVisited: number;
  /** true when the homepage appears to be a client-side SPA */
  jsRendered: boolean;
}

// ─── Playwright page fetch ────────────────────────────────────────────────────

const PAGE_TIMEOUT = 30_000; // 30 s hard timeout per page

/**
 * Navigate to a URL with Playwright and return the fully-rendered HTML.
 * Waits for network to go idle so JS-rendered content is present.
 * Falls back to whatever is available on timeout rather than throwing.
 */
async function fetchPagePlaywright(
  url: string,
  context: BrowserContext,
): Promise<string | null> {
  let page: Page | null = null;
  try {
    page = await context.newPage();

    // Block heavy assets that don't affect contact extraction
    await page.route('**/*.{woff,woff2,ttf,eot,otf,mp4,webm,mp3,wav,ogg,ico}', (r) =>
      r.abort(),
    );

    await page.goto(url, {
      timeout: PAGE_TIMEOUT,
      waitUntil: 'networkidle',
    });

    return await page.content();
  } catch (err: unknown) {
    // On timeout, try to grab whatever content is already loaded
    if (page) {
      try {
        return await page.content();
      } catch {}
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('net::ERR') && !msg.includes('timeout')) {
      console.warn(`[scraper] fetchPage error ${url}: ${msg}`);
    }
    return null;
  } finally {
    if (page && !page.isClosed()) {
      await page.close().catch(() => null);
    }
  }
}

// ─── HTTP fetch (used only for plain text/XML like robots.txt, sitemaps) ─────

async function fetchPageHttp(url: string, timeout = 10_000): Promise<string | null> {
  try {
    const resp = await axios.get<string>(url, {
      timeout,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      },
      maxRedirects: 5,
    });
    return typeof resp.data === 'string' ? resp.data : null;
  } catch {
    return null;
  }
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function scrapeCompany(websiteUrl: string): Promise<ScrapeResult> {
  const result: ScrapeResult = {
    emails: [],
    phones: [],
    whatsapp: null,
    hasForm: false,
    contactPageUrl: null,
    pagesVisited: 0,
    jsRendered: false,
  };

  // Only scrape real http/https websites — skip 2GIS firm pages, maps:// placeholders, etc.
  if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
    return result;
  }
  if (websiteUrl.includes('2gis.ru/firm/') || websiteUrl.startsWith('internal://')) {
    return result;
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(websiteUrl);
  } catch {
    return result;
  }

  // Each company scrape gets its own isolated BrowserContext (separate
  // cookies, storage, etc.) but shares the single Playwright Browser instance.
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
    extraHTTPHeaders: { 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8' },
    // Stealth: override navigator.webdriver
    javaScriptEnabled: true,
  });

  // Intercept navigator.webdriver fingerprint at the context level
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    // 1. Fetch homepage — try https, fall back to http
    let homepageHtml = await fetchPagePlaywright(websiteUrl, context);
    if (!homepageHtml && websiteUrl.startsWith('https://')) {
      const httpUrl = websiteUrl.replace('https://', 'http://');
      homepageHtml = await fetchPagePlaywright(httpUrl, context);
      if (homepageHtml) {
        try { baseUrl = new URL(httpUrl); } catch {}
      }
    }
    if (!homepageHtml) return result;
    result.pagesVisited++;

    // 2. Detect JS-rendered SPA
    const $detect = cheerio.load(homepageHtml);
    const bodyText = $detect('body').text().replace(/\s+/g, ' ').trim();
    const hasSpaMount = $detect('#root, #app, #__next, [data-reactroot]').length > 0;
    // With Playwright the SPA is rendered — so we only flag it if body is still empty
    // after rendering (truly broken or heavily auth-gated site)
    if (hasSpaMount && bodyText.length < 200) {
      result.jsRendered = true;
    }

    // 3. Extract from homepage — footer/header usually has contacts
    extractFromHtml(homepageHtml, result);

    // 4. Collect candidate URLs from homepage links + sitemap
    const seen = new Set<string>([websiteUrl]);
    const candidates: string[] = [];

    const $home = cheerio.load(homepageHtml);
    $home('a[href]').each((_, el) => {
      const href = $home(el).attr('href') ?? '';
      try {
        const full = href.startsWith('http') ? href : new URL(href, baseUrl).href;
        if (
          full.includes(baseUrl.hostname) &&
          !full.includes('#') &&
          !seen.has(full) &&
          !full.match(/\.(pdf|jpg|jpeg|png|gif|css|js|ico|woff|woff2|ttf|zip|rar|xml)$/i)
        ) {
          seen.add(full);
          candidates.push(full);
        }
      } catch {}
    });

    // Sitemap discovery — uses plain HTTP since XML needs no JS rendering
    const sitemapUrls = await fetchSitemapUrls(baseUrl);
    for (const u of sitemapUrls) {
      if (u.includes(baseUrl.hostname) && !seen.has(u)) {
        seen.add(u);
        candidates.push(u);
      }
    }

    // 5. Score + sort: contact-like pages first
    const sorted = candidates
      .map(url => ({ url, score: scoreUrl(url) }))
      .sort((a, b) => b.score - a.score);

    const highPriority = sorted.filter(x => x.score > 0).map(x => x.url);
    const lowPriority  = sorted.filter(x => x.score === 0).slice(0, 5).map(x => x.url);
    const toVisit      = [...highPriority, ...lowPriority];

    // 6. Parallel batch fetch — 4 concurrent pages, max 20 total
    const BATCH_SIZE = 4;
    const MAX_PAGES  = 20;

    for (let i = 0; i < toVisit.length && result.pagesVisited < MAX_PAGES; i += BATCH_SIZE) {
      // Early exit once we have enough data
      if (result.emails.length >= 3 && result.phones.length >= 1 && result.contactPageUrl) break;

      const batch = toVisit.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(
        batch.map(url => fetchPagePlaywright(url, context).then(html => ({ url, html }))),
      );

      for (const r of settled) {
        if (r.status !== 'fulfilled' || !r.value.html) continue;
        result.pagesVisited++;
        const { url, html } = r.value;
        const prevEmailCount = result.emails.length;
        extractFromHtml(html, result);

        if (!result.contactPageUrl && result.emails.length > prevEmailCount) {
          result.contactPageUrl = url;
        }
      }
    }
  } finally {
    // Always close the context — frees memory and closes all its pages
    await context.close().catch(() => null);
  }

  return result;
}

// ─── Sitemap parsing (plain HTTP — no JS needed) ──────────────────────────────

async function fetchSitemapUrls(baseUrl: URL): Promise<string[]> {
  const urls: string[] = [];

  const sitemapCandidates: string[] = [];
  const robotsTxt = await fetchPageHttp(`${baseUrl.origin}/robots.txt`, 5_000);
  if (robotsTxt) {
    for (const line of robotsTxt.split('\n')) {
      const m = line.match(/^Sitemap:\s*(.+)/i);
      if (m) sitemapCandidates.push(m[1].trim());
    }
  }

  sitemapCandidates.push(
    `${baseUrl.origin}/sitemap.xml`,
    `${baseUrl.origin}/sitemap_index.xml`,
    `${baseUrl.origin}/sitemap`,
  );

  for (const sitemapUrl of sitemapCandidates) {
    const xml = await fetchPageHttp(sitemapUrl, 8_000);
    if (!xml) continue;

    const $ = cheerio.load(xml, { xmlMode: true });

    // Sitemap index — one level of recursion
    const nestedSitemaps: string[] = [];
    $('sitemapindex sitemap loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc.endsWith('.xml')) nestedSitemaps.push(loc);
    });

    for (const nested of nestedSitemaps.slice(0, 5)) {
      const nestedXml = await fetchPageHttp(nested, 8_000);
      if (!nestedXml) continue;
      const $n = cheerio.load(nestedXml, { xmlMode: true });
      $n('urlset url loc').each((_, el) => {
        const loc = $n(el).text().trim();
        if (loc.startsWith('http')) urls.push(loc);
      });
    }

    $('urlset url loc').each((_, el) => {
      const loc = $(el).text().trim();
      if (loc.startsWith('http')) urls.push(loc);
    });

    if (urls.length > 0) break;
  }

  return urls;
}

// ─── Extraction ───────────────────────────────────────────────────────────────

// ─── Cloudflare email protection decoder ─────────────────────────────────────
// Cloudflare replaces emails with XOR-encoded hex in href="/cdn-cgi/l/email-protection#HEXHEX"
// and data-cfemail="HEXHEX". First byte is the XOR key; remaining pairs are the email chars.
function decodeCloudflareEmail(encoded: string): string {
  try {
    const key = parseInt(encoded.substring(0, 2), 16);
    let email = '';
    for (let i = 2; i < encoded.length; i += 2) {
      email += String.fromCharCode(parseInt(encoded.substring(i, i + 2), 16) ^ key);
    }
    return email;
  } catch {
    return '';
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function addEmail(raw: string, result: ScrapeResult) {
  const clean = raw.trim().toLowerCase();
  if (!isValidEmail(clean)) return;
  if (!result.emails.some(e => e.toLowerCase() === clean)) {
    result.emails.push(clean);
  }
}

function addPhone(raw: string, result: ScrapeResult) {
  const cleaned = raw.replace(/\s/g, '');
  if (cleaned.length >= 10 && !result.phones.includes(cleaned)) {
    result.phones.push(cleaned);
  }
}

function extractFromHtml(html: string, result: ScrapeResult) {
  const $ = cheerio.load(html);
  const rawText = $.text();
  const decodedText = decodeHtmlEntities(rawText);
  const decodedHtml = decodeHtmlEntities(html);

  // ── Emails ──

  for (const source of [decodedText, decodedHtml]) {
    for (const e of (source.match(EMAIL_RE) ?? [])) addEmail(e, result);
  }

  for (const re of OBFUSCATED_EMAIL_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(decodedText)) !== null) {
      addEmail(`${m[1]}@${m[2]}`, result);
    }
  }

  $('a[href^="mailto:"]').each((_, el) => {
    const raw = decodeHtmlEntities($(el).attr('href') ?? '')
      .replace(/^mailto:/i, '')
      .split('?')[0]
      .trim();
    if (raw) addEmail(raw, result);
  });

  $('[data-email], [data-mail]').each((_, el) => {
    const v = $(el).attr('data-email') ?? $(el).attr('data-mail') ?? '';
    if (v) addEmail(v, result);
  });

  // ── Cloudflare email protection (/cdn-cgi/l/email-protection#HEXHEX) ──
  // Very common on WordPress + Cloudflare sites: the real email is XOR-encoded
  // in the href fragment or data-cfemail attribute.
  $('a[href*="/cdn-cgi/l/email-protection"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    const encoded = href.split('#')[1];
    if (encoded) addEmail(decodeCloudflareEmail(encoded), result);
  });
  $('[data-cfemail]').each((_, el) => {
    const encoded = $(el).attr('data-cfemail') ?? '';
    if (encoded) addEmail(decodeCloudflareEmail(encoded), result);
  });

  // ── CSS-split email spans (anti-spam: text split across multiple elements) ──
  // e.g. <span>info</span><span style="display:none">X</span><span>@company.kz</span>
  // Strategy: concatenate text of sibling inline elements and re-run EMAIL_RE.
  $('p, div, li, td, span').each((_, el) => {
    const inline = $(el).children('span, a, b, strong, em').length;
    if (inline >= 2) {
      const joined = $(el).children().toArray().map(c => $(c).text()).join('');
      for (const e of (joined.match(EMAIL_RE) ?? [])) addEmail(e, result);
    }
  });

  // ── Unicode / zero-width character obfuscation ──
  // Some sites insert zero-width spaces (U+200B) or soft hyphens inside the address.
  const stripped = decodedText
    .replace(/\u200B|\u00AD|\u200C|\u200D|\uFEFF/g, '') // strip invisible chars
    .replace(/\s*\[at\]\s*/gi, '@')                      // [at] → @
    .replace(/\s*\(at\)\s*/gi, '@');                     // (at) → @
  for (const e of (stripped.match(EMAIL_RE) ?? [])) addEmail(e, result);

  // ── Phones ──

  $('a[href^="tel:"]').each((_, el) => {
    const raw = $(el).attr('href')?.replace(/^tel:/i, '').trim() ?? '';
    if (raw) addPhone(raw, result);
  });

  for (const re of [PHONE_RE_RU, PHONE_RE_INTL]) {
    re.lastIndex = 0;
    for (const p of (decodedText.match(re) ?? [])) addPhone(p, result);
  }

  $('[data-phone], [data-tel]').each((_, el) => {
    const v = $(el).attr('data-phone') ?? $(el).attr('data-tel') ?? '';
    if (v) addPhone(v, result);
  });

  // ── JSON-LD structured data ──
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html() ?? '');
      extractFromJsonLd(Array.isArray(json) ? json : [json], result);
    } catch {}
  });

  // ── WhatsApp ──
  if (!result.whatsapp) {
    const m = decodedHtml.match(WA_RE);
    if (m) result.whatsapp = m[1];

    $('a[href]').each((_, el) => {
      if (result.whatsapp) return;
      const href = $(el).attr('href') ?? '';
      if (href.includes('wa.me') || href.includes('whatsapp')) {
        const wm = href.match(/wa\.me\/(\+?[\d]+)/);
        if (wm) result.whatsapp = wm[1];
      }
    });
  }

  // ── Contact form ──
  if (!result.hasForm) {
    $('form').each((_, form) => {
      const fHtml = ($(form).html() ?? '').toLowerCase();
      if (
        fHtml.includes('email')     || fHtml.includes('message') ||
        fHtml.includes('сообщение') || fHtml.includes('почта')   ||
        fHtml.includes('name')      || fHtml.includes('имя')
      ) {
        result.hasForm = true;
      }
    });
  }
}

function extractFromJsonLd(nodes: unknown[], result: ScrapeResult) {
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    const obj = node as Record<string, unknown>;
    if (typeof obj.email === 'string')     addEmail(obj.email, result);
    if (typeof obj.telephone === 'string') addPhone(obj.telephone, result);
    for (const val of Object.values(obj)) {
      if (Array.isArray(val))           extractFromJsonLd(val, result);
      else if (typeof val === 'object') extractFromJsonLd([val], result);
    }
  }
}
