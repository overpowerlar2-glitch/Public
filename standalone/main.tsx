// Browser-only edition of Tabiya: everything that runs without the server (computer play, analysis,
// puzzles, openings, settings). Online features are listed on the "Online" page instead of being imitated.
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SWRConfig } from 'swr';
import { Chess } from 'chess.js';
import { ArrowRight, BookOpen, Cpu, Globe, Home, Microscope, Moon, Puzzle, Settings, Sun } from 'lucide-react';
import Link from './shims/link';
import { useNav } from './shims/nav-store';
import ComputerPage from '@/app/play/computer/page';
import AnalysisPage from '@/app/analysis/page';
import PuzzlesPage from '@/app/puzzles/page';
import OpeningsPage from '@/app/openings/page';
import SettingsPage from '@/app/settings/page';
import { Board, type BoardMove } from '@/components/board';
import { Logo } from '@/components/shell';
import { Button, Card, cx, Skeleton, toast, Toaster } from '@/components/ui';
import { api } from '@/lib/client';
import { applyAppearance, useSettings } from '@/lib/store';
import { play, playMove } from '@/lib/sound';
import { LangProvider, tx, useLang, useT, type Lang } from '@/lib/i18n';

/* ── Local stand-in for the REST API: real puzzle data, no accounts ── */
type P = { id: number; fen: string; lead: string; solution: string[]; themes: string[]; rating: number; plays: number; solves: number };
let puzzles: Promise<P[]> | null = null;
const realFetch = window.fetch.bind(window);
type Embed = { json: (n: string) => unknown; sound: (n: string) => ArrayBuffer | null };
const EMBED = (window as unknown as { __EMBED?: Embed }).__EMBED; // present only in the single-file build
const loadPuzzles = () => (puzzles ??= (EMBED ? Promise.resolve(EMBED.json('puzzles')) : realFetch('data/puzzles.json').then((r) => r.json())).then((rows) => (rows as Omit<P, 'id' | 'plays' | 'solves'>[])).then((rows) => rows.map((p, i) => ({ ...p, id: i + 1, plays: 0, solves: 0 }))));
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

async function localApi(url: URL, init?: RequestInit): Promise<Response> {
  const p = url.pathname, q = url.searchParams;
  if (p === '/api/me') return json({ user: null });
  if (p === '/api/openings/stats') return json({ moves: [] });
  if (p === '/api/puzzles/attempt' && init?.method === 'POST') return json({ rated: false });
  if (p === '/api/puzzles/daily') {
    const all = (await loadPuzzles()).filter((x) => x.rating >= 1200 && x.rating <= 1900);
    const date = new Date().toISOString().slice(0, 10);
    let h = 0; for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return json({ puzzle: all[h % all.length] ?? null, date });
  }
  if (p === '/api/puzzles/next') {
    const theme = q.get('theme'), rating = Math.min(2600, Math.max(600, Number(q.get('rating')) || 1300));
    const exclude = new Set((q.get('exclude') || '').split(',').map(Number));
    const all = (await loadPuzzles()).filter((x) => !theme || x.themes.includes(theme));
    for (const w of [120, 300, 700, 5000]) {
      const pool = all.filter((x) => Math.abs(x.rating - rating) <= w && !exclude.has(x.id));
      if (pool.length) return json({ puzzle: pool[Math.floor(Math.random() * pool.length)] });
    }
    return all.length ? json({ puzzle: all[Math.floor(Math.random() * all.length)] }) : json({ error: 'No puzzles available.' }, 404);
  }
  return json({ error: 'This needs the Tabiya server, which is not part of the browser-only edition.' }, 404);
}
window.fetch = (input, init) => {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (raw.startsWith('/api/')) return localApi(new URL(raw, 'http://local'), init);
  if (EMBED && raw === '/data/openings.json') return Promise.resolve(json(EMBED.json('openings')));
  if (EMBED && raw.startsWith('/sounds/')) { const b = EMBED.sound(raw.slice(8, -4)); return Promise.resolve(b ? new Response(b) : new Response(null, { status: 404 })); }
  if (raw.startsWith('/data/') || raw.startsWith('/sounds/')) return realFetch(raw.slice(1), init); // the page's own files, by relative path
  return realFetch(input, init);
};
// Downloads are blocked inside the viewer, so a "download" copies the file's text instead.
const anchorClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
  if (!this.download || !this.href.startsWith('blob:')) return anchorClick.call(this);
  realFetch(this.href).then((r) => r.text()).then((t) => navigator.clipboard.writeText(t))
    .then(() => toast.success(tx('PGN copied to the clipboard (file downloads are unavailable in this preview).')))
    .catch(() => toast.error(tx('Could not copy the PGN. Use "Copy PGN" instead.')));
};

/* ── Pages ── */
function DailyBoard() {
  const tr = useT();
  const [p, setP] = useState<P | null>(null);
  const [fen, setFen] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'right' | 'wrong'>('idle');
  useEffect(() => { api<{ puzzle: P | null }>('/api/puzzles/daily').then((d) => setP(d.puzzle)).catch(() => {}); }, []);
  const start = useMemo(() => { if (!p) return null; const c = new Chess(p.fen); const m = c.move({ from: p.lead.slice(0, 2), to: p.lead.slice(2, 4), promotion: p.lead[4] }); return { fen: c.fen(), last: [m.from, m.to] as [string, string], turn: c.turn() }; }, [p]);
  if (!p || !start) return <Skeleton className="aspect-square w-full" />;
  const onMove = (m: BoardMove) => {
    const c = new Chess(start.fen); const mv = c.move(m);
    if (mv.from + mv.to + (mv.promotion ?? '') === p.solution[0] || c.isCheckmate()) { playMove(mv.san); play('success'); setFen(c.fen()); setState('right'); }
    else { play('error'); setState('wrong'); setTimeout(() => setState('idle'), 1200); }
  };
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-mute">{tr("Puzzle of the day")}</p>
        <p className={cx('text-sm font-medium', state === 'right' ? 'text-good' : state === 'wrong' ? 'text-bad' : 'text-ink')}>{tr(state === 'right' ? 'Correct!' : state === 'wrong' ? 'Not quite — try again' : start.turn === 'w' ? 'White to move' : 'Black to move')}</p>
      </div>
      <div className={cx(state === 'wrong' && 'shake')}><Board fen={fen ?? start.fen} orientation={start.turn} movable={state === 'right' ? null : start.turn} onMove={onMove} lastMove={fen ? null : start.last} /></div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-mute">{tr("Rated")} <span className="tnum font-mono text-ink">{p.rating}</span></span>
        <Link href="/puzzles?mode=daily" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">{tr(state === 'right' ? 'See the full solution' : 'Open in puzzles')} <ArrowRight className="size-4" /></Link>
      </div>
    </div>
  );
}

function HomePage() {
  const tr = useT();
  const tiles = [
    { href: '/play/computer', icon: Cpu, title: 'Play the computer', text: 'Six Stockfish levels' },
    { href: '/puzzles', icon: Puzzle, title: 'Solve puzzles', text: 'Training, daily and streak' },
    { href: '/analysis', icon: Microscope, title: 'Analyse', text: 'Engine review of any game' },
    { href: '/openings', icon: BookOpen, title: 'Openings', text: '3,865 named lines' },
  ];
  return (
    <div className="space-y-12">
      <section className="grid items-center gap-10 pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:pt-6">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-mute"><span className="size-2 rounded-full bg-accent" /> {tr("Browser-only edition · runs without a server")}</p>
          <h1 className="font-display text-[clamp(3rem,7vw,5.5rem)] leading-[0.95] tracking-tight">{tr("Your move.")}<br /><span className="italic text-accent">{tr("Make it count.")}</span></h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-mute">{tr("Play Stockfish, review games with a full-strength engine, and solve puzzles checked move by move — all inside this page.")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" href="/play/computer"><Cpu className="size-4" /> {tr("Play the computer")}</Button>
            <Button size="lg" href="/puzzles">{tr("Solve puzzles")}</Button>
          </div>
        </div>
        <DailyBoard />
      </section>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/60">
            <t.icon className="size-5 text-accent" strokeWidth={1.8} /><p className="mt-3 font-semibold">{tr(t.title)}</p><p className="text-[13px] text-mute">{tr(t.text)}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

function OnlinePage() {
  const tr = useT();
  const items = ['Real-time games against other players, with pairing, invitation links and chat', 'Accounts, ratings, profiles and game history', 'Leaderboards and live games to watch', 'Opening statistics from games played on your server'];
  return (
    <div className="mx-auto max-w-2xl py-6">
      <h1 className="font-display text-5xl leading-none">{tr("Online play needs the server")}</h1>
      <p className="mt-3 text-mute">{tr("This page is the browser-only edition of Tabiya. It has no backend, so the features below are left out here rather than imitated. They are implemented and tested in the full project.")}</p>
      <Card className="mt-6 divide-y divide-line/60">{items.map((t) => <p key={t} className="flex items-start gap-3 px-4 py-3 text-sm"><Globe className="mt-0.5 size-4 shrink-0 text-accent" /> {tr(t)}</p>)}</Card>
      <p className="mt-6 text-sm text-mute">{tr("To use them, run the full project.")} <code className="font-mono text-ink" dir="ltr">npm install · npm run db:migrate · npm run db:seed · npm run dev</code></p>
      <div className="mt-6 flex gap-3"><Button variant="primary" href="/play/computer">{tr("Play the computer")}</Button><Button href="/">{tr("Back to home")}</Button></div>
    </div>
  );
}

const NAV = [
  { href: '/', label: 'Home', icon: Home }, { href: '/play/computer', label: 'Computer', icon: Cpu }, { href: '/puzzles', label: 'Puzzles', icon: Puzzle },
  { href: '/analysis', label: 'Analysis', icon: Microscope }, { href: '/openings', label: 'Openings', icon: BookOpen }, { href: '/online', label: 'Online', icon: Globe }, { href: '/settings', label: 'Settings', icon: Settings },
];
const PAGES: Record<string, () => React.ReactNode> = { '/': HomePage, '/play/computer': ComputerPage, '/analysis': AnalysisPage, '/puzzles': PuzzlesPage, '/openings': OpeningsPage, '/settings': SettingsPage, '/online': OnlinePage };

function App() {
  const { lang, setLang } = useLang();
  const tr = useT();
  const { path, n } = useNav();
  const { theme, board, animation, set } = useSettings();
  useEffect(() => applyAppearance({ theme, board, animation }), [theme, board, animation]);
  const Page = PAGES[path] ?? HomePage;
  return (
    <SWRConfig value={{ fetcher: api, shouldRetryOnError: false }}>
      <div className="min-h-dvh lg:ps-[216px]">
        <aside className="fixed inset-y-0 start-0 z-30 hidden w-[216px] flex-col border-e border-line bg-surface/60 px-3 py-5 lg:flex">
          <Link href="/" className="mb-7 px-2" aria-label={tr("Tabiya home")}><Logo /></Link>
          <nav className="flex flex-col gap-0.5" aria-label={tr("Main")}>
            {NAV.map((i) => (
              <Link key={i.href} href={i.href} aria-current={path === i.href ? 'page' : undefined} className={cx('flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors', path === i.href ? 'bg-raised text-ink' : 'text-mute hover:bg-raised/60 hover:text-ink')}>
                <i.icon className={cx('size-[18px]', path === i.href && 'text-accent')} strokeWidth={1.9} /> {tr(i.label)}
              </Link>
            ))}
          </nav>
        </aside>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md sm:px-6">
          <Link href="/" className="lg:hidden" aria-label={tr("Tabiya home")}><Logo size={22} /></Link>
          <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label={tr('Language')} className="ms-auto rounded-lg px-2 py-1.5 text-[13px] font-semibold text-mute hover:bg-raised hover:text-ink">{lang === 'ar' ? 'English' : 'العربية'}</button>
          <button onClick={() => set({ theme: theme === 'dark' ? 'light' : 'dark' })} aria-label={tr("Toggle colour theme")} className=" rounded-lg p-2 text-mute hover:bg-raised hover:text-ink">{theme === 'light' ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}</button>
        </header>
        <main className="mx-auto w-full max-w-[1320px] px-4 pb-28 pt-6 sm:px-6 lg:pb-12"><Page key={`${path}:${n}`} /></main>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden" aria-label={tr("Main")}>
          {NAV.filter((i) => i.href !== '/online').map((i) => (
            <Link key={i.href} href={i.href} className={cx('flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium', path === i.href ? 'text-accent' : 'text-mute')}><i.icon className="size-5" strokeWidth={1.9} /> {tr(i.label)}</Link>
          ))}
        </nav>
      </div>
      <Toaster />
    </SWRConfig>
  );
}
// Language: saved choice, else the browser's preference. No server here, so it is decided on load.
function initialLang(): Lang {
  try { const v = localStorage.getItem('tabiya_lang'); if (v === 'ar' || v === 'en') return v; } catch { /* storage unavailable */ }
  const c = document.cookie.match(/tabiya_lang=(ar|en)/)?.[1] as Lang | undefined;
  return c ?? (navigator.language.toLowerCase().startsWith('ar') ? 'ar' : 'en');
}
const lang0 = initialLang();
document.documentElement.lang = lang0;
document.documentElement.dir = lang0 === 'ar' ? 'rtl' : 'ltr';
createRoot(document.getElementById('root')!).render(<LangProvider initial={lang0}><App /></LangProvider>);
