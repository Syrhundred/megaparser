'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import {
  LayoutDashboard, Search, Building2, FileText,
  History, Settings, Zap, LogOut, FolderInput,
} from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Дашборд',  icon: LayoutDashboard },
  { href: '/search',    label: 'Поиск',     icon: Search          },
  { href: '/companies', label: 'Компании',  icon: Building2       },
  { href: '/import',    label: 'Импорт',    icon: FolderInput     },
  { href: '/templates', label: 'Шаблоны',   icon: FileText        },
  { href: '/history',   label: 'История',   icon: History         },
  { href: '/settings',  label: 'Настройки', icon: Settings        },
];

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts.length >= 2
      ? parts[0][0] + parts[1][0]
      : name.slice(0, 2)
    ).toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
}

export default function Sidebar() {
  const path = usePathname();
  const { data: session } = useSession();

  return (
    <aside className="fixed inset-y-0 left-0 w-60 bg-slate-900 flex flex-col z-30">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-800 shrink-0">
        <div className="bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg p-1.5 shadow-lg shadow-blue-900/50">
          <Zap size={17} className="text-white" />
        </div>
        <div>
          <div className="text-white font-bold text-sm tracking-tight">MegaParser</div>
          <div className="text-slate-500 text-[10px] font-medium tracking-widest uppercase">Outreach</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                active
                  ? 'bg-blue-600 text-white font-medium shadow-sm shadow-blue-900/40'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              }`}
            >
              <Icon size={16} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-3 pb-4 pt-3 border-t border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5 px-1.5">
          <div className="w-7 h-7 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center text-[10px] font-bold shrink-0 select-none">
            {getInitials(session?.user?.name, session?.user?.email)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-300 text-xs font-medium truncate leading-tight">
              {session?.user?.name ?? session?.user?.email ?? '—'}
            </p>
            {session?.user?.name && (
              <p className="text-slate-500 text-[10px] truncate">{session?.user?.email}</p>
            )}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            title="Выйти"
            className="text-slate-600 hover:text-red-400 transition-colors shrink-0 p-1 rounded-md hover:bg-slate-800"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
