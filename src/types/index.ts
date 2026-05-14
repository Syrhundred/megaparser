export type CompanyStatus =
  | 'site_found'
  | 'contact_found'
  | 'email_found'
  | 'form_found'
  | 'message_ready'
  | 'sent'
  | 'send_error'
  | 'replied'
  | 'no_contacts';

export const STATUS_LABELS: Record<CompanyStatus, string> = {
  site_found: 'Сайт найден',
  contact_found: 'Контакт найден',
  email_found: 'Email найден',
  form_found: 'Форма найдена',
  message_ready: 'Сообщение готово',
  sent: 'Отправлено',
  send_error: 'Ошибка отправки',
  replied: 'Ответ получен',
  no_contacts: 'Нет контактов',
};

export const STATUS_COLORS: Record<CompanyStatus, string> = {
  site_found: 'bg-slate-100 text-slate-700',
  contact_found: 'bg-blue-100 text-blue-700',
  email_found: 'bg-cyan-100 text-cyan-700',
  form_found: 'bg-purple-100 text-purple-700',
  message_ready: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-green-100 text-green-700',
  send_error: 'bg-red-100 text-red-700',
  replied: 'bg-emerald-100 text-emerald-700',
  no_contacts: 'bg-gray-100 text-gray-500',
};

export interface Company {
  id: string;
  name: string;
  website: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  contactPageUrl: string | null;
  description: string | null;
  address: string | null;
  hasForm: boolean;
  allEmails: string | null; // JSON-encoded string[]
  status: CompanyStatus;
  searchQuery: string | null;
  sentMessage: string | null;
  sentAt: string | null;
  reply: string | null;
  foundAt: string;
  createdAt: string;
  updatedAt: string;
  scrapeJobId?: string | null;
  sendJobId?: string | null;
  outreaches?: Outreach[];
}

export interface Outreach {
  id: string;
  companyId: string;
  channel: string;
  subject: string | null;
  message: string;
  status: string;
  errorMsg: string | null;
  sentAt: string;
  company?: Company;
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  body: string;
  productDesc: string;
  signatureName: string;
  signature: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  existingId?: string | null;
}

export interface MapsResult {
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  source: 'yandex_maps' | 'google_places' | '2gis';
  twoGisId?: string;
  existingId?: string | null;
}
