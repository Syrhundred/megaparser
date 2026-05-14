'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Building2, ExternalLink, RefreshCw, Search, Loader2, Trash2, Plus,
  Send, Download, ChevronLeft, ChevronRight, X, CheckCircle, AlertCircle,
  ScanSearch,
} from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { Company, CompanyStatus, STATUS_LABELS, Template } from '@/types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const PAGE_SIZE = 50;

const ALL_STATUSES: CompanyStatus[] = [
  'site_found', 'contact_found', 'email_found', 'form_found',
  'message_ready', 'sent', 'send_error', 'replied', 'no_contacts',
];

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-500',
  'bg-rose-500', 'bg-teal-500', 'bg-amber-500', 'bg-indigo-500',
];

function avatarColor(name: string): string {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export default function CompaniesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';

  const [search, setSearch]       = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [totalCount, setTotal]    = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [scrapingId, setScrapingId] = useState<string | null>(null);

  // Multi-select
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Bulk scrape
  const [bulkScraping, setBulkScraping] = useState(false);

  // Batch send modal
  const [showSendModal, setShowSendModal]   = useState(false);
  const [templates, setTemplates]           = useState<Template[]>([]);
  const [batchTemplate, setBatchTemplate]   = useState<Template | null>(null);
  const [batchSubject, setBatchSubject]     = useState('');
  const [batchBody, setBatchBody]           = useState('');
  const [batchSending, setBatchSending]     = useState(false);
  const [batchResult, setBatchResult]       = useState<{ queued: number; skipped: number } | null>(null);
  const [batchError, setBatchError]         = useState('');

  // ── Data loading ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (search)       params.set('search', search);
    params.set('page',  String(page));
    params.set('limit', String(PAGE_SIZE));

    const res  = await fetch(`/api/companies?${params}`);
    const json = await res.json();
    setCompanies(json.data  ?? []);
    setTotal(json.total ?? 0);
    setLoading(false);
  }, [statusFilter, search, page]);

  useEffect(() => { load(); }, [load]);

  // Reset page + selection when filters change
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [statusFilter, search]);

  // ── Single-row actions ────────────────────────────────────────────────────

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

  // ── Selection ─────────────────────────────────────────────────────────────

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

  // ── Bulk actions ──────────────────────────────────────────────────────────

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

    const header = ['Название', 'Сайт', 'Email', 'Телефон', 'Статус', 'Найдена'];
    const lines  = [
      header.join(','),
      ...rows.map(c => [
        `"${(c.name ?? '').replace(/"/g, '""')}"`,
        `"${c.website}"`,
        `"${c.email ?? ''}"`,
        `"${c.phone ?? ''}"`,
        `"${STATUS_LABELS[c.status as CompanyStatus] ?? c.status}"`,
        `"${format(new Date(c.foundAt), 'd MMM yyyy', { locale: ru })}"`,
      ].join(',')),
    ];

    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `companies-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Batch send modal ──────────────────────────────────────────────────────

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
    // Pre-render all vars EXCEPT {{company}} / {{company_greeting}} — those
    // are substituted per-company server-side.
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
      const res  = await fetch('/api/companies/send-batch', {
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

  // ── Derived ───────────────────────────────────────────────────────────────

  const totalPages           = Math.ceil(totalCount / PAGE_SIZE);
  const allOnPageSelected    = companies.length > 0 && selected.size === companies.length;
  const someSelected         = selected.size > 0 && selected.size < companies.length;
  const selectedWithEmail    = companies.filter(c => selected.has(c.id) && c.email).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Компании</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {totalCount > 0 ? `${totalCount} компаний в базе` : 'Найденные компании и их контакты'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            title="Экспорт CSV"
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
          >
            <Download size={15} /> CSV
          </button>
          <Link
            href="/search"
            className="bg-blue-600 text-white text-sm px-4 py-2.5 rounded-xl hover:bg-blue-700 flex items-center gap-2 font-medium transition-colors"
          >
            <Plus size={15} />
            Добавить компании
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-5 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Поиск по названию, сайту, email..."
            className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            const val = e.target.value;
            router.push(val ? `/companies?status=${val}` : '/companies');
          }}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Все статусы</option>
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <button
          onClick={load}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2 transition-colors"
        >
          <RefreshCw size={15} />
          Обновить
        </button>
      </div>

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
            <Link href="/search" className="text-blue-600 text-sm hover:underline mt-1.5 inline-block">
              Запустить поиск →
            </Link>
          </div>
        ) : (
          <table className="w-full">
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
                <th className="text-left px-3 py-3 font-medium">Компания</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Телефон</th>
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="text-left px-4 py-3 font-medium">Найдена</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const initial  = c.name?.[0]?.toUpperCase() ?? '?';
                const color    = avatarColor(c.name ?? '');
                const isSel    = selected.has(c.id);
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-slate-50 transition-colors ${isSel ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                  >
                    <td className="pl-5 pr-2 py-3.5 w-8">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelect(c.id)}
                        className="h-4 w-4 accent-blue-600 cursor-pointer"
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`${color} w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 select-none`}>
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 text-sm truncate">{c.name}</div>
                          {(() => {
                            const w = c.website;
                            if (w.startsWith('maps://') || w.startsWith('internal://')) {
                              return <div className="text-xs text-slate-400 italic">Нет сайта</div>;
                            }
                            const is2gis = w.includes('2gis.ru/firm/');
                            return (
                              <div className="flex items-center gap-1 text-xs text-blue-500 truncate max-w-44">
                                <a href={w} target="_blank" rel="noopener noreferrer" className="hover:underline truncate">
                                  {is2gis ? '2GIS' : w.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                                </a>
                                <ExternalLink size={9} className="shrink-0 opacity-70" />
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600">{c.email ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3.5 text-sm text-slate-600">{c.phone ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={c.status} />
                      {c.hasForm && !c.email && (
                        <span className="ml-1 text-xs text-purple-500">+ форма</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-400">
                      {format(new Date(c.foundAt), 'd MMM yyyy', { locale: ru })}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/companies/${c.id}`}
                          className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1 rounded-lg font-medium transition-colors"
                        >
                          Открыть
                        </Link>
                        <button
                          onClick={() => scrapeOne(c.id)}
                          disabled={scrapingId === c.id}
                          title="Найти контакты"
                          className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          {scrapingId === c.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <RefreshCw size={14} />}
                        </button>
                        <button
                          onClick={() => deleteOne(c.id)}
                          title="Удалить"
                          className="text-slate-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-slate-400">
            Показано {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} из {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} /> Назад
            </button>
            <span className="text-sm text-slate-500">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="flex items-center gap-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Вперёд <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {!loading && companies.length > 0 && totalPages <= 1 && (
        <p className="text-xs text-slate-400 mt-2.5 text-right">{totalCount} компаний</p>
      )}
    </div>

    {/* ── Floating action bar ───────────────────────────────────────────────── */}
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

    {/* ── Batch send modal ──────────────────────────────────────────────────── */}
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
                    {batchSending
                      ? 'Ставим в очередь...'
                      : `Отправить ${selectedWithEmail} компаниям`}
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
