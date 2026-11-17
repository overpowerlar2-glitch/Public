import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { Shell } from '@/components/shell';

export const metadata: Metadata = {
  title: { default: 'Tabiya — play chess online', template: '%s · Tabiya' },
  description: 'Real-time chess with rated games, Stockfish analysis, puzzles and an opening explorer.',
};
export const viewport: Viewport = { themeColor: '#0d0e10', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

// Applies the saved theme before first paint so there is no flash of the wrong colours.
const boot = `try{var s=JSON.parse(localStorage.getItem('tabiya-settings')||'{}').state||{};var d=document.documentElement;d.dataset.theme=s.theme||'dark';d.dataset.board=s.board||'walnut';d.dataset.anim=s.animation===false?'off':'on'}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-board="walnut" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: boot }} /></head>
      <body>
        <Providers><Shell>{children}</Shell></Providers>
      </body>
    </html>
  );
}
