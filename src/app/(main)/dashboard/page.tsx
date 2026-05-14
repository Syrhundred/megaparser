'use client';

import { useEffect, useState } from 'react';
import { Building2, Mail, Send, MessageSquare, TrendingUp, ChevronRight, FileText } from 'lucide-react';
import Link from 'next/link';
import { STATUS_LABELS, CompanyStatus } from '@/types';

interface Stats {
  total: number;
  emailFound: number;
  sent: number;
  replied: number;
  sentToday: number;
  byStatus: Array<{ status: string; _count: number }>;
}

const STATUS_DOT: Record<string, string> = {
  site_found:    'bg-slate-400',
  contact_found: 'bg-blue-500',
  email_found:   'bg-cyan-500',
  form_found:    'bg-purple-500',
  message_ready: 'bg-amber-400',
  sent:          'bg-green-500',
  send_error:    'bg-red-500',
  replied:       'bg-emerald-500',
  no_contacts:   'bg-gray-400',
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/stats').then((r) => r.json()).then(setStats);
  }, []);

  const cards = [
    { label: 'Всего компаний',  value: stats?.total     ?? '—', icon: Building2,    iconBg: 'bg-blue-50 text-blue-600',      href: '/companies'                      },
    { label: 'Email найдено',   value: stats?.emailFound ?? '—', icon: Mail,         iconBg: 'bg-cyan-50 text-cyan-600',      href: '/companies?status=email_found'   },
    { label: 'Отправлено',      value: stats?.sent       ?? '—', icon: Send,         iconBg: 'bg-green-50 text-green-600',    href: '/companies?status=sent'          },
    { label: 'Ответов',         value: stats?.replied    ?? '—', icon: MessageSquare, iconBg: 'bg-emerald-50 text-emerald-600', href: '/companies?status=replied'      },
    { label: 'Сегодня',         value: stats?.sentToday  ?? '—', icon: TrendingUp,   iconBg: 'bg-violet-50 text-violet-600',  href: '/history'                        },
  ];

  const actions = [
    { href: '/search',                       label: 'Запустить поиск',      sub: 'Найти новые компании',          iconBg: 'bg-blue-100 group-hover:bg-blue-600',    iconColor: 'text-blue-600 group-hover:text-white',    Icon: Building2  },
    { href: '/companies?status=email_found', label: 'Компании с email',     sub: 'Готовы к отправке писем',       iconBg: 'bg-cyan-100 group-hover:bg-cyan-600',    iconColor: 'text-cyan-600 group-hover:text-white',    Icon: Mail       },
    { href: '/templates',                    label: 'Шаблоны писем',         sub: 'Тексты писем и переменные',    iconBg: 'bg-violet-100 group-hover:bg-violet-600', iconColor: 'text-violet-600 group-hover:text-white',  Icon: FileText   },
    { href: '/history',                      label: 'История отправок',      sub: 'Журнал всех исходящих писем',  iconBg: 'bg-green-100 group-hover:bg-green-600',  iconColor: 'text-green-600 group-hover:text-white',   Icon: TrendingUp },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Дашборд</h1>
        <p className="text-slate-500 mt-1 text-sm">Обзор активности системы</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        {cards.map(({ label, value, icon: Icon, iconBg, href }) => (
          <Link
            key={label}
            href={href}
            className="group bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition-all"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className="text-3xl font-bold text-slate-900 mt-1.5 tracking-tight">{value}</p>
              </div>
              <div className={`${iconBg} rounded-xl p-2.5 group-hover:scale-110 transition-transform shrink-0`}>
                <Icon size={18} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By status breakdown */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">По статусам</h2>
          {stats?.byStatus.length ? (
            <div className="space-y-3">
              {stats.byStatus
                .sort((a, b) => b._count - a._count)
                .map((row) => {
                  const label = STATUS_LABELS[row.status as CompanyStatus] ?? row.status;
                  const dot = STATUS_DOT[row.status] ?? 'bg-gray-400';
                  const pct = stats.total > 0 ? Math.round((row._count / stats.total) * 100) : 0;
                  return (
                    <div key={row.status}>
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                          <span className="text-slate-600 text-xs">{label}</span>
                        </div>
                        <span className="font-semibold text-slate-800 text-xs">{row._count}</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${dot} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-slate-400 text-sm">Нет данных</p>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Быстрые действия</h2>
          <div className="space-y-2">
            {actions.map(({ href, label, sub, iconBg, iconColor, Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all"
              >
                <div className={`${iconBg} ${iconColor} rounded-lg p-2 transition-colors shrink-0`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 text-sm">{label}</div>
                  <div className="text-slate-500 text-xs truncate">{sub}</div>
                </div>
                <ChevronRight size={15} className="text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
