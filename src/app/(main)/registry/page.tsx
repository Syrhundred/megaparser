'use client';

import { Suspense } from 'react';
import { useState, useEffect, useCallback } from 'react';
import {
  Search, RefreshCw, Loader2, Download, ExternalLink,
  ChevronLeft, ChevronRight, Building2, Mail, Phone,
  Trash2, Send, ScanSearch, X, CheckCircle, AlertCircle,
} from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { Template } from '@/types';
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

interface TaxEntry { year: number; value: number; }

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
  taxGraph: TaxEntry[] | null;
  foundAt: string;
}

function taxForYear(company: RegistryCompany, year: number): number | null {
  if (company.taxGraph) {
    const entry = (company.taxGraph as TaxEntry[]).find(t => t.year === year);
    if (entry) return entry.value;
  }
  // fallback to taxAmount if it's the only data we have
  return null;
}

function fmt(n: number | null): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)} тыс`;
  return String(n);
}

function RegistryContent() {
  const [companies, setCompanies] = useState<RegistryCompany[]>([]);
  const [total,     setTotal]     = useState(0);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [okedFilter, setOked]     = useState('');
  const [cityFilter, setCity]     = useState('');
  const [hasEmail,   setHasEmail] = useState('');
  const [hasPhone,   setHasPhone] = useState('');
  const [taxYear,    setTaxYear]  = useState(2024);
  const [error,      setError]    = useState('');

  // Selection
  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [scrapingId,  setScrapingId]  = useState<string | null>(null);
  const [bulkScraping, setBulkScraping] = useState(false);

  // Batch send modal
  const [showSendModal,  setShowSendModal]  = useState(false);
  const [templates,      setTemplates]      = useState<Template[]>([]);
  const [batchTemplate,  setBatchTemplate]  = useState<Template | null>(null);
  const [batchSubject,   setBatchSubject]   = useState('');
  const [batchBody,      setBatchBody]      = useState('');
  const [batchSending,   setBatchSending]   = useState(false);
  const [batchResult,    setBatchResult]    = useState<{ queued: number; skipped: number } | null>(null);
  const [batchError,     setBatchError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search)     params.set('search',   search);
      if (okedFilter) params.set('oked',     okedFilter);
      if (cityFilter) params.set('city',     cityFilter);
      if (hasEmail)   params.set('hasEmail', hasEmail);
      if (hasPhone)   params.set('hasPhone', hasPhone);

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
  }, [page, search, okedFilter, cityFilter, hasEmail, hasPhone]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [search, okedFilter, cityFilter, hasEmail, hasPhone]);

  // ── Single-row actions ──────────────────────────────────────────────────────

  async function scrapeOne(id: string) {
    setScrapingId(id);
    await fetch(`/api/companies/${id}/scrape`, { method: 'POST' });
    await load();
    setScrapingId(null);
  }

  async function deleteOne(id: string) {
    if (!confirm('Удалить компанию?')) return;
    await fetch(`/api/companies/${id}`, { method: 'DELETE' });
    setCompanies(prev => prev.filter(c => c.id !== id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    setTotal(t => t - 1);
  }

  // ── Selection ───────────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleSelectAll() {
    if (selected.size === companies.length && companies.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(companies.map(c => c.id)));
    }
  }

  // ── Bulk actions ────────────────────────────────────────────────────────────

  async function bulkScrape() {
    setBulkScraping(true);
    await fetch('/api/companies/scrape-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyIds: Array.from(selected) }),
    });
    setSelected(new Set());
    setBulkScraping(false);
    await load();
  }

  async function deleteSelected() {
    if (!confirm(`Удалить ${selected.size} компаний? Это действие необратимо.`)) return;
    for (const id of Array.from(selected)) {
      await fetch(`/api/companies/${id}`, { method: 'DELETE' });
    }
    setSelected(new Set());
    await load();
  }

  function exportCsv() {
    const rows = selected.size > 0
      ? companies.filter(c => selected.has(c.id))
      : companies;

    const header = ['Название', 'BIN', 'Отрасль', 'Город', 'Директор', 'Телефон', 'Email', 'Сайт', `Налоги ${taxYear} (тг)`];
    const lines  = [
      header.join(','),
      ...rows.map(c => [
        `"${(c.name ?? '').replace(/"/g, '""')}"`,
        c.bin ?? '',
        `"${(c.industry ?? '').replace(/"/g, '""')}"`,
        c.city ?? '',
        `"${(c.ceo ?? '').replace(/"/g, '""')}"`,
        c.phone ?? '',
        c.email ?? '',
        c.website?.startsWith('internal://') ? '' : (c.website ?? ''),
        taxForYear(c, taxYear) ?? '',
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

  // ── Batch send modal ────────────────────────────────────────────────────────

  async function openSendModal() {
    setBatchResult(null);
    setBatchError('');

    if (templates.length === 0) {
      const res  = await fetch('/api/templates');
      const data: Template[] = await res.json();
      setTemplates(data);
      const def = data.find(t => t.isDefault) ?? data[0];
      if (def) applyBatchTemplate(def);
    }

    setShowSendModal(true);
  }

  function applyBatchTemplate(tpl: Template) {
    setBatchTemplate(tpl);
    setBatchSubject(tpl.subject);
    const body = tpl.body
      .replace(/\{\{signature_name\}\}/g, tpl.signatureName ?? '')
      .replace(/\{\{product_description\}\}/g, tpl.productDesc)
      .replace(/\{\{signature\}\}/g, tpl.signature);
    setBatchBody(body);
  }

  async function handleBatchSend() {
    if (!batchSubject.trim() || !batchBody.trim()) return;
    setBatchSending(true);
    setBatchError('');
    try {
      const res = await fetch('/api/companies/send-batch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyIds: Array.from(selected),
          subject:    batchSubject,
          message:    batchBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Ошибка');
      setBatchResult({ queued: data.queued, skipped: data.skipped });
      setSelected(new Set());
      await load();
    } catch (e) {
      setBatchError(e instanceof Error ? e.message : 'Ошибка отправки');
    } finally {
      setBatchSending(false);
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const totalPages        = Math.ceil(total / PAGE_SIZE);
  const allOnPageSelected = companies.length > 0 && selected.size === companies.length;
  const someSelected      = selected.size > 0 && selected.size < companies.length;
  const selectedWithEmail = companies.filter(c => selected.has(c.id) && c.email).length;

  return (
    <>
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
          <option value="">Email: все</option>
          <option value="true">Есть email</option>
          <option value="false">Нет email</option>
        </select>

        <select
          value={hasPhone}
          onChange={e => setHasPhone(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Телефон: все</option>
          <option value="true">Есть телефон</option>
          <option value="false">Нет телефона</option>
        </select>

        <div className="flex items-center gap-1.5 border border-slate-200 rounded-xl px-3 py-2 bg-white">
          <span className="text-xs text-slate-400 whitespace-nowrap">Налоги за</span>
          <input
            type="number"
            value={taxYear}
            onChange={e => setTaxYear(Number(e.target.value))}
            min={2018}
            max={2026}
            className="w-16 text-sm text-slate-700 focus:outline-none bg-transparent"
          />
        </div>

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
                  <th className="pl-5 pr-2 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      ref={el => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 accent-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Компания</th>
                  <th className="text-left px-4 py-3 font-medium">BIN</th>
                  <th className="text-left px-4 py-3 font-medium">Отрасль</th>
                  <th className="text-left px-4 py-3 font-medium">Город</th>
                  <th className="text-left px-4 py-3 font-medium">Директор</th>
                  <th className="text-left px-4 py-3 font-medium">Контакты</th>
                  <th className="text-left px-4 py-3 font-medium">Статус</th>
                  <th className="text-right px-4 py-3 font-medium">Налоги {taxYear} ₸</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {companies.map(c => {
                  const isSel = selected.has(c.id);
                  return (
                    <tr key={c.id} className={`border-b border-slate-50 transition-colors ${isSel ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                      <td className="pl-5 pr-2 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={isSel}
                          onChange={() => toggleSelect(c.id)}
                          className="h-4 w-4 accent-blue-600 cursor-pointer"
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800 max-w-[200px] truncate" title={c.name}>{c.name}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{c.address ? c.address.split(',').slice(0, 2).join(',') : '—'}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{c.bin ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-[160px]">
                        <span className="truncate block" title={c.industry ?? ''}>
                          {c.industry ? c.industry.replace(/^\d+\s+/, '') : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{c.city ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-[140px]">
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
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-medium text-slate-700 whitespace-nowrap">
                        {fmt(taxForYear(c, taxYear))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
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
                          <button
                            onClick={() => scrapeOne(c.id)}
                            disabled={scrapingId === c.id}
                            title="Найти контакты"
                            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                          >
                            {scrapingId === c.id
                              ? <Loader2 size={13} className="animate-spin" />
                              : <RefreshCw size={13} />}
                          </button>
                          <button
                            onClick={() => deleteOne(c.id)}
                            title="Удалить"
                            className="text-slate-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

    {/* ── Floating action bar ──────────────────────────────────────────────── */}
    {selected.size > 0 && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-3 whitespace-nowrap">
        <span className="text-sm font-medium text-slate-300 mr-1">
          Выбрано: {selected.size}
        </span>

        <button
          onClick={bulkScrape}
          disabled={bulkScraping}
          className="flex items-center gap-1.5 text-sm bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {bulkScraping ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />}
          Найти контакты
        </button>

        <button
          onClick={openSendModal}
          className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Send size={14} />
          Отправить письма
          {selectedWithEmail > 0 && (
            <span className="ml-1 bg-blue-500 text-xs px-1.5 py-0.5 rounded-full">{selectedWithEmail}</span>
          )}
        </button>

        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 text-sm bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Download size={14} /> CSV
        </button>

        <button
          onClick={deleteSelected}
          className="flex items-center gap-1.5 text-sm bg-slate-800 hover:bg-red-900 text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg transition-colors"
        >
          <Trash2 size={14} /> Удалить
        </button>

        <button
          onClick={() => setSelected(new Set())}
          className="text-slate-500 hover:text-slate-300 p-1 rounded-lg transition-colors ml-1"
          title="Снять выделение"
        >
          <X size={16} />
        </button>
      </div>
    )}

    {/* ── Batch send modal ─────────────────────────────────────────────────── */}
    {showSendModal && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div>
              <h2 className="font-bold text-slate-900">Массовая отправка</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Выбрано {selected.size} компаний
                {selectedWithEmail < selected.size && (
                  <> · <span className="text-amber-600">{selected.size - selectedWithEmail} без email — будут пропущены</span></>
                )}
              </p>
            </div>
            <button
              onClick={() => setShowSendModal(false)}
              className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {batchResult ? (
              <div className="text-center py-6">
                <CheckCircle size={48} className="mx-auto text-green-500 mb-3" />
                <p className="font-semibold text-slate-800 text-lg">Письма поставлены в очередь</p>
                <p className="text-slate-500 text-sm mt-1">
                  Отправляется: <strong>{batchResult.queued}</strong>
                  {batchResult.skipped > 0 && (
                    <> · Пропущено: <strong>{batchResult.skipped}</strong> (нет email)</>
                  )}
                </p>
                <p className="text-xs text-slate-400 mt-2">
                  Письма отправляются с задержкой 3–8 минут между каждым для защиты репутации отправителя.
                </p>
                <button
                  onClick={() => setShowSendModal(false)}
                  className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg text-sm hover:bg-blue-700"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <>
                {templates.length > 1 && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Шаблон</label>
                    <select
                      value={batchTemplate?.id ?? ''}
                      onChange={e => {
                        const tpl = templates.find(t => t.id === e.target.value);
                        if (tpl) applyBatchTemplate(tpl);
                      }}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Тема</label>
                  <input
                    type="text"
                    value={batchSubject}
                    onChange={e => setBatchSubject(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    Текст письма
                    <span className="ml-2 text-[10px] font-normal text-blue-500 normal-case">
                      {'{{company}}'} и {'{{company_greeting}}'} подставятся автоматически
                    </span>
                  </label>
                  <textarea
                    value={batchBody}
                    onChange={e => setBatchBody(e.target.value)}
                    rows={12}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
                  />
                </div>

                {batchError && (
                  <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                    <AlertCircle size={15} /> {batchError}
                  </div>
                )}

                {selectedWithEmail === 0 && (
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                    <AlertCircle size={15} />
                    Ни у одной из выбранных компаний нет email. Сначала запустите «Найти контакты».
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleBatchSend}
                    disabled={batchSending || selectedWithEmail === 0 || !batchSubject.trim() || !batchBody.trim()}
                    className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {batchSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {batchSending ? 'Ставим в очередь...' : `Отправить ${selectedWithEmail} компаниям`}
                  </button>
                  <button
                    onClick={() => setShowSendModal(false)}
                    className="border border-slate-200 text-slate-600 py-2.5 px-4 rounded-xl hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default function RegistryPage() {
  return (
    <Suspense>
      <RegistryContent />
    </Suspense>
  );
}
