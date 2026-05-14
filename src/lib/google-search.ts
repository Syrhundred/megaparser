/**
 * API-backed web search: Google Custom Search, SerpAPI, Tavily, and Brave Search.
 *
 * Google Custom Search: 100 free queries/day — developers.google.com/custom-search
 * SerpAPI:              100 free queries/month — serpapi.com
 * Tavily:               1 000 free queries/month — tavily.com (no credit card needed)
 * Brave Search:         $5 free credit/month (~1 000 queries) — api-dashboard.search.brave.com
 */
import axios from 'axios';
import { SearchResult } from '@/types';

// ─── Region maps ─────────────────────────────────────────────────────────────

const GOOGLE_CR: Record<string, string> = {
  kz: 'countryKZ',
  ru: 'countryRU',
  uz: 'countryUZ',
  by: 'countryBY',
};

const SERP_CR: Record<string, string> = {
  kz: 'countryKZ',
  ru: 'countryRU',
  uz: 'countryUZ',
  by: 'countryBY',
};

const BRAVE_COUNTRY: Record<string, string> = {
  kz: 'KZ',
  ru: 'RU',
  uz: 'UZ',
  by: 'BY',
};

// ─── Google Custom Search API ─────────────────────────────────────────────────

async function searchViaGoogleApi(
  query: string,
  num: number,
  gl: string,
  apiKey: string,
  cx: string,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const batchSize = 10;
  const batches = Math.ceil(Math.min(num, 100) / batchSize);

  for (let i = 0; i < batches && results.length < num; i++) {
    const start = i * batchSize + 1;
    const { data } = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx,
        q: query,
        num: Math.min(batchSize, num - results.length),
        start,
        gl,
        cr: GOOGLE_CR[gl] ?? 'countryKZ',
        lr: 'lang_ru',
        hl: 'ru',
      },
      timeout: 15000,
    });

    const items: Array<{ title: string; link: string; snippet?: string }> = data.items ?? [];
    if (items.length === 0) break;
    for (const r of items) {
      results.push({ title: r.title, url: r.link, description: r.snippet ?? '' });
    }
  }

  return results;
}

// ─── SerpAPI ──────────────────────────────────────────────────────────────────

async function searchViaSerpApi(
  query: string,
  num: number,
  gl: string,
  apiKey: string,
): Promise<SearchResult[]> {
  const { data } = await axios.get('https://serpapi.com/search.json', {
    params: {
      q: query,
      api_key: apiKey,
      num,
      hl: 'ru',
      gl,
      cr: SERP_CR[gl] ?? 'countryKZ',
    },
    timeout: 15000,
  });
  const organic: Array<{ title: string; link: string; snippet?: string }> = data.organic_results ?? [];
  return organic.map(r => ({ title: r.title, url: r.link, description: r.snippet ?? '' }));
}

// ─── Tavily Search API ────────────────────────────────────────────────────────

const TAVILY_COUNTRY: Record<string, string> = {
  kz: 'kazakhstan',
  ru: 'russia',
  uz: 'uzbekistan',
  by: 'belarus',
};

async function searchViaTavily(
  query: string,
  num: number,
  gl: string,
  apiKey: string,
): Promise<SearchResult[]> {
  const country = TAVILY_COUNTRY[gl] ?? 'kazakhstan';

  const { data } = await axios.post(
    'https://api.tavily.com/search',
    {
      api_key: apiKey,
      query,
      topic: 'general',
      country,
      search_depth: 'basic',
      max_results: Math.min(num, 20),
      include_answer: false,
    },
    { timeout: 15000 },
  );

  const results: Array<{ title: string; url: string; content?: string }> = data.results ?? [];
  return results.map(r => ({ title: r.title, url: r.url, description: r.content ?? '' }));
}

// ─── Brave Search API ─────────────────────────────────────────────────────────

async function searchViaBrave(
  query: string,
  num: number,
  gl: string,
  apiKey: string,
): Promise<SearchResult[]> {
  const { data } = await axios.get('https://api.search.brave.com/res/v1/web/search', {
    params: {
      q: query,
      count: Math.min(num, 20),
      country: BRAVE_COUNTRY[gl] ?? 'KZ',
      search_lang: 'ru',
      ui_lang: 'ru-RU',
    },
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    timeout: 15000,
  });

  const items: Array<{ title: string; url: string; description?: string }> = data.web?.results ?? [];
  return items.map(r => ({ title: r.title, url: r.url, description: r.description ?? '' }));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type SearchEngine = 'google' | 'serpapi' | 'tavily' | 'brave';

export interface SearchConfig {
  engine?: SearchEngine;
  num?: number;
  gl?: string;
  googleApiKey?: string;
  googleCx?: string;
  serpApiKey?: string;
  tavilyApiKey?: string;
  braveApiKey?: string;
}

export async function searchCompanies(query: string, config: SearchConfig = {}): Promise<SearchResult[]> {
  const num    = config.num    ?? 10;
  const gl     = config.gl    ?? 'kz';
  const engine = config.engine ?? 'google';

  if (engine === 'google') {
    if (!config.googleApiKey) throw new Error('Google API Key не настроен. Перейдите в Настройки.');
    if (!config.googleCx)     throw new Error('Google CX (Search Engine ID) не настроен. Перейдите в Настройки.');
    return searchViaGoogleApi(query, num, gl, config.googleApiKey, config.googleCx);
  }

  if (engine === 'serpapi') {
    if (!config.serpApiKey) throw new Error('SerpAPI Key не настроен. Перейдите в Настройки.');
    return searchViaSerpApi(query, num, gl, config.serpApiKey);
  }

  if (engine === 'tavily') {
    if (!config.tavilyApiKey) throw new Error('Tavily API Key не настроен. Перейдите в Настройки.');
    return searchViaTavily(query, num, gl, config.tavilyApiKey);
  }

  if (engine === 'brave') {
    if (!config.braveApiKey) throw new Error('Brave Search API Key не настроен. Перейдите в Настройки.');
    return searchViaBrave(query, num, gl, config.braveApiKey);
  }

  throw new Error(`Неизвестный движок: ${engine}`);
}
