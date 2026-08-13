import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexus',
  description: 'Nexus — Boards, Repos, Pipelines, Test Plans, and Chat, under one identity plane.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Locale is fixed to 'en' today — see i18n.ts's docblock for why and
  // what real resolution will look like once services/auth grows a
  // tenant/user locale column.
  const messages = await getMessages();

  return (
    <html lang="en">
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
