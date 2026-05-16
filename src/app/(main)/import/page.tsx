'use client';

import { useState, useEffect } from 'react';
import { Download, Play, RefreshCw, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

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

const STATUS_ICON = {
  pending:   <Clock size={14} className="text-slate-400" />,
  active:    <Loader2 size={14} className="text-blue-500 animate-spin" />,
  completed: <CheckCircle size={14} className="text-green-500" />,
  failed:    <XCircle size={14} className="text-red-500" />,
};

const STATUS_LABEL: Record<string, string> = {
  pending:   'В очереди',
  active:    'Идёт импорт...',
  completed: 'Завершён',
  failed:    'Ошибка',
};

export default function ImportPage() {
  const [pageStart, setPageStart] = useState(1);
  const [pageEnd,   setPageEnd]   = useState(1);
  const [loading,   setLoading]   = useState(false);
  const [jobs,      setJobs]      = useState<ImportJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  const companiesEstimate = (pageEnd - pageStart + 1) * 100;

  async function loadJobs() {
    setJobsLoading(true);
    const res = await fetch('/api/import/apiba');
    if (res.ok) setJobs(await res.json());
    setJobsLoading(false);
  }

  useEffect(() => {
    loadJobs();
    // Poll while any job is active/pending
    const interval = setInterval(() => {
      loadJobs();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  async function startImport() {
    if (pageStart < 1 || pageEnd < pageStart || pageEnd > 1000) return;
    setLoading(true);
    try {
      const res = await fetch('/api/import/apiba', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ pageStart, pageEnd, pageSize: 100 }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? 'Ошибка запуска');
        return;
      }
      await loadJobs();
    } finally {
      setLoading(false);
    }
  }

  const hasActive = jobs.some(j => j.status === 'active' || j.status === 'pending');

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Импорт компаний</h1>
        <p className="text-slate-500 mt-1 text-sm">Загрузка компаний из внешних реестров с автоматическим извлечением контактов</p>
      </div>

      {/* ── apiba card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Download size={15} className="text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-800">Реестр компаний Казахстана</h2>
                <p className="text-xs text-slate-400">apiba.prgapp.kz · 10 000+ компаний</p>
              </div>
            </div>
          </div>
          <span className="text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full font-medium">Доступен</span>
        </div>

        <p className="text-sm text-slate-500 mb-5">
          Импортирует компании из государственного реестра РК. Для каждой компании автоматически извлекаются телефон, email и сайт из базы государственных закупок.
          Каждая страница = 100 компаний. Всего доступно ~1000 страниц (10 000 компаний).
        </p>

        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1">Страница с</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={pageStart}
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
              type="number"
              min={pageStart}
              max={1000}
              value={pageEnd}
              onChange={e => setPageEnd(Math.max(pageStart, Math.min(1000, Number(e.target.value))))}
              className="w-24 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="pb-0.5">
            <p className="text-xs text-slate-400 mb-1">Будет импортировано</p>
            <p className="text-sm font-semibold text-slate-700">≈{companiesEstimate.toLocaleString()} компаний</p>
          </div>
          <button
            onClick={startImport}
            disabled={loading || hasActive}
            className="ml-auto flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {hasActive ? 'Импорт идёт...' : 'Запустить'}
          </button>
        </div>

        <p className="text-xs text-slate-400 mt-3">
          Время: ~{Math.ceil(companiesEstimate * 0.12 / 60)} мин. Импорт идёт в фоне, можно закрыть страницу.
        </p>
      </div>

      {/* ── Job history ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-700 text-sm">История импортов</h3>
          <button
            onClick={loadJobs}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <RefreshCw size={14} className={jobsLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">Нет запусков</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {jobs.map(job => {
              const payload = job.payload as { pageStart?: number; pageEnd?: number; pageSize?: number };
              const est = ((payload.pageEnd ?? 1) - (payload.pageStart ?? 1) + 1) * (payload.pageSize ?? 100);
              return (
                <div key={job.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="shrink-0">
                    {STATUS_ICON[job.status as keyof typeof STATUS_ICON] ?? STATUS_ICON.pending}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 font-medium">
                      Страницы {payload.pageStart}–{payload.pageEnd}
                      <span className="text-slate-400 font-normal ml-1.5">(≈{est.toLocaleString()} компаний)</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {STATUS_LABEL[job.status] ?? job.status}
                      {job.result && (
                        <span className="ml-1.5">
                          · <span className="text-green-600">+{job.result.imported} добавлено</span>
                          {job.result.updated  > 0 && <span className="text-blue-500 ml-1">· {job.result.updated} обновлено</span>}
                          {job.result.skipped  > 0 && <span className="text-slate-400 ml-1">· {job.result.skipped} пропущено</span>}
                        </span>
                      )}
                      {job.errorMsg && <span className="ml-1.5 text-red-500">{job.errorMsg}</span>}
                    </p>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0 text-right">
                    {format(new Date(job.createdAt), 'd MMM, HH:mm', { locale: ru })}
                    {job.finishedAt && job.startedAt && (
                      <div>
                        {Math.round((new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) / 60000)} мин
                      </div>
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
