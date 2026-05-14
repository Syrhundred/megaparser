import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';

const inter = Inter({ subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  title: 'MegaParser — B2B Outreach',
  description: 'Поиск компаний и отправка коммерческих предложений',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
