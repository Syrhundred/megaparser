'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { History, RefreshCw, Loader2 } from 'lucide-react';
import { Outreach } from '@/types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const STATUS_MAP: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  sent:     { label: 'Отправлено',      dot: 'bg-green-500',  bg: 'bg-green-50',  text: 'text-green-700'  },
  error:    { label: 'Ошибка',          dot: 'bg-red-500',    bg: 'bg-red-50',    text: 'text-red-700'    },
  no_email: { label: 'Email не найден', dot: 'bg-gray-400',   bg: 'bg-gray-50',   text: 'text-gray-500'   },
};

export default function HistoryPage() {
  const [outreaches, setOutreaches] = useState<Outreach[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const params = statusFilter ? `?status=${statusFilter}` : '';
    const res = await fetch(`/api/history${params}`);
    const data = await res.json();
    setOutreaches(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">История отправок</h1>
          <p className="text-slate-500 mt-1 text-sm">Все исходящие письма и статусы</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">Все</option>
            <option value="sent">Отправлено</option>
            <option value="error">Ошибка</option>
            <option value="no_email">Email не найден</option>
          </select>
          <button
            onClick={load}
            className="border border-slate-200 rounded-xl p-2 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={15} className="text-slate-500" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 size={22} className="animate-spin mr-2.5" /> Загрузка...
          </div>
        ) : outreaches.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <History size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-medium text-slate-500">История пуста</p>
            <Link href="/companies" className="text-blue-600 text-sm hover:underline mt-1.5 inline-block">
              К компаниям →
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[11px] text-slate-400 uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-medium">Компания</th>
                <th className="text-left px-4 py-3 font-medium">Тема</th>
                <th className="text-left px-4 py-3 font-medium">Статус</th>
                <th className="text-left px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {outreaches.map((o) => {
                const st = STATUS_MAP[o.status] ?? { label: o.status, dot: 'bg-gray-400', bg: 'bg-gray-50', text: 'text-gray-500' };
                const company = (o as Outreach & { company?: { id: string; name: string } }).company;
                return (
                  <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      {company ? (
                        <Link href={`/companies/${company.id}`} className="font-medium text-sm text-slate-800 hover:text-blue-600 transition-colors">
                          {company.name}
                        </Link>
                      ) : (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600 max-w-xs">
                      <span className="truncate block">{o.subject ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${st.bg} ${st.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot} shrink-0`} />
                        {st.label}
                      </div>
                      {o.errorMsg && (
                        <div className="text-xs text-red-500 mt-1">{o.errorMsg}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-400">
                      {format(new Date(o.sentAt), 'd MMM yyyy, HH:mm', { locale: ru })}
                    </td>
                    <td className="px-4 py-3.5">
                      {company && (
                        <Link
                          href={`/companies/${company.id}`}
                          className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1 rounded-lg font-medium transition-colors"
                        >
                          Открыть
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {!loading && outreaches.length > 0 && (
        <p className="text-xs text-slate-400 mt-2.5 text-right">{outreaches.length} записей</p>
      )}
    </div>
  );
}
