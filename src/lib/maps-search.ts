/**
 * Maps-based company search: Yandex Maps Business API, Google Places API, and 2GIS Places API.
 * All return structured contact data (phone, website) directly — no scraping needed.
 *
 * Yandex Maps Business Search:
 *   Free: 500 requests/day
 *   Key:  developer.tech.yandex.ru → "API Поиска по организациям"
 *
 * Google Places API (New):
 *   Free: $200/month credit ≈ ~1 600 Text Search calls/month
 *   Key:  same Google API key — enable "Places API (New)" in Google Console
 *
 * 2GIS Places API:
 *   Free demo key available at dev.2gis.com — best for Russia/Kazakhstan/CIS
 *   Key:  dev.2gis.com → Platform Manager → create demo key
 */
import axios from 'axios';

export interface MapsResult {
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  source: 'yandex_maps' | 'google_places' | '2gis';
}

// ─── Yandex Maps Business Search ──────────────────────────────────────────────

const YANDEX_LANG: Record<string, string> = {
  kz: 'ru_KZ',
  ru: 'ru_RU',
  uz: 'uz_UZ',
  by: 'ru_BY',
};

// Bounding boxes keep results inside the target country (rspn=1 enforces the bbox)
const YANDEX_BBOX: Record<string, { ll: string; spn: string }> = {
  kz: { ll: '66.5,48.5', spn: '28,12' },
  ru: { ll: '60.0,58.0', spn: '58,28' },
  uz: { ll: '63.2,41.5', spn: '11,7'  },
  by: { ll: '28.0,53.5', spn: '8,4'   },
};

async function searchYandexMaps(
  query: string,
  num: number,
  gl: string,
  apiKey: string,
): Promise<MapsResult[]> {
  const bbox = YANDEX_BBOX[gl];

  const { data } = await axios.get('https://search-maps.yandex.ru/v1/', {
    params: {
      text: query,
      type: 'biz',
      lang: YANDEX_LANG[gl] ?? 'ru_KZ',
      results: Math.min(num, 50),
      apikey: apiKey,
      ...(bbox ? { ll: bbox.ll, spn: bbox.spn, rspn: 1 } : {}),
    },
    timeout: 15000,
  });

  const features: Array<Record<string, unknown>> = (data?.features as Array<Record<string, unknown>>) ?? [];

  return features.map(f => {
    const props = (f.properties as Record<string, unknown>) ?? {};
    const meta  = (props.CompanyMetaData as Record<string, unknown>) ?? {};
    const phones = (meta.Phones as Array<{ formatted?: string }>) ?? [];

    return {
      name:    String(meta.name    ?? props.name ?? ''),
      address: String(meta.address ?? ''),
      phone:   phones[0]?.formatted ?? null,
      website: String(meta.url ?? '') || null,
      email:   null,
      source:  'yandex_maps' as const,
    };
  });
}

// ─── Google Places API (New, v1) ──────────────────────────────────────────────

const PLACES_REGION: Record<string, string> = {
  kz: 'KZ',
  ru: 'RU',
  uz: 'UZ',
  by: 'BY',
};

async function searchGooglePlaces(
  query: string,
  num: number,
  gl: string,
  apiKey: string,
): Promise<MapsResult[]> {
  const { data } = await axios.post(
    'https://places.googleapis.com/v1/places:searchText',
    {
      textQuery: query,
      languageCode: 'ru',
      regionCode: PLACES_REGION[gl] ?? 'KZ',
      maxResultCount: Math.min(num, 20),
    },
    {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': [
          'places.displayName',
          'places.formattedAddress',
          'places.nationalPhoneNumber',
          'places.internationalPhoneNumber',
          'places.websiteUri',
        ].join(','),
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    },
  );

  const places: Array<Record<string, unknown>> = (data?.places as Array<Record<string, unknown>>) ?? [];

  return places.map(p => ({
    name:    ((p.displayName as { text?: string } | undefined)?.text) ?? '',
    address: String(p.formattedAddress ?? ''),
    phone:   String(p.nationalPhoneNumber ?? p.internationalPhoneNumber ?? '') || null,
    website: String(p.websiteUri ?? '') || null,
    email:   null,
    source:  'google_places' as const,
  }));
}

// ─── 2GIS Places API ──────────────────────────────────────────────────────────

// 2GIS city codes used to constrain search to the target country
const TWOGIS_REGION_QUERY: Record<string, string> = {
  kz: ' Казахстан',
  ru: ' Россия',
  uz: ' Узбекистан',
  by: ' Беларусь',
};

interface TwoGisContact {
  type: string;
  value: string;
  text?: string;
}

interface TwoGisContactGroup {
  contacts?: TwoGisContact[];
}

interface TwoGisItem {
  id?: string;
  name?: string;
  address_name?: string;
  full_name?: string;
  contact_groups?: TwoGisContactGroup[];
}

async function searchVia2GIS(
  query: string,
  num: number,
  gl: string,
  apiKey: string,
): Promise<MapsResult[]> {
  const regionSuffix = TWOGIS_REGION_QUERY[gl] ?? ' Казахстан';

  const { data } = await axios.get('https://catalog.api.2gis.com/3.0/items', {
    params: {
      q: query + regionSuffix,
      key: apiKey,
      fields: 'items.contact_groups,items.address,items.point',
      type: 'branch',
      page_size: Math.min(num, 50),
      lang: 'ru',
    },
    timeout: 15000,
  });

  const items: TwoGisItem[] = (data?.result?.items as TwoGisItem[]) ?? [];

  return items.map(item => {
    const contacts: TwoGisContact[] = item.contact_groups?.flatMap(g => g.contacts ?? []) ?? [];

    const phone = contacts.find(c => c.type === 'phone')?.text
               ?? contacts.find(c => c.type === 'phone')?.value
               ?? null;

    // Only keep real http/https website URLs — 2GIS sometimes returns maps:// deep links
    const rawWebsite = contacts.find(c => c.type === 'website')?.value ?? null;
    const website = rawWebsite?.startsWith('http') ? rawWebsite : null;

    const email = contacts.find(c => c.type === 'email')?.value ?? null;

    return {
      name:      item.full_name ?? item.name ?? '',
      address:   item.address_name ?? '',
      phone,
      website,
      email,
      source:    '2gis' as const,
      twoGisId:  item.id ?? undefined,
    };
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type MapsEngine = 'yandex_maps' | 'google_places' | '2gis' | 'both';

export interface MapsSearchConfig {
  engine?: MapsEngine;
  num?: number;
  gl?: string;
  yandexApiKey?: string;
  googleApiKey?: string;
  twoGisApiKey?: string;
}

export async function searchMaps(
  query: string,
  config: MapsSearchConfig = {},
): Promise<MapsResult[]> {
  const num    = config.num    ?? 20;
  const gl     = config.gl    ?? 'kz';
  const engine = config.engine ?? 'yandex_maps';

  if (engine === 'yandex_maps') {
    if (!config.yandexApiKey) throw new Error('Yandex Maps API Key не настроен. Перейдите в Настройки.');
    return searchYandexMaps(query, num, gl, config.yandexApiKey);
  }

  if (engine === 'google_places') {
    if (!config.googleApiKey) throw new Error('Google API Key не настроен. Перейдите в Настройки.');
    return searchGooglePlaces(query, num, gl, config.googleApiKey);
  }

  if (engine === '2gis') {
    if (!config.twoGisApiKey) throw new Error('2GIS API Key не настроен. Перейдите в Настройки.');
    return searchVia2GIS(query, num, gl, config.twoGisApiKey);
  }

  if (engine === 'both') {
    const results: MapsResult[] = [];
    const seen   = new Set<string>();
    const errors: string[] = [];

    const add = (r: MapsResult) => {
      const key = r.name.toLowerCase().trim();
      if (!seen.has(key)) { seen.add(key); results.push(r); }
    };

    if (config.twoGisApiKey) {
      try {
        for (const r of await searchVia2GIS(query, num, gl, config.twoGisApiKey)) add(r);
      } catch (e) {
        errors.push(`2GIS: ${e instanceof Error ? e.message : String(e)}`);
        console.error('[maps:2gis]', e);
      }
    }

    if (config.yandexApiKey && results.length < num) {
      try {
        for (const r of await searchYandexMaps(query, num - results.length, gl, config.yandexApiKey)) add(r);
      } catch (e) {
        errors.push(`Yandex Maps: ${e instanceof Error ? e.message : String(e)}`);
        console.error('[maps:yandex]', e);
      }
    }

    if (config.googleApiKey && results.length < num) {
      try {
        for (const r of await searchGooglePlaces(query, num - results.length, gl, config.googleApiKey)) add(r);
      } catch (e) {
        errors.push(`Google Places: ${e instanceof Error ? e.message : String(e)}`);
        console.error('[maps:google_places]', e);
      }
    }

    if (results.length === 0 && errors.length > 0) {
      throw new Error(`Поиск по картам не дал результатов:\n${errors.join('\n')}`);
    }
    return results;
  }

  throw new Error(`Неизвестный движок карт: ${engine}`);
}
