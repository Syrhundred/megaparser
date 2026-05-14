'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  Save, CheckCircle, Loader2, Eye, EyeOff, ExternalLink,
  UserPlus, Trash2, Copy, Check, Users,
} from 'lucide-react';

interface Settings {
  search_engine: string;
  default_gl: string;
  google_api_key: string;
  google_cx: string;
  serpapi_key: string;
  tavily_api_key: string;
  brave_api_key: string;
  maps_engine: string;
  yandex_maps_api_key: string;
  twogis_api_key: string;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  inviteToken: string | null;
  createdAt: string;
}

const DEFAULT: Settings = {
  search_engine: 'google',
  default_gl: 'kz',
  google_api_key: '',
  google_cx: '',
  serpapi_key: '',
  tavily_api_key: '',
  brave_api_key: '',
  maps_engine: 'yandex_maps',
  yandex_maps_api_key: '',
  twogis_api_key: '',
  smtp_host: 'smtp.gmail.com',
  smtp_port: '587',
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
};

const ENGINES = [
  { id: 'tavily',  title: 'Tavily',                  desc: '1 000 запросов/месяц бесплатно, без карты. Быстрый старт — tavily.com.' },
  { id: 'brave',   title: 'Brave Search',             desc: '$5 кредитов бесплатно каждый месяц (~1 000 запросов). api-dashboard.search.brave.com.' },
  { id: 'serpapi', title: 'SerpAPI',                  desc: '100 запросов/месяц бесплатно. Парсит Google через прокси — serpapi.com.' },
  { id: 'google',  title: 'Google Custom Search API', desc: '100 запросов/день бесплатно. Официальный Google API, требует настройки CX.' },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

  const [tab, setTab] = useState<'general' | 'users'>('general');

  const [settings, setSettings] = useState<Settings>({ ...DEFAULT });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showGoogleKey, setShowGoogleKey] = useState(false);
  const [showSerpKey, setShowSerpKey] = useState(false);
  const [showTavilyKey, setShowTavilyKey] = useState(false);
  const [showBraveKey, setShowBraveKey] = useState(false);
  const [showYandexKey, setShowYandexKey] = useState(false);
  const [showTwoGisKey, setShowTwoGisKey] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [inviteError, setInviteError] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => setSettings((prev) => ({ ...prev, ...data })));
  }, []);

  useEffect(() => {
    if (tab === 'users' && isAdmin) loadUsers();
  }, [tab, isAdmin]);

  async function loadUsers() {
    setUsersLoading(true);
    const r = await fetch('/api/users');
    if (r.ok) setUsers(await r.json());
    setUsersLoading(false);
  }

  const set =
    (key: keyof Settings) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setSettings((prev) => ({ ...prev, [key]: e.target.value }));

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError('');
    setInviteLink('');
    setInviting(true);
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    });
    setInviting(false);
    if (!res.ok) {
      const data = await res.json();
      setInviteError(data.error ?? 'Ошибка');
      return;
    }
    const data = await res.json();
    setInviteLink(data.inviteUrl);
    setInviteEmail('');
    loadUsers();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function deleteUser(id: string) {
    if (!confirm('Удалить пользователя?')) return;
    await fetch(`/api/users/${id}`, { method: 'DELETE' });
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Настройки</h1>
        <p className="text-slate-500 mt-1">Почта, поиск и управление доступом</p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <button
          onClick={() => setTab('general')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'general' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Основные
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab('users')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'users' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Users size={14} />
            Пользователи
          </button>
        )}
      </div>

      {tab === 'general' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Поиск компаний</h2>
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-2">Поисковый движок</label>
              <div className="grid grid-cols-1 gap-2">
                {ENGINES.map((e) => (
                  <button key={e.id} onClick={() => setSettings((prev) => ({ ...prev, search_engine: e.id }))} className={`text-left p-3 rounded-xl border-2 transition-colors ${settings.search_engine === e.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="font-medium text-sm text-slate-800 mb-0.5">{e.title}</div>
                    <p className="text-xs text-slate-500 leading-tight">{e.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {settings.search_engine === 'tavily' && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="bg-violet-50 border border-violet-100 rounded-lg px-4 py-3 text-xs text-violet-800 mb-3">
                  Зарегистрируйтесь на <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">tavily.com <ExternalLink size={10} /></a> → скопируйте API Key. <b>1 000 запросов/месяц бесплатно</b>, карта не нужна.
                </div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Tavily API Key</label>
                <div className="relative mt-1">
                  <input type={showTavilyKey ? 'text' : 'password'} value={settings.tavily_api_key} onChange={set('tavily_api_key')} placeholder="tvly-..." className="w-full border border-slate-200 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => setShowTavilyKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showTavilyKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
              </div>
            )}

            {settings.search_engine === 'brave' && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="bg-orange-50 border border-orange-100 rounded-lg px-4 py-3 text-xs text-orange-800 mb-3">
                  Получите ключ на <a href="https://api-dashboard.search.brave.com" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">api-dashboard.search.brave.com <ExternalLink size={10} /></a>. <b>$5 кредитов бесплатно</b> каждый месяц (~1 000 запросов).
                </div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Brave Search API Key</label>
                <div className="relative mt-1">
                  <input type={showBraveKey ? 'text' : 'password'} value={settings.brave_api_key} onChange={set('brave_api_key')} placeholder="BSA..." className="w-full border border-slate-200 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => setShowBraveKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showBraveKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
              </div>
            )}

            {settings.search_engine === 'serpapi' && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-xs text-amber-700 mb-3">
                  Зарегистрируйтесь на <a href="https://serpapi.com" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">serpapi.com <ExternalLink size={10} /></a> и скопируйте API Key. Бесплатный план: 100 запросов/месяц.
                </div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">SerpAPI Key</label>
                <div className="relative mt-1">
                  <input type={showSerpKey ? 'text' : 'password'} value={settings.serpapi_key} onChange={set('serpapi_key')} placeholder="Вставьте API-ключ SerpAPI" className="w-full border border-slate-200 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => setShowSerpKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showSerpKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
              </div>
            )}

            {settings.search_engine === 'google' && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-800">
                  <p className="mb-1 font-medium">Как получить ключи:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Создайте API Key на <a href="https://console.developers.google.com/" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">console.developers.google.com <ExternalLink size={9} /></a> → включите «Custom Search API»</li>
                    <li>Создайте поисковик на <a href="https://programmablesearchengine.google.com/" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">programmablesearchengine.google.com <ExternalLink size={9} /></a> → включите «Поиск по всему интернету» → скопируйте cx</li>
                  </ol>
                  <p className="mt-1.5 text-blue-600">Бесплатно: 100 запросов/день.</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Google API Key</label>
                  <div className="relative mt-1">
                    <input type={showGoogleKey ? 'text' : 'password'} value={settings.google_api_key} onChange={set('google_api_key')} placeholder="AIza..." className="w-full border border-slate-200 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button type="button" onClick={() => setShowGoogleKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showGoogleKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Search Engine ID (cx)</label>
                  <input type="text" value={settings.google_cx} onChange={set('google_cx')} placeholder="1234567890abcdef1" className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Регион по умолчанию</label>
              <select value={settings.default_gl} onChange={set('default_gl')} className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="kz">Казахстан</option>
                <option value="ru">Россия</option>
                <option value="uz">Узбекистан</option>
                <option value="by">Беларусь</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 mb-1">Поиск по картам</h2>
            <p className="text-xs text-slate-400 mb-4">2GIS и Google Maps возвращают телефон, сайт и email напрямую.</p>
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-2">Источник карт</label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  { id: '2gis',         title: '2GIS',                    desc: 'Лучший для СНГ. Возвращает телефон, сайт, email. Бесплатный демо-ключ на dev.2gis.com.' },
                  { id: 'yandex_maps',  title: 'Яндекс Карты',            desc: '500 запросов/день бесплатно. developer.tech.yandex.ru → «API Поиска по организациям».' },
                  { id: 'google_places',title: 'Google Places',            desc: 'Глобальное покрытие. Использует тот же Google API Key + включите «Places API (New)».' },
                  { id: 'both',         title: 'Все (2GIS + Яндекс + Google)', desc: 'Объединяет результаты всех настроенных источников, убирает дубли.' },
                ].map((e) => (
                  <button key={e.id} onClick={() => setSettings((prev) => ({ ...prev, maps_engine: e.id }))} className={`text-left p-3 rounded-xl border-2 transition-colors ${settings.maps_engine === e.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="font-medium text-sm text-slate-800 mb-0.5">{e.title}</div>
                    <p className="text-xs text-slate-500 leading-tight">{e.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {(settings.maps_engine === '2gis' || settings.maps_engine === 'both') && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="bg-green-50 border border-green-100 rounded-lg px-4 py-3 text-xs text-green-800 mb-3">
                  <p className="mb-1 font-medium">Как получить ключ:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Зайдите на <a href="https://dev.2gis.com/api" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">dev.2gis.com <ExternalLink size={9} /></a></li>
                    <li>Войдите → Platform Manager → создайте демо-ключ</li>
                    <li>Подключите <b>«Places API»</b> (поиск по организациям)</li>
                  </ol>
                  <p className="mt-1.5 text-green-700">Демо-ключ бесплатный. Возвращает телефон, сайт и email напрямую.</p>
                </div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">2GIS API Key</label>
                <div className="relative mt-1">
                  <input type={showTwoGisKey ? 'text' : 'password'} value={settings.twogis_api_key} onChange={set('twogis_api_key')} placeholder="Вставьте 2GIS API Key" className="w-full border border-slate-200 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => setShowTwoGisKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showTwoGisKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
              </div>
            )}

            {(settings.maps_engine === 'yandex_maps' || settings.maps_engine === 'both') && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-xs text-red-800 mb-3">
                  <p className="mb-1 font-medium">Как получить ключ:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Зайдите на <a href="https://developer.tech.yandex.ru/" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">developer.tech.yandex.ru <ExternalLink size={9} /></a></li>
                    <li>Создайте проект → подключите <b>«API Поиска по организациям»</b></li>
                    <li>Скопируйте API-ключ (активируется через 10–15 мин)</li>
                  </ol>
                  <p className="mt-1.5 text-red-600">Бесплатно: 500 запросов/день.</p>
                </div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Yandex Maps API Key</label>
                <div className="relative mt-1">
                  <input type={showYandexKey ? 'text' : 'password'} value={settings.yandex_maps_api_key} onChange={set('yandex_maps_api_key')} placeholder="Вставьте Yandex Maps API Key" className="w-full border border-slate-200 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => setShowYandexKey(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showYandexKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
              </div>
            )}

            {(settings.maps_engine === 'google_places' || settings.maps_engine === 'both') && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3 text-xs text-slate-600">
                  Google Places использует тот же <b>Google API Key</b>, что и поиск выше. Убедитесь, что в Google Console включён «Places API (New)».
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 mb-1">Отправка email (SMTP)</h2>
            <p className="text-xs text-slate-400 mb-4">Для Gmail: включите двухэтапную аутентификацию → «Пароли приложений» → создать пароль.</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">SMTP хост</label>
                  <input type="text" value={settings.smtp_host} onChange={set('smtp_host')} placeholder="smtp.gmail.com" className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Порт</label>
                  <input type="text" value={settings.smtp_port} onChange={set('smtp_port')} placeholder="587" className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Email (логин)</label>
                <input type="email" value={settings.smtp_user} onChange={set('smtp_user')} placeholder="yourname@gmail.com" className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Пароль / App Password</label>
                <div className="relative mt-1">
                  <input type={showPass ? 'text' : 'password'} value={settings.smtp_pass} onChange={set('smtp_pass')} placeholder="Пароль SMTP" className="w-full border border-slate-200 rounded-lg px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showPass ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Имя отправителя (From)</label>
                <input type="text" value={settings.smtp_from} onChange={set('smtp_from')} placeholder='Название Компании <yourname@gmail.com>' className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? 'Сохраняю...' : 'Сохранить настройки'}
            </button>
            {saved && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <CheckCircle size={15} /> Настройки сохранены
              </span>
            )}
          </div>
        </div>
      )}

      {tab === 'users' && isAdmin && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Пригласить пользователя</h2>
            <form onSubmit={invite} className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                placeholder="user@company.com"
                className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button type="submit" disabled={inviting} className="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap">
                {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                {inviting ? 'Создаём...' : 'Пригласить'}
              </button>
            </form>

            {inviteError && <p className="mt-2 text-sm text-red-600">{inviteError}</p>}

            {inviteLink && (
              <div className="mt-3 bg-green-50 border border-green-100 rounded-lg p-3">
                <p className="text-xs font-medium text-green-800 mb-1.5">Ссылка для приглашения (действует 48 ч):</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-green-900 bg-green-100 rounded px-2 py-1.5 break-all font-mono">
                    {inviteLink}
                  </code>
                  <button onClick={copyLink} className="flex-shrink-0 text-green-700 hover:text-green-900" title="Скопировать">
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Пользователи</h2>
            {usersLoading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 size={15} className="animate-spin" /> Загружаем...
              </div>
            ) : users.length === 0 ? (
              <p className="text-slate-400 text-sm">Пользователей нет.</p>
            ) : (
              <div className="space-y-2">
                {users.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-slate-800 truncate">{u.name ?? u.email}</p>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${u.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                          {u.role === 'admin' ? 'Админ' : 'Участник'}
                        </span>
                        {u.inviteToken && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">Ожидает регистрации</span>
                        )}
                      </div>
                      {u.name && <p className="text-xs text-slate-400 truncate">{u.email}</p>}
                    </div>
                    {u.id !== session?.user?.id && (
                      <button onClick={() => deleteUser(u.id)} className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0" title="Удалить">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
