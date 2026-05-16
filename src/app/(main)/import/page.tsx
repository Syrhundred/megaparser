'use client';

import { useState, useEffect } from 'react';
import { Download, Play, RefreshCw, CheckCircle, XCircle, Loader2, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const OKED_CATEGORIES = [
  { code: 'A', label: 'Сельское хозяйство' },
  { code: 'B', label: 'Горнодобывающая' },
  { code: 'C', label: 'Обрабатывающая промышленность' },
  { code: 'D', label: 'Электроснабжение и газ' },
  { code: 'E', label: 'Водоснабжение' },
  { code: 'F', label: 'Строительство' },
  { code: 'G', label: 'Торговля' },
  { code: 'H', label: 'Транспорт и хранение' },
  { code: 'I', label: 'Гостиницы и рестораны' },
  { code: 'J', label: 'Информация и связь' },
  { code: 'K', label: 'Финансовая деятельность' },
  { code: 'L', label: 'Операции с недвижимостью' },
  { code: 'M', label: 'Профессиональная деятельность' },
  { code: 'N', label: 'Административная деятельность' },
];

const TAX_COMPARISONS = [
  { value: 0, label: 'Без фильтра по налогам' },
  { value: 1, label: 'Налоги ≥' },
  { value: 2, label: 'Налоги ≤' },
];

interface ImportJob {
  id: string;
  bullJobId: string | null;
  status: string;
  payload: Record<string, unknown>;
  result: { imported: number; updated: number; skipped: number } | null;
  errorMsg: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:   <Clock size={14} className="text-slate-400" />,
  active:    <Loader2 size={14} className="text-blue-500 animate-spin" />,
  completed: <CheckCircle size={14} className="text-green-500" />,
  failed:    <XCircle size={14} className="text-red-500" />,
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'В очереди', active: 'Идёт импорт...', completed: 'Завершён', failed: 'Ошибка',
};

export default function ImportPage() {
  const [pageStart,  setPageStart]  = useState(1);
  const [pageEnd,    setPageEnd]    = useState(1);
  const [okedSel,    setOkedSel]    = useState<string[]>([]);
  const [taxComp,    setTaxComp]    = useState(0);
  const [taxValue,   setTaxValue]   = useState('5000000');
  const [taxYear,    setTaxYear]    = useState(2025);
  const [showFilters, setShowFilters] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [jobs,       setJobs]       = useState<ImportJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  const companiesEstimate = (pageEnd - pageStart + 1) * 100;

  function toggleOked(code: string) {
    setOkedSel(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  }

  async function loadJobs() {
    setJobsLoading(true);
    const res = await fetch('/api/import/apiba');
    if (res.ok) setJobs(await res.json());
    setJobsLoading(false);
  }

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 4000);
    return () => clearInterval(interval);
  }, []);

  const hasActive = jobs.some(j => j.status === 'active' || j.status === 'pending');

  async function startImport() {
    setLoading(true);
    try {
      const body: Record<string, unknown> = { pageStart, pageEnd, pageSize: 100 };
      if (okedSel.length)  body.oked = okedSel;
      if (taxComp > 0)     body.tax  = { comparison: taxComp, value: taxValue, year: taxYear };

      const res = await fetch('/api/import/apiba', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error ?? 'Ошибка запуска');
        return;
      }
      await loadJobs();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Импорт компаний</h1>
        <p className="text-slate-500 mt-1 text-sm">Загрузка из внешних реестров с автоматическим извлечением контактов</p>
      </div>

      {/* ── apiba card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <Download size={15} className="text-blue-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Реестр компаний Казахстана</h2>
              <p className="text-xs text-slate-400">apiba.prgapp.kz · ~10 000 компаний</p>
            </div>
          </div>
          <span className="text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full font-medium">Доступен</span>
        </div>

        <p className="text-sm text-slate-500 mb-5">
          Импортирует компании из государственного реестра РК. Для каждой компании автоматически извлекаются
          телефон, email и сайт из базы госзакупок. Каждая страница = 100 компаний.
        </p>

        {/* Page range */}
        <div className="flex items-end gap-4 flex-wrap mb-4">
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">Страница с</label>
            <input
              type="number" min={1} max={1000} value={pageStart}
              onChange={e => {
                const v = Math.max(1, Math.min(1000, Number(e.target.value)));
                setPageStart(v);
                if (pageEnd < v) setPageEnd(v);
              }}
              className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">По страницу</label>
            <input
              type="number" min={pageStart} max={1000} value={pageEnd}
              onChange={e => setPageEnd(Math.max(pageStart, Math.min(1000, Number(e.target.value))))}
              className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="pb-0.5">
            <p className="text-xs text-slate-400 mb-1">Будет импортировано</p>
            <p className="text-sm font-semibold text-slate-700">≈{companiesEstimate.toLocaleString()} компаний</p>
          </div>
        </div>

        {/* Filters toggle */}
        <button
          onClick={() => setShowFilters(v => !v)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3 transition-colors"
        >
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Фильтры по отрасли и налогам
          {(okedSel.length > 0 || taxComp > 0) && (
            <span className="ml-1 bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full font-medium">
              {okedSel.length + (taxComp > 0 ? 1 : 0)} активных
            </span>
          )}
        </button>

        {showFilters && (
          <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-4">
            {/* OKED checkboxes */}
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Отрасль (ОКВЭД)</p>
              <div className="grid grid-cols-2 gap-1.5">
                {OKED_CATEGORIES.map(o => (
                  <label key={o.code} className="flex items-center gap-2 text-sm cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={okedSel.includes(o.code)}
                      onChange={() => toggleOked(o.code)}
                      className="h-3.5 w-3.5 accent-blue-600 cursor-pointer"
                    />
                    <span className="text-slate-600 group-hover:text-slate-800">
                      <span className="font-mono text-slate-400 text-xs">{o.code}</span>
                      {' '}{o.label}
                    </span>
                  </label>
                ))}
              </div>
              {okedSel.length > 0 && (
                <button onClick={() => setOkedSel([])} className="mt-2 text-xs text-slate-400 hover:text-slate-600">
                  Сбросить выбор
                </button>
              )}
            </div>

            {/* Tax filter */}
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Фильтр по налогам</p>
              <div className="flex items-center gap-3 flex-wrap">
                <select
                  value={taxComp}
                  onChange={e => setTaxComp(Number(e.target.value))}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {TAX_COMPARISONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {taxComp > 0 && (
                  <>
                    <input
                      type="number"
                      value={taxValue}
                      onChange={e => setTaxValue(e.target.value)}
                      placeholder="5000000"
                      className="w-36 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-500">тенге за</span>
                    <input
                      type="number"
                      value={taxYear}
                      onChange={e => setTaxYear(Number(e.target.value))}
                      min={2020} max={2026}
                      className="w-20 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-500">год</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            ~{Math.ceil(companiesEstimate * 0.12 / 60)} мин · импорт идёт в фоне
          </p>
          <button
            onClick={startImport}
            disabled={loading || hasActive}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {hasActive ? 'Импорт идёт...' : 'Запустить'}
          </button>
        </div>
      </div>

      {/* ── Job history ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700 text-sm">История импортов</h3>
          <button onClick={loadJobs} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <RefreshCw size={14} className={jobsLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">Нет запусков</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {jobs.map(job => {
              const p = job.payload as {
                pageStart?: number; pageEnd?: number; pageSize?: number;
                oked?: string[]; tax?: { year: number; value: string; comparison: number };
              };
              const est = ((p.pageEnd ?? 1) - (p.pageStart ?? 1) + 1) * (p.pageSize ?? 100);
              return (
                <div key={job.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="shrink-0 mt-0.5">
                    {STATUS_ICON[job.status] ?? STATUS_ICON.pending}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 font-medium">
                      Страницы {p.pageStart}–{p.pageEnd}
                      <span className="text-slate-400 font-normal ml-1.5">(≈{est.toLocaleString()} компаний)</span>
                    </p>
                    {(p.oked?.length || p.tax) && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {p.oked?.length ? `ОКВЭД: ${p.oked.join(', ')}` : ''}
                        {p.tax ? ` · Налоги ≥ ${Number(p.tax.value).toLocaleString()} тг (${p.tax.year})` : ''}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-0.5">
                      {STATUS_LABEL[job.status] ?? job.status}
                      {job.result && (
                        <span className="ml-1.5">
                          · <span className="text-green-600">+{job.result.imported} добавлено</span>
                          {job.result.updated > 0 && <span className="text-blue-500 ml-1">· {job.result.updated} обновлено</span>}
                          {job.result.skipped > 0 && <span className="text-slate-300 ml-1">· {job.result.skipped} пропущено</span>}
                        </span>
                      )}
                      {job.errorMsg && <span className="ml-1.5 text-red-500">{job.errorMsg}</span>}
                    </p>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0 text-right">
                    {format(new Date(job.createdAt), 'd MMM, HH:mm', { locale: ru })}
                    {job.finishedAt && job.startedAt && (
                      <div>{Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 60000)} мин</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
