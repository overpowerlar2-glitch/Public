'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { BookOpen, Eye, LogIn, LogOut, Microscope, Moon, Puzzle, Search, Settings, Sun, Swords, Trophy, Home, Play } from 'lucide-react';
import { api, useMe } from '@/lib/client';
import { useSettings } from '@/lib/store';
import { emitAck, getSocket } from '@/lib/socket';
import { Avatar, Button, cx, flag, toast } from './ui';

const NAV = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/play', label: 'Play', icon: Swords, match: (p: string) => p.startsWith('/play') || p.startsWith('/game') },
  { href: '/puzzles', label: 'Puzzles', icon: Puzzle, match: (p: string) => p.startsWith('/puzzles') },
  { href: '/analysis', label: 'Analysis', icon: Microscope, match: (p: string) => p.startsWith('/analysis') },
  { href: '/openings', label: 'Openings', icon: BookOpen, match: (p: string) => p.startsWith('/openings') },
  { href: '/watch', label: 'Watch', icon: Eye, match: (p: string) => p.startsWith('/watch') },
  { href: '/leaderboard', label: 'Leaderboard', icon: Trophy, match: (p: string) => p.startsWith('/leaderboard') },
];

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden>
        <rect x="1" y="1" width="26" height="26" rx="6" fill="var(--raised)" stroke="var(--line)" />
        <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" fill="var(--ink)" opacity="0.85" />
        <rect x="14.5" y="14.5" width="8.5" height="8.5" rx="1.5" fill="var(--ink)" opacity="0.85" />
        <rect x="14.5" y="5" width="8.5" height="8.5" rx="1.5" fill="var(--accent)" />
      </svg>
      <span className="font-display text-[26px] leading-none tracking-tight">Tabiya</span>
    </span>
  );
}

function PlayerSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const term = q.trim();
  const { data, isLoading } = useSWR<{ users: { username: string; avatar: string | null; country: string; blitz: number | null; online: boolean }[] }>(term.length >= 2 ? `/api/users/search?q=${encodeURIComponent(term)}` : null, api, { keepPreviousData: true });
  useEffect(() => {
    const h = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div ref={box} className="relative w-full max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" aria-hidden />
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Find a player" aria-label="Find a player"
        onKeyDown={(e) => { if (e.key === 'Enter' && data?.users[0]) { router.push(`/u/${data.users[0].username}`); setOpen(false); setQ(''); } if (e.key === 'Escape') setOpen(false); }}
        className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-mute/70 focus:border-accent focus:outline-none" />
      {open && term.length >= 2 && (
        <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          {isLoading && !data ? <p className="px-4 py-3 text-sm text-mute">Searching…</p>
            : !data?.users.length ? <p className="px-4 py-3 text-sm text-mute">No players match “{term}”.</p>
            : data.users.map((u) => (
              <Link key={u.username} href={`/u/${u.username}`} onClick={() => { setOpen(false); setQ(''); }} className="flex items-center gap-3 px-3 py-2 hover:bg-raised">
                <Avatar name={u.username} src={u.avatar} size={28} online={u.online} />
                <span className="flex-1 truncate text-sm font-medium">{u.username} <span className="ml-1">{flag(u.country)}</span></span>
                <span className="tnum text-xs text-mute">{u.blitz ?? '—'}</span>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}

/** A pill linking back to a game in progress, so a player who navigated away can always return. */
function ResumeGame() {
  const { ready: loaded, me, restricted } = useMe();
  const ready = loaded && (!restricted || !!me);
  const pathname = usePathname();
  const [games, setGames] = useState<{ id: string; opponent: string }[]>([]);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const load = () => emitAck<{ games: { id: string; opponent: string }[] }>('my:games').then((r) => alive && setGames(r.games)).catch(() => {});
    load();
    const s = getSocket();
    s.on('connect', load);
    const t = setInterval(load, 15000);
    return () => { alive = false; s.off('connect', load); clearInterval(t); };
  }, [ready, pathname]);
  const g = games.find((x) => !pathname.includes(x.id));
  if (!g) return null;
  return (
    <Link href={`/game/${g.id}`} className="pulse-ring inline-flex h-9 items-center gap-2 rounded-full bg-accent px-3.5 text-[13px] font-semibold text-accent-ink">
      <Play className="size-3.5 fill-current" /> <span className="hidden sm:inline">Game in progress vs {g.opponent}</span><span className="sm:hidden">Resume</span>
    </Link>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, loading, ready, restricted } = useMe();
  const { theme, set } = useSettings();
  const open = ['/login', '/register', '/forgot', '/reset', '/verify'].includes(pathname);
  useEffect(() => { if (ready && restricted && !me && !open) router.replace(`/login?next=${encodeURIComponent(pathname)}`); }, [ready, restricted, me, open, pathname, router]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); window.location.assign(restricted ? '/login' : '/'); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="min-h-dvh lg:pl-[232px]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-surface/60 px-3 py-5 lg:flex">
        <Link href="/" className="mb-7 px-2" aria-label="Tabiya home"><Logo /></Link>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Main">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}
                className={cx('group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors', active ? 'bg-raised text-ink' : 'text-mute hover:bg-raised/60 hover:text-ink')}>
                <n.icon className={cx('size-[18px] transition-colors', active && 'text-accent')} strokeWidth={1.9} /> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 space-y-1 border-t border-line pt-4">
          {loading ? <div className="skeleton h-11" /> : me ? (
            <>
              <Link href={`/u/${me.username}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-raised">
                <Avatar name={me.username} src={me.avatar} size={32} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{me.username}</span><span className="tnum block text-xs text-mute">Blitz {me.ratings.blitz?.rating ?? 1500}</span></span>
              </Link>
              <Link href="/settings" className={cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-mute hover:bg-raised hover:text-ink', pathname === '/settings' && 'bg-raised text-ink')}><Settings className="size-4" /> Settings</Link>
              <button onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-mute hover:bg-raised hover:text-ink"><LogOut className="size-4" /> Sign out</button>
            </>
          ) : (
            <>
              <Button href="/register" variant="primary" className="w-full">Create account</Button>
              <Button href="/login" variant="ghost" className="mt-1 w-full"><LogIn className="size-4" /> Sign in</Button>
              <Link href="/settings" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-mute hover:bg-raised hover:text-ink"><Settings className="size-4" /> Settings</Link>
            </>
          )}
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-md sm:px-6">
        <Link href="/" className="lg:hidden" aria-label="Tabiya home"><Logo size={22} /></Link>
        <div className="hidden flex-1 sm:block"><PlayerSearch /></div>
        <div className="ml-auto flex items-center gap-2">
          <ResumeGame />
          <button onClick={() => set({ theme: theme === 'dark' ? 'light' : 'dark' })} aria-label="Toggle colour theme" className="rounded-lg p-2 text-mute hover:bg-raised hover:text-ink">
            {mounted && theme === 'light' ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
          </button>
          <div className="lg:hidden">
            {me ? <Link href={`/u/${me.username}`} aria-label="Your profile"><Avatar name={me.username} src={me.avatar} size={30} /></Link>
              : !loading && <Button href="/login" size="sm" variant="primary">Sign in</Button>}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1320px] px-4 pb-28 pt-6 sm:px-6 lg:pb-12">{ready && restricted && !me && !open ? null : children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden" aria-label="Main">
        {[NAV[1], NAV[2], NAV[3], NAV[5], { href: '/settings', label: 'Settings', icon: Settings, match: (p: string) => p === '/settings' }].map((n) => {
          const active = n.match(pathname);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={cx('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', active ? 'text-accent' : 'text-mute')}>
              <n.icon className="size-5" strokeWidth={1.9} /> {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
