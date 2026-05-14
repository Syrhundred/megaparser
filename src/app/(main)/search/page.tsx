'use client';

import { useState } from 'react';
import { Search, Plus, ExternalLink, CheckCircle, Loader2, AlertCircle, Map, Globe, Phone, Mail, MapPin } from 'lucide-react';
import { SearchResult, MapsResult } from '@/types';

const PRESET_QUERIES = [
  'КТП купить',
  'БКТП Казахстан',
  'шкафы управления производство',
  'электрощитовое оборудование',
  'подстанции 35 кВ',
  'трансформаторные подстанции производитель',
];

type SearchMode = 'web' | 'maps';

export default function SearchPage() {
  const [mode, setMode] = useState<SearchMode>('web');
  const [query, setQuery] = useState('');
  const [num, setNum] = useState(10);
  const [gl, setGl] = useState('kz');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Web search state
  const [webResults, setWebResults] = useState<SearchResult[]>([]);
  const [selectedWeb, setSelectedWeb] = useState<Set<number>>(new Set());
  const [addedWebUrls, setAddedWebUrls] = useState<Set<string>>(new Set());

  // Maps search state
  const [mapsResults, setMapsResults] = useState<MapsResult[]>([]);
  const [selectedMaps, setSelectedMaps] = useState<Set<number>>(new Set());
  const [addedMapsIdx, setAddedMapsIdx] = useState<Set<number>>(new Set());

  const [adding, setAdding] = useState(false);

  async function handleSearch(q = query) {
    if (!q.trim()) return;
    setLoading(true);
    setError('');
    setWebResults([]);
    setMapsResults([]);
    setSelectedWeb(new Set());
    setSelectedMaps(new Set());

    try {
      const endpoint = mode === 'maps' ? '/api/search/maps' : '/api/search';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, num, gl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (mode === 'maps') setMapsResults(data.results);
      else setWebResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка поиска');
    } finally {
      setLoading(false);
    }
  }

  // ── Web add ──
  async function addWebSelected() {
    const toAdd = Array.from(selectedWeb).map(i => webResults[i]);
    setAdding(true);
    for (const r of toAdd) {
      try {
        await fetch('/api/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: r.title, website: r.url, description: r.description, searchQuery: query }),
        });
        setAddedWebUrls(prev => new Set([...prev, r.url]));
      } catch {}
    }
    setAdding(false);
    setSelectedWeb(new Set());
  }

  // ── Maps add ──
  async function addMapsSelected() {
    const toAdd = Array.from(selectedMaps).map(i => ({ i, r: mapsResults[i] }));
    setAdding(true);
    const newAdded = new Set(addedMapsIdx);
    for (const { i, r } of toAdd) {
      try {
        await fetch('/api/companies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: r.name,
            website: r.website ?? undefined,
            address: r.address,
            phone: r.phone ?? undefined,
            email: r.email ?? undefined,
            searchQuery: query,
            source: r.source,
            twoGisId: r.twoGisId,
          }),
        });
        newAdded.add(i);
      } catch {}
    }
    setAdding(false);
    setSelectedMaps(new Set());
    setAddedMapsIdx(newAdded);
  }

  function toggleWeb(i: number) {
    setSelectedWeb(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }
  function toggleMaps(i: number) {
    setSelectedMaps(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Поиск компаний</h1>
        <p className="text-slate-500 mt-1">Найдите компании через поисковик или напрямую из 2GIS / Google Maps</p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-5 bg-slate-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => { setMode('web'); setWebResults([]); setMapsResults([]); setError(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'web' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Globe size={15} /> Веб-поиск
        </button>
        <button
          onClick={() => { setMode('maps'); setWebResults([]); setMapsResults([]); setError(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'maps' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Map size={15} /> По картам
          <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
            Контакты сразу
          </span>
        </button>
      </div>

      {mode === 'maps' && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-800 mb-4 flex items-start gap-2">
          <Map size={14} className="mt-0.5 shrink-0" />
          <span>
            Поиск по картам возвращает телефон, сайт и email прямо из базы 2GIS / Google Maps —
            без необходимости заходить на сайт компании. Настройте API-ключ в{' '}
            <a href="/settings" className="underline font-medium">Настройках</a>.
          </span>
        </div>
      )}

      {/* Search form */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-6">
        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Введите ключевые слова..."
            className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={num}
            onChange={(e) => setNum(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[5, 10, 20, 30].map((n) => (
              <option key={n} value={n}>{n} результатов</option>
            ))}
          </select>
          <select
            value={gl}
            onChange={(e) => setGl(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="kz">Казахстан</option>
            <option value="ru">Россия</option>
            <option value="uz">Узбекистан</option>
            <option value="by">Беларусь</option>
          </select>
          <button
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
            className="bg-blue-600 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Найти
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-400 self-center">Быстрый поиск:</span>
          {PRESET_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => { setQuery(q); handleSearch(q); }}
              className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-full transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── Web results ── */}
      {mode === 'web' && webResults.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-600">Найдено: <b>{webResults.length}</b></span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedWeb(new Set(webResults.map((_, i) => i)))} className="text-sm text-blue-600 hover:underline">
                Выбрать все
              </button>
              <button
                onClick={addWebSelected}
                disabled={selectedWeb.size === 0 || adding}
                className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Добавить ({selectedWeb.size})
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {webResults.map((r, i) => {
              const isInDb  = !!r.existingId;
              const isAdded = addedWebUrls.has(r.url);
              const isLocked = isInDb || isAdded;
              const isSel = selectedWeb.has(i);
              return (
                <div
                  key={i}
                  onClick={() => !isLocked && toggleWeb(i)}
                  className={`bg-white rounded-xl border px-5 py-4 transition-colors ${
                    isLocked ? 'opacity-60 cursor-default' :
                    isSel ? 'border-blue-400 bg-blue-50 cursor-pointer' : 'border-slate-100 hover:border-slate-300 cursor-pointer'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <input type="checkbox" checked={isSel} onChange={() => toggleWeb(i)} disabled={isLocked}
                        className="mt-0.5 h-4 w-4 accent-blue-600" onClick={e => e.stopPropagation()} />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 text-sm truncate">{r.title}</div>
                        <div className="text-xs text-blue-600 truncate">{r.url}</div>
                        {r.description && <div className="text-xs text-slate-500 mt-1 line-clamp-2">{r.description}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isInDb && (
                        <a
                          href={`/companies/${r.existingId}`}
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full hover:bg-violet-100"
                        >
                          <CheckCircle size={11} /> В базе
                        </a>
                      )}
                      {isAdded && !isInDb && (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle size={13} /> Добавлено
                        </span>
                      )}
                      <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-slate-400 hover:text-slate-600">
                        <ExternalLink size={15} />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Maps results ── */}
      {mode === 'maps' && mapsResults.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-600">Найдено: <b>{mapsResults.length}</b></span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedMaps(new Set(mapsResults.map((_, i) => i)))} className="text-sm text-blue-600 hover:underline">
                Выбрать все
              </button>
              <button
                onClick={addMapsSelected}
                disabled={selectedMaps.size === 0 || adding}
                className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Добавить ({selectedMaps.size})
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {mapsResults.map((r, i) => {
              const isInDb   = !!r.existingId;
              const isAdded  = addedMapsIdx.has(i);
              const isLocked = isInDb || isAdded;
              const isSel = selectedMaps.has(i);
              return (
                <div
                  key={i}
                  onClick={() => !isLocked && toggleMaps(i)}
                  className={`bg-white rounded-xl border px-5 py-4 transition-colors ${
                    isLocked ? 'opacity-60 cursor-default' :
                    isSel ? 'border-blue-400 bg-blue-50 cursor-pointer' : 'border-slate-100 hover:border-slate-300 cursor-pointer'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={isSel} onChange={() => toggleMaps(i)} disabled={isLocked}
                      className="mt-1 h-4 w-4 accent-blue-600" onClick={e => e.stopPropagation()} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="font-medium text-slate-800 text-sm truncate">{r.name}</div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            r.source === 'yandex_maps'
                              ? 'bg-red-100 text-red-700'
                              : r.source === '2gis'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {r.source === 'yandex_maps' ? 'Яндекс Карты' : r.source === '2gis' ? '2GIS' : 'Google Maps'}
                          </span>
                          {isInDb && (
                            <a
                              href={`/companies/${r.existingId}`}
                              onClick={e => e.stopPropagation()}
                              className="flex items-center gap-1 text-xs text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full hover:bg-violet-100"
                            >
                              <CheckCircle size={11} /> В базе
                            </a>
                          )}
                          {isAdded && !isInDb && (
                            <span className="flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle size={13} /> Добавлено
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {r.address && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <MapPin size={11} /> {r.address}
                          </span>
                        )}
                        {r.phone && (
                          <span className="flex items-center gap-1 text-xs text-slate-700 font-medium">
                            <Phone size={11} /> {r.phone}
                          </span>
                        )}
                        {r.email && (
                          <span className="flex items-center gap-1 text-xs text-slate-700 font-medium">
                            <Mail size={11} /> {r.email}
                          </span>
                        )}
                        {r.website && (
                          <a
                            href={r.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            <ExternalLink size={11} /> {r.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </a>
                        )}
                      </div>

                      {!r.phone && !r.email && !r.website && (
                        <span className="text-xs text-slate-400 italic">Контакты не указаны в базе карт</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
