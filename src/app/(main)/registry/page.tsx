'use client';

import { Suspense } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Loader2, Download, ExternalLink, ChevronLeft, ChevronRight, Building2, Mail, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const PAGE_SIZE = 50;

const OKED_CATEGORIES = [
  { code: 'A', label: 'Сельское хозяйство' },
  { code: 'B', label: 'Горнодобывающая' },
  { code: 'C', label: 'Обрабатывающая' },
  { code: 'D', label: 'Электроснабжение' },
  { code: 'E', label: 'Водоснабжение' },
  { code: 'F', label: 'Строительство' },
  { code: 'G', label: 'Торговля' },
  { code: 'H', label: 'Транспорт' },
  { code: 'I', label: 'Гостиницы' },
  { code: 'J', label: 'ИТ и связь' },
  { code: 'K', label: 'Финансы' },
  { code: 'L', label: 'Недвижимость' },
  { code: 'M', label: 'Профессиональные' },
  { code: 'N', label: 'Административные' },
];

interface RegistryCompany {
  id: string;
  name: string;
  bin: string | null;
  industry: string | null;
  city: string | null;
  address: string | null;
  ceo: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: string;
  taxAmount: number | null;
  foundAt: string;
}

function fmt(n: number | null): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)} тыс`;
  return String(n);
}

function RegistryContent() {
  const [companies, setCompanies]   = useState<RegistryCompany[]>([]);
  const [total,     setTotal]       = useState(0);
  const [page,      setPage]        = useState(1);
  const [loading,   setLoading]     = useState(true);
  const [search,    setSearch]      = useState('');
  const [okedFilter, setOked]       = useState('');
  const [cityFilter, setCity]       = useState('');
  const [hasEmail,   setHasEmail]   = useState('');

  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search)     params.set('search',   search);
      if (okedFilter) params.set('oked',     okedFilter);
      if (cityFilter) params.set('city',     cityFilter);
      if (hasEmail)   params.set('hasEmail', hasEmail);

      const res = await fetch(`/api/registry?${params}`);
      if (!res.ok) {
        const text = await res.text();
        setError(`Ошибка сервера (${res.status}): ${text.slice(0, 200)}`);
        return;
      }
      const json = await res.json();
      setCompanies(json.data  ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  }, [page, search, okedFilter, cityFilter, hasEmail]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, okedFilter, cityFilter, hasEmail]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function exportCsv() {
    const header = ['Название','BIN','Отрасль','Город','Директор','Телефон','Email','Сайт','Налоги (тг)'];
    const lines  = [
      header.join(','),
      ...companies.map(c => [
        `"${(c.name ?? '').replace(/"/g,'""')}"`,
        c.bin ?? '',
        `"${(c.industry ?? '').replace(/"/g,'""')}"`,
        c.city ?? '',
        `"${(c.ceo ?? '').replace(/"/g,'""')}"`,
        c.phone ?? '',
        c.email ?? '',
        c.website?.startsWith('internal://') ? '' : (c.website ?? ''),
        c.taxAmount ?? '',
      ].join(',')),
    ];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `registry-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Реестр компаний</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {total > 0 ? `${total.toLocaleString()} компаний из реестра РК` : 'Компании импортированные из государственного реестра'}
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"
        >
          <Download size={15} /> CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Название, BIN, директор..."
            className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={okedFilter}
          onChange={e => setOked(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Все отрасли</option>
          {OKED_CATEGORIES.map(o => (
            <option key={o.code} value={o.code}>{o.code} — {o.label}</option>
          ))}
        </select>

        <input
          type="text"
          value={cityFilter}
          onChange={e => setCity(e.target.value)}
          placeholder="Город..."
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-36"
        />

        <select
          value={hasEmail}
          onChange={e => setHasEmail(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Все контакты</option>
          <option value="true">Есть email</option>
          <option value="false">Нет email</option>
        </select>

        <button
          onClick={load}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4 font-mono break-all">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 size={22} className="animate-spin mr-2.5" /> Загрузка...
          </div>
        ) : companies.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium text-slate-500">Компаний не найдено</p>
            <p className="text-sm mt-1">Запустите импорт на странице <a href="/import" className="text-blue-600 hover:underline">Импорт</a></p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Компания</th>
                  <th className="text-left px-4 py-3 font-medium">BIN</th>
                  <th className="text-left px-4 py-3 font-medium">Отрасль</th>
                  <th className="text-left px-4 py-3 font-medium">Город</th>
                  <th className="text-left px-4 py-3 font-medium">Директор</th>
                  <th className="text-left px-4 py-3 font-medium">Контакты</th>
                  <th className="text-right px-4 py-3 font-medium">Налоги ₸</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {companies.map(c => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 max-w-[220px] truncate" title={c.name}>{c.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{c.address ? c.address.split(',').slice(0, 2).join(',') : '—'}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.bin ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-[180px]">
                      <span className="truncate block" title={c.industry ?? ''}>
                        {c.industry ? c.industry.replace(/^\d+\s+/, '') : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{c.city ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-[160px]">
                      <span className="truncate block" title={c.ceo ?? ''}>{c.ceo ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {c.phone ? (
                          <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-xs text-slate-600 hover:text-blue-600">
                            <Phone size={11} /> {c.phone}
                          </a>
                        ) : <span className="text-xs text-slate-300 flex items-center gap-1"><Phone size={11} /> —</span>}
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <Mail size={11} /> {c.email}
                          </a>
                        ) : <span className="text-xs text-slate-300 flex items-center gap-1"><Mail size={11} /> —</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-medium text-slate-700 whitespace-nowrap">
                      {fmt(c.taxAmount)}
                    </td>
                    <td className="px-4 py-3">
                      {c.bin && (
                        <a
                          href={`https://ba.prg.kz/Company/?id=${c.bin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Открыть в реестре"
                          className="text-slate-400 hover:text-blue-600 p-1 rounded hover:bg-blue-50 transition-colors inline-block"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-slate-400">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} из {total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} /> Назад
            </button>
            <span className="text-sm text-slate-500">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Вперёд <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RegistryPage() {
  return (
    <Suspense>
      <RegistryContent />
    </Suspense>
  );
}
