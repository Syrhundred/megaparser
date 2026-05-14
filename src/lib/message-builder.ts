export interface MessageParams {
  companyName?: string | null;
  templateBody: string;
  productDesc: string;
  signatureName: string;
  signature: string;
}

export function buildMessage(params: MessageParams): string {
  const greeting = params.companyName ? `, ${params.companyName}` : '';
  let msg = params.templateBody;
  msg = msg.replace(/\{\{company_greeting\}\}/g, greeting);
  msg = msg.replace(/\{\{company\}\}/g, params.companyName ?? '');
  msg = msg.replace(/\{\{signature_name\}\}/g, params.signatureName);
  msg = msg.replace(/\{\{product_description\}\}/g, params.productDesc);
  msg = msg.replace(/\{\{signature\}\}/g, params.signature);
  return msg.trim();
}

export function buildSubject(subject: string, companyName?: string | null): string {
  return subject.replace(/\{\{company\}\}/g, companyName ?? '');
}

export const DEFAULT_TEMPLATE = {
  name: 'Стандартный шаблон',
  subject: 'Коммерческое предложение — запрос о наличии товара',
  body: `Здравствуйте{{company_greeting}}.

Меня зовут {{signature_name}}, мы представляем компанию по производству и поставке электрооборудования.

Хотели бы направить вам краткое описание нашего товара и уточнить, есть ли потенциальный интерес к сотрудничеству.

{{product_description}}

Если сотрудничество потенциально интересно, просим выслать реквизиты вашей компании в ответном письме.

С уважением,
{{signature}}`,
  productDesc: `Мы предлагаем:
• Комплектные трансформаторные подстанции (КТП, БКТП) от 25 до 2500 кВА
• Шкафы управления и автоматики
• Электрощитовое оборудование (ВРУ, АВР, ЩУ)
• Подстанции 35/10 кВ

Производство собственное, гарантия 24 месяца, доставка по всему Казахстану и СНГ.`,
  signatureName: '',
  signature: `[Ваше имя]
[Название компании]
[Телефон]
[Email]`,
  isDefault: true,
};
