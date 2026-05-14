'use client';

import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Zap, Loader2 } from 'lucide-react';
import Link from 'next/link';

function RegisterForm() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('Пароль должен быть не менее 8 символов'); return; }
    setError('');
    setLoading(true);

    const res = await fetch('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Ошибка регистрации');
      setLoading(false);
      return;
    }

    await signIn('credentials', { email, password, redirect: false });
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-600 rounded-xl mb-4">
            <Zap size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Регистрация</h1>
          <p className="text-slate-500 text-sm mt-1">MegaParser · B2B Outreach Platform</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@company.com"
                className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Имя
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Иван Иванов"
                className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Минимум 8 символов"
                className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 mt-2 transition-colors"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'Создаём аккаунт...' : 'Зарегистрироваться'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-slate-500 mt-4">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="text-blue-600 hover:underline font-medium">
            Войти
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <Loader2 className="animate-spin text-slate-400" size={24} />
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
