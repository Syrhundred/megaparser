import { NextRequest, NextResponse } from 'next/server';
import { searchCompanies, SearchEngine } from '@/lib/google-search';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const { query, num = 10, gl = 'kz' } = await req.json() as {
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
        in: [
          'search_engine', 'default_gl',
          'serpapi_key', 'google_api_key', 'google_cx',
          'tavily_api_key', 'brave_api_key',
        ],
      },
    },
  });
  const s: Record<string, string> = {};
  for (const r of rows) s[r.key] = r.value;

  const engine       = (s.search_engine || 'google') as SearchEngine;
  const resolvedGl   = gl || s.default_gl || 'kz';
  const serpApiKey   = s.serpapi_key    || process.env.SERPAPI_KEY    || '';
  const googleApiKey = s.google_api_key || process.env.GOOGLE_API_KEY || '';
  const googleCx     = s.google_cx      || process.env.GOOGLE_CX      || '';
  const tavilyApiKey = s.tavily_api_key || process.env.TAVILY_API_KEY || '';
  const braveApiKey  = s.brave_api_key  || process.env.BRAVE_API_KEY  || '';

  try {
    const results = await searchCompanies(query, {
      engine,
      num,
      gl: resolvedGl,
      serpApiKey,
      googleApiKey,
      googleCx,
      tavilyApiKey,
      braveApiKey,
    });

    // Annotate each result with the DB company id if it was already added
    const urls = results.map(r => r.url);
    const existing = await prisma.company.findMany({
      where: { website: { in: urls } },
      select: { id: true, website: true },
    });
    const byUrl = new Map(existing.map(c => [c.website, c.id]));
    const enriched = results.map(r => ({ ...r, existingId: byUrl.get(r.url) ?? null }));

    return NextResponse.json({ results: enriched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Search failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
