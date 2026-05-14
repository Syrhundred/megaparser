import { NextRequest, NextResponse } from 'next/server';
import { searchMaps, MapsEngine, MapsResult } from '@/lib/maps-search';
import { scrapeMaps, ScrapeMapEngine } from '@/lib/maps-scraper';
import { prisma } from '@/lib/prisma';

// Playwright scraper needs more time than the default
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const { query, num = 20, gl = 'kz' } = await req.json() as {
    query: string;
    num?: number;
    gl?: string;
  };

  if (!query?.trim()) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 });
  }

  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: ['maps_engine', 'default_gl', 'yandex_maps_api_key', 'google_api_key', 'twogis_api_key'],
      },
    },
  });
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;

  const engine       = (s.maps_engine || '2gis') as MapsEngine;
  const resolvedGl   = gl || s.default_gl || 'kz';
  const yandexApiKey = s.yandex_maps_api_key || process.env.YANDEX_MAPS_API_KEY || '';
  const googleApiKey = s.google_api_key      || process.env.GOOGLE_API_KEY       || '';
  const twoGisApiKey = s.twogis_api_key      || process.env.TWOGIS_API_KEY       || '';

  // Check if API keys are available for the chosen engine
  const hasKey =
    (engine === '2gis'         && !!twoGisApiKey) ||
    (engine === 'yandex_maps'  && !!yandexApiKey) ||
    (engine === 'google_places' && !!googleApiKey) ||
    (engine === 'both'         && (!!twoGisApiKey || !!yandexApiKey || !!googleApiKey));

  try {
    let results: MapsResult[];

    if (!hasKey && (engine === '2gis' || engine === 'yandex_maps')) {
      // No API key — use the free Playwright scraper instead
      results = await scrapeMaps(query, {
        engine: engine as ScrapeMapEngine,
        num,
        gl: resolvedGl,
      });
    } else {
      results = await searchMaps(query, {
        engine,
        num,
        gl: resolvedGl,
        yandexApiKey,
        googleApiKey,
        twoGisApiKey,
      });
    }

    // Annotate each result with the DB company id if it was already added.
    // Use the same key the maps-scrape worker uses when upserting.
    const keys = results.map(
      r => r.website ?? `maps://${r.source}/${encodeURIComponent(r.name)}`,
    );
    const existing = await prisma.company.findMany({
      where: { website: { in: keys } },
      select: { id: true, website: true },
    });
    const byKey = new Map(existing.map(c => [c.website, c.id]));
    const enriched = results.map(r => ({
      ...r,
      existingId: byKey.get(r.website ?? `maps://${r.source}/${encodeURIComponent(r.name)}`) ?? null,
    }));

    return NextResponse.json({ results: enriched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Maps search failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
