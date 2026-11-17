import type { Metadata, Viewport } from 'next';
import { cookies, headers } from 'next/headers';
import './globals.css';
import { Providers } from '@/components/providers';
import { Shell } from '@/components/shell';
import { LangProvider, type Lang } from '@/lib/i18n';

export const metadata: Metadata = {
  title: { default: 'Tabiya', template: '%s · Tabiya' },
  description: 'Real-time chess with rated games, Stockfish analysis, puzzles and an opening explorer.',
};
export const viewport: Viewport = { themeColor: '#0d0e10', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

// Applies the saved theme before first paint so there is no flash of the wrong colours.
const boot = `try{var s=JSON.parse(localStorage.getItem('tabiya-settings')||'{}').state||{};var d=document.documentElement;d.dataset.theme=s.theme||'dark';d.dataset.board=s.board||'walnut';d.dataset.anim=s.animation===false?'off':'on'}catch(e){}`;

/** Saved choice first; otherwise Arabic when the browser asks for it. */
async function pickLang(): Promise<Lang> {
  const saved = (await cookies()).get('tabiya_lang')?.value;
  if (saved === 'ar' || saved === 'en') return saved;
  return /^ar\b/i.test((await headers()).get('accept-language') || '') ? 'ar' : 'en';
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await pickLang();
  return (
    <html lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} data-theme="dark" data-board="walnut" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: boot }} /></head>
      <body>
        <LangProvider initial={lang}><Providers><Shell>{children}</Shell></Providers></LangProvider>
      </body>
    </html>
  );
}
