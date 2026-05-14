'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, ExternalLink, Mail, Phone, MessageSquare, Globe,
  RefreshCw, Send, Loader2, CheckCircle, AlertCircle, FileText,
  Upload, X
} from 'lucide-react';
import StatusBadge from '@/components/StatusBadge';
import { Company, Template, Outreach } from '@/types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [company, setCompany] = useState<Company | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [scraping, setScraping] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [attachmentName, setAttachmentName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reply, setReply] = useState('');
  const [savingReply, setSavingReply] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6_000);
    return () => clearTimeout(t);
  }, [toast]);

  async function load() {
    const [cRes, tRes] = await Promise.all([
      fetch(`/api/companies/${id}`),
      fetch('/api/templates'),
    ]);
    const c = await cRes.json();
    const t = await tRes.json();
    setCompany(c);
    setTemplates(t);
    setReply(c.reply ?? '');

    const def = (t as Template[]).find((x) => x.isDefault) ?? t[0];
    if (def) {
      applyTemplate(def, c);
      setSelectedTemplate(def);
    }
  }

  useEffect(() => { load(); }, [id]);

  function applyTemplate(tpl: Template, c?: Company | null) {
    const comp = c ?? company;
    const companyName = comp?.name ?? '';
    const greeting = companyName ? `, ${companyName}` : '';
    const body = tpl.body
      .replace(/\{\{company_greeting\}\}/g, greeting)
      .replace(/\{\{company\}\}/g, companyName)
      .replace(/\{\{signature_name\}\}/g, tpl.signatureName ?? '')
      .replace(/\{\{product_description\}\}/g, tpl.productDesc)
      .replace(/\{\{signature\}\}/g, tpl.signature);
    setMessage(body);
    setSubject(tpl.subject.replace(/\{\{company\}\}/g, companyName));
  }

  async function scrape() {
    setScraping(true);
    setScrapeError(null);
    try {
      const res = await fetch(`/api/companies/${id}/scrape`, { method: 'POST' });
      const data: Record<string, unknown> = await res.json().catch(() => ({ error: 'Нет ответа от сервера' }));

      if (!res.ok || data.error) {
        setScrapeError(String(data.error ?? 'Ошибка запуска поиска'));
        setScraping(false);
        return;
      }

      if (!data.queued) {
        // already running or worker finished synchronously
        await load();
        setScraping(false);
        return;
      }

      // Poll every 3 s until scrapeJobId is cleared (worker finished)
      const poll = async () => {
        try {
          const r = await fetch(`/api/companies/${id}`).then(x => x.json());
          if (!r.scrapeJobId) {
            await load();
            setScraping(false);
            if (r.status === 'no_contacts') {
              setToast('Система не смогла найти контакты, попробуйте зайти на сайт и посмотреть.');
            }
          } else {
            setTimeout(poll, 3_000);
          }
        } catch {
          setScraping(false);
        }
      };
      setTimeout(poll, 3_000);
    } catch (e) {
      setScrapeError(e instanceof Error ? e.message : 'Ошибка соединения');
      setScraping(false);
    }
  }

  async function handleSend() {
    if (!message.trim() || !subject.trim()) return;
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch(`/api/companies/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, attachmentName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSendResult({ ok: true, msg: 'Письмо успешно отправлено!' });
      await load();
    } catch (e) {
      setSendResult({ ok: false, msg: e instanceof Error ? e.message : 'Ошибка отправки' });
    } finally {
      setSending(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    setAttachmentName(data.filename);
    setUploading(false);
  }

  async function saveReply() {
    setSavingReply(true);
    await fetch(`/api/companies/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply, status: 'replied' }),
    });
    await load();
    setSavingReply(false);
  }

  if (!company) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 size={24} className="animate-spin mr-2" /> Загрузка...
      </div>
    );
  }

  const outreaches: Outreach[] = (company.outreaches as Outreach[]) ?? [];

  return (
    <>
    <div className="p-8 max-w-5xl">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-6">
        <ArrowLeft size={15} /> Назад к компаниям
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Company Info */}
        <div className="space-y-4">
          {/* Info card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <h1 className="font-bold text-slate-900 text-lg leading-tight">{company.name}</h1>
              <StatusBadge status={company.status} />
            </div>
            {company.description && (
              <p className="text-xs text-slate-500 mb-4">{company.description}</p>
            )}

            <div className="space-y-2.5">
              {(() => {
                const w = company.website;
                const isPlaceholder = w.startsWith('maps://') || w.startsWith('internal://');
                const is2gis = w.includes('2gis.ru/firm/');
                if (isPlaceholder) {
                  return (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Globe size={15} className="shrink-0" />
                      <span className="italic">Нет сайта</span>
                    </div>
                  );
                }
                return (
                  <a href={w} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                    <Globe size={15} className="shrink-0" />
                    <span className="truncate">
                      {is2gis ? 'Открыть в 2GIS' : w.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </span>
                    <ExternalLink size={12} />
                  </a>
                );
              })()}
              {company.email && (
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Mail size={15} className="text-slate-400 shrink-0" />
                  <span className="truncate">{company.email}</span>
                </div>
              )}
              {company.phone && (
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <Phone size={15} className="text-slate-400 shrink-0" />
                  {company.phone}
                </div>
              )}
              {company.whatsapp && (
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <MessageSquare size={15} className="text-green-500 shrink-0" />
                  WhatsApp: {company.whatsapp}
                </div>
              )}
              {company.hasForm && (
                <div className="flex items-center gap-2 text-sm text-purple-600">
                  <FileText size={15} className="shrink-0" />
                  Форма обратной связи
                  {company.contactPageUrl && (
                    <a href={company.contactPageUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={scrape}
              disabled={scraping}
              className="mt-4 w-full flex items-center justify-center gap-2 text-sm border border-slate-200 text-slate-600 py-2 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              {scraping ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {scraping ? 'Ищем контакты...' : 'Найти контакты'}
            </button>
            {scrapeError && (
              <div className="mt-2 flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>{scrapeError}</span>
              </div>
            )}
          </div>

          {/* Reply section */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 text-sm mb-3">Ответ компании</h3>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              rows={4}
              placeholder="Вставьте ответ компании..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <button
              onClick={saveReply}
              disabled={savingReply || !reply.trim()}
              className="mt-2 w-full bg-emerald-600 text-white text-sm py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              {savingReply ? 'Сохраняю...' : 'Сохранить ответ'}
            </button>
          </div>

          {/* Outreach history */}
          {outreaches.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800 text-sm mb-3">История отправок</h3>
              <div className="space-y-2">
                {outreaches.map((o) => (
                  <div key={o.id} className="text-xs border border-slate-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-medium ${o.status === 'sent' ? 'text-green-600' : 'text-red-500'}`}>
                        {o.status === 'sent' ? 'Отправлено' : o.status === 'no_email' ? 'Email не найден' : 'Ошибка'}
                      </span>
                      <span className="text-slate-400">
                        {format(new Date(o.sentAt), 'd MMM HH:mm', { locale: ru })}
                      </span>
                    </div>
                    {o.errorMsg && <div className="text-red-500">{o.errorMsg}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Message Editor */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-slate-900">Сообщение</h2>
              {templates.length > 1 && (
                <select
                  value={selectedTemplate?.id ?? ''}
                  onChange={(e) => {
                    const tpl = templates.find((t) => t.id === e.target.value);
                    if (tpl) { setSelectedTemplate(tpl); applyTemplate(tpl); }
                  }}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
            </div>

            {!company.email && (
              <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4">
                <AlertCircle size={15} />
                Email не найден. Нажмите «Найти контакты» или введите email вручную.
              </div>
            )}

            {/* To field */}
            <div className="mb-3">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Кому</label>
              <input
                type="email"
                value={company.email ?? ''}
                onChange={async (e) => {
                  await fetch(`/api/companies/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: e.target.value, status: 'email_found' }),
                  });
                  setCompany((prev) => prev ? { ...prev, email: e.target.value } : prev);
                }}
                placeholder="email@company.com"
                className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {(() => {
                const all: string[] = company.allEmails ? JSON.parse(company.allEmails) : [];
                const others = all.filter(e => e !== company.email);
                if (others.length === 0) return null;
                return (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {others.map(e => (
                      <button
                        key={e}
                        type="button"
                        title="Использовать этот email"
                        onClick={async () => {
                          await fetch(`/api/companies/${id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: e, status: 'email_found' }),
                          });
                          setCompany((prev) => prev ? { ...prev, email: e } : prev);
                        }}
                        className="text-xs bg-slate-100 hover:bg-blue-100 hover:text-blue-700 text-slate-500 px-2 py-0.5 rounded-full transition-colors"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Subject */}
            <div className="mb-3">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Тема</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Body */}
            <div className="mb-4">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Текст письма</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={14}
                className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
              />
            </div>

            {/* Attachment */}
            <div className="mb-5">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide block mb-1.5">
                Вложение (PDF)
              </label>
              {attachmentName ? (
                <div className="flex items-center gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <FileText size={14} className="text-slate-400" />
                  <span className="flex-1 truncate">{attachmentName}</span>
                  <button onClick={() => setAttachmentName(null)} className="text-slate-400 hover:text-red-500">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg px-4 py-3 cursor-pointer hover:bg-slate-50">
                  {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                  {uploading ? 'Загружаю...' : 'Прикрепить PDF'}
                  <input type="file" accept=".pdf" onChange={handleUpload} className="hidden" />
                </label>
              )}
            </div>

            {sendResult && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-4 py-3 mb-4 ${
                sendResult.ok
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {sendResult.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                {sendResult.msg}
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={sending || !company.email || !message.trim()}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              {sending ? 'Отправляю...' : 'Отправить письмо'}
            </button>

            {!company.email && (
              <p className="text-xs text-slate-400 text-center mt-2">
                Укажите email выше, чтобы отправить
              </p>
            )}
          </div>
        </div>
      </div>
    </div>

    {toast && (
      <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 bg-amber-50 border border-amber-300 text-amber-800 text-sm rounded-xl shadow-lg px-5 py-4 max-w-sm">
        <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-500" />
        <span className="flex-1">{toast}</span>
        <button onClick={() => setToast(null)} className="ml-2 text-amber-400 hover:text-amber-700 shrink-0">
          <X size={14} />
        </button>
      </div>
    )}
    </>
  );
}
