'use client';

import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, CheckCircle, Loader2, Eye, Pencil } from 'lucide-react';
import { Template } from '@/types';

const EMPTY: Omit<Template, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  subject: '',
  body: '',
  productDesc: '',
  signatureName: '',
  signature: '',
  isDefault: false,
};

type Tab = 'editor' | 'preview';

// Variables the template engine knows about
const VAR_META: Record<string, { label: string; auto: boolean }> = {
  company:             { label: 'Название компании',  auto: true  },
  company_greeting:    { label: 'Приветствие',         auto: true  },
  signature_name:      { label: 'Имя отправителя',    auto: false },
  product_description: { label: 'Описание товара',    auto: false },
  signature:           { label: 'Подпись',             auto: false },
};

function extractVars(text: string): string[] {
  const matches = text.match(/\{\{([^}]+)\}\}/g) ?? [];
  return [...new Set(matches.map(m => m.slice(2, -2).trim()))];
}

function renderPreview(form: typeof EMPTY, sampleCompany: string): string {
  const greeting = sampleCompany ? `, ${sampleCompany}` : '';
  return form.body
    .replace(/\{\{company_greeting\}\}/g, greeting)
    .replace(/\{\{company\}\}/g, sampleCompany)
    .replace(/\{\{signature_name\}\}/g, form.signatureName || '【Имя отправителя】')
    .replace(/\{\{product_description\}\}/g, form.productDesc || '【Описание товара】')
    .replace(/\{\{signature\}\}/g, form.signature || '【Подпись】');
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<Tab>('editor');
  const [sampleCompany, setSampleCompany] = useState('ТОО «Пример Компании»');

  async function load() {
    const res = await fetch('/api/templates');
    const data = await res.json();
    setTemplates(data);
    if (!selected && data.length > 0) pick(data[0]);
  }

  useEffect(() => { load(); }, []);

  function pick(t: Template) {
    setSelected(t);
    setForm({
      name:          t.name,
      subject:       t.subject,
      body:          t.body,
      productDesc:   t.productDesc,
      signatureName: t.signatureName ?? '',
      signature:     t.signature,
      isDefault:     t.isDefault,
    });
    setSaved(false);
    setTab('editor');
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    if (selected) {
      await fetch(`/api/templates/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    } else {
      await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    }
    await load();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2_000);
  }

  async function deleteTemplate(id: string) {
    if (!confirm('Удалить шаблон?')) return;
    await fetch(`/api/templates/${id}`, { method: 'DELETE' });
    setSelected(null);
    setForm({ ...EMPTY });
    await load();
  }

  function newTemplate() {
    setSelected(null);
    setForm({ ...EMPTY });
    setTab('editor');
  }

  const field = (key: keyof typeof form) => ({
    value: String(form[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value })),
  });

  const bodyVars = extractVars(form.body);
  const subjectVars = extractVars(form.subject);
  const allVars = [...new Set([...bodyVars, ...subjectVars])];

  const previewSubject = form.subject.replace(/\{\{company\}\}/g, sampleCompany);
  const previewBody = renderPreview(form, sampleCompany);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Шаблоны</h1>
        <p className="text-slate-500 mt-1">Темы, тексты писем и переменные</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-56 shrink-0">
          <button
            onClick={newTemplate}
            className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50 rounded-lg py-2.5 text-sm mb-3"
          >
            <Plus size={15} /> Новый шаблон
          </button>
          <div className="space-y-1">
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => pick(t)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  selected?.id === t.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="font-medium truncate">{t.name || 'Без названия'}</div>
                {t.isDefault && (
                  <div className={`text-xs mt-0.5 ${selected?.id === t.id ? 'text-blue-200' : 'text-blue-500'}`}>
                    По умолчанию
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Editor / Preview panel */}
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          {selected === null && templates.length === 0 ? (
            <div className="text-center py-12 text-slate-400">Загрузка...</div>
          ) : (
            <>
              {/* Tab bar */}
              <div className="flex items-center justify-between border-b border-slate-100 px-6 pt-4 pb-0">
                <div className="flex gap-1">
                  <button
                    onClick={() => setTab('editor')}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                      tab === 'editor'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Pencil size={13} /> Редактор
                  </button>
                  <button
                    onClick={() => setTab('preview')}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                      tab === 'preview'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Eye size={13} /> Предпросмотр
                  </button>
                </div>

                {/* Variable chips — always visible */}
                {allVars.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {allVars.map(v => {
                      const meta = VAR_META[v];
                      return meta ? (
                        <span
                          key={v}
                          title={meta.label}
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            meta.auto
                              ? 'bg-slate-100 text-slate-500'
                              : 'bg-blue-50 text-blue-600 border border-blue-200'
                          }`}
                        >
                          {`{{${v}}}`} — {meta.label}
                        </span>
                      ) : (
                        <span key={v} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                          {`{{${v}}}`} — неизвестная
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Editor tab */}
              {tab === 'editor' && (
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Название шаблона</label>
                    <input
                      {...field('name')}
                      placeholder="Например: Основной шаблон"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Тема письма</label>
                    <input
                      {...field('subject')}
                      placeholder="Коммерческое предложение — {{company}}"
                      className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Текст письма</label>
                    <textarea
                      {...field('body')}
                      rows={12}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono"
                    />
                  </div>

                  {/* Variable inputs */}
                  <div className="border border-slate-100 rounded-xl p-4 space-y-4 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Значения переменных</p>

                    <div>
                      <label className="text-xs font-medium text-slate-600">
                        Имя отправителя <code className="bg-white border border-slate-200 px-1 rounded text-[10px]">{'{{signature_name}}'}</code>
                      </label>
                      <input
                        {...field('signatureName')}
                        placeholder="Например: Алексей Иванов"
                        className="mt-1 w-full border border-slate-200 bg-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-600">
                        Описание товара <code className="bg-white border border-slate-200 px-1 rounded text-[10px]">{'{{product_description}}'}</code>
                      </label>
                      <textarea
                        {...field('productDesc')}
                        rows={6}
                        placeholder="Краткое описание вашего товара..."
                        className="mt-1 w-full border border-slate-200 bg-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-600">
                        Подпись <code className="bg-white border border-slate-200 px-1 rounded text-[10px]">{'{{signature}}'}</code>
                      </label>
                      <textarea
                        {...field('signature')}
                        rows={4}
                        placeholder="С уважением, Имя Фамилия..."
                        className="mt-1 w-full border border-slate-200 bg-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>

                    <div className="text-xs text-slate-400">
                      <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full mr-1">Авто</span>
                      <code>{'{{company}}'}</code> и <code>{'{{company_greeting}}'}</code> подставляются автоматически из названия компании при отправке.
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="isDefault"
                      checked={form.isDefault}
                      onChange={e => setForm(p => ({ ...p, isDefault: e.target.checked }))}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <label htmlFor="isDefault" className="text-sm text-slate-600">
                      Использовать как шаблон по умолчанию
                    </label>
                  </div>

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={save}
                      disabled={saving}
                      className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                      {saving ? 'Сохраняю...' : 'Сохранить'}
                    </button>
                    {saved && (
                      <span className="flex items-center gap-1 text-sm text-green-600">
                        <CheckCircle size={15} /> Сохранено
                      </span>
                    )}
                    {selected && (
                      <button
                        onClick={() => deleteTemplate(selected.id)}
                        className="ml-auto flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={15} /> Удалить
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Preview tab */}
              {tab === 'preview' && (
                <div className="p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <label className="text-xs font-medium text-slate-500 shrink-0">Название компании для теста:</label>
                    <input
                      value={sampleCompany}
                      onChange={e => setSampleCompany(e.target.value)}
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    {/* Email header */}
                    <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 space-y-1.5">
                      <div className="flex items-baseline gap-3">
                        <span className="text-xs text-slate-400 w-12 shrink-0">Кому:</span>
                        <span className="text-sm text-slate-600">email@{sampleCompany.toLowerCase().replace(/[^a-zа-я0-9]/gi, '').slice(0, 12) || 'company'}.kz</span>
                      </div>
                      <div className="flex items-baseline gap-3">
                        <span className="text-xs text-slate-400 w-12 shrink-0">Тема:</span>
                        <span className="text-sm font-medium text-slate-800">{previewSubject || '—'}</span>
                      </div>
                    </div>
                    {/* Email body */}
                    <div className="px-6 py-5 bg-white">
                      <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                        {previewBody || <span className="text-slate-400 italic">Тело письма пусто</span>}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
