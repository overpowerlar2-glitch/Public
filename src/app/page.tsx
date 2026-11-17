'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Chess } from 'chess.js';
import { motion } from 'motion/react';
import { ArrowRight, BookOpen, Cpu, Microscope, Puzzle, Users, X, Zap } from 'lucide-react';
import { Board, type BoardMove } from '@/components/board';
import { LiveGameCard, useLobby } from '@/components/mini';
import { Button, Card, cx, Empty, flag, SectionTitle, Skeleton, Spinner, toast } from '@/components/ui';
import { api, useMe } from '@/lib/client';
import { emitAck, getSocket } from '@/lib/socket';
import { play, playMove } from '@/lib/sound';
import type { PuzzleDTO } from '@/lib/puzzles';
import type { Ack } from '@/lib/types';

type Home = { players: number; games: number; puzzles: number; top: { username: string; rating: number; category: string; country: string }[]; live: { online: number; playing: number; seeking: number } };

/** The hero board is today's puzzle: playable in place, so the first thing a visitor does is make a move. */
function DailyBoard() {
  const { data, error } = useSWR<{ puzzle: PuzzleDTO | null; date: string }>('/api/puzzles/daily', api);
  const p = data?.puzzle;
  const start = useMemo(() => { if (!p) return null; const c = new Chess(p.fen); const m = c.move({ from: p.lead.slice(0, 2), to: p.lead.slice(2, 4), promotion: p.lead[4] }); return { fen: c.fen(), last: [m.from, m.to] as [string, string], turn: c.turn() }; }, [p]);
  const [fen, setFen] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'right' | 'wrong'>('idle');
  if (error || (data && !p)) return <Empty title="Today's puzzle is not available">Load the puzzle set with <code className="font-mono">npm run db:seed</code>.</Empty>;
  if (!p || !start) return <Skeleton className="aspect-square w-full" />;
  const onMove = (m: BoardMove) => {
    const c = new Chess(start.fen);
    const mv = c.move(m);
    if (mv.from + mv.to + (mv.promotion ?? '') === p.solution[0] || c.isCheckmate()) { playMove(mv.san); play('success'); setFen(c.fen()); setState('right'); }
    else { play('error'); setState('wrong'); setTimeout(() => setState('idle'), 1200); }
  };
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-mute">Puzzle of the day</p>
        <p className={cx('text-sm font-medium', state === 'right' ? 'text-good' : state === 'wrong' ? 'text-bad' : 'text-ink')}>{state === 'right' ? 'Correct!' : state === 'wrong' ? 'Not quite — try again' : `${start.turn === 'w' ? 'White' : 'Black'} to move`}</p>
      </div>
      <div className={cx(state === 'wrong' && 'shake')}><Board fen={fen ?? start.fen} orientation={start.turn} movable={state === 'right' ? null : start.turn} onMove={onMove} lastMove={fen ? null : start.last} /></div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-mute">Rated <span className="tnum font-mono text-ink">{p.rating}</span></span>
        <Link href="/puzzles?mode=daily" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">{state === 'right' ? 'See the full solution' : 'Open in puzzles'} <ArrowRight className="size-4" /></Link>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { me } = useMe();
  const { data: home } = useSWR<Home>('/api/home', api, { refreshInterval: 20000 });
  const lobby = useLobby(5000);
  const [seeking, setSeeking] = useState(false);

  useEffect(() => () => { getSocket().emit('seek:cancel'); }, []);
  async function quickPlay() {
    if (seeking) { getSocket().emit('seek:cancel'); return setSeeking(false); }
    try {
      const r = await emitAck<Ack>('seek', { tc: { initial: 300, increment: 0, days: null }, rated: false });
      if (!r.ok) return toast.error(r.error);
      setSeeking(true);
    } catch (e) { toast.error((e as Error).message); }
  }

  const tiles = [
    { href: '/play?friend=1', icon: Users, title: 'Play a friend', text: 'Send a link, pick the clock' },
    { href: '/play/computer', icon: Cpu, title: 'Play the computer', text: 'Six Stockfish levels' },
    { href: '/puzzles', icon: Puzzle, title: 'Solve puzzles', text: 'Rated tactics and streaks' },
    { href: '/analysis', icon: Microscope, title: 'Analyse', text: 'Engine review of any game' },
    { href: '/openings', icon: BookOpen, title: 'Openings', text: '3,800 named lines' },
  ];

  return (
    <div className="space-y-12">
      <section className="grid items-center gap-10 pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:pt-6">
        <div>
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-mute">
            <span className="size-2 rounded-full bg-good" /> <span className="tnum">{home ? home.live.online : '–'}</span> online · <span className="tnum">{home ? home.live.playing : '–'}</span> {home?.live.playing === 1 ? 'game' : 'games'} in play
          </p>
          <h1 className="font-display text-[clamp(3rem,7vw,5.5rem)] leading-[0.95] tracking-tight">Your move.<br /><span className="italic text-accent">Make it count.</span></h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-mute">Real-time games against real opponents, a full-strength engine for analysis, and puzzles checked move by move. No ads, no clutter.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" onClick={quickPlay} className={cx(seeking && 'pulse-ring')}>
              {seeking ? <><Spinner className="size-4 text-accent-ink" /> Finding an opponent… <X className="size-4" /></> : <><Zap className="size-4 fill-current" /> Quick play · 5 min</>}
            </Button>
            <Button href="/play" size="lg">All time controls</Button>
          </div>
          {seeking && <p className="mt-3 text-sm text-mute" role="status">Searching for a casual 5+0 game. Click the button again to cancel.</p>}
          {me && (
            <div className="mt-8 flex flex-wrap gap-2">
              {(['bullet', 'blitz', 'rapid', 'classical', 'puzzle'] as const).map((c) => (
                <Link key={c} href={`/u/${me.username}`} className="rounded-lg border border-line bg-surface px-3 py-2 hover:border-accent/60">
                  <span className="block text-[11px] uppercase tracking-wider text-mute">{c}</span><span className="tnum font-mono text-lg font-semibold">{me.ratings[c]?.rating ?? 1500}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.05 }}><DailyBoard /></motion.div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="group rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/60">
            <t.icon className="size-5 text-accent" strokeWidth={1.8} />
            <p className="mt-3 font-semibold">{t.title}</p><p className="text-[13px] text-mute">{t.text}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <SectionTitle action={<Link href="/watch" className="text-sm text-accent hover:underline">Watch all</Link>}>Live now</SectionTitle>
          {!lobby ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
            : lobby.live.length === 0 ? <Empty title="No games in progress right now">Start one and it will appear here for others to watch.</Empty>
            : <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{lobby.live.slice(0, 3).map((g) => <LiveGameCard key={g.id} g={g} />)}</div>}
        </div>
        <div className="space-y-6">
          <div>
            <SectionTitle action={<Link href="/leaderboard" className="text-sm text-accent hover:underline">Leaderboard</Link>}>Top players</SectionTitle>
            <Card className="divide-y divide-line/60">
              {!home ? <div className="p-3"><Skeleton className="h-28" /></div>
                : home.top.length === 0 ? <p className="p-4 text-sm text-mute">No rated games have been played yet. The first winner takes the top spot.</p>
                : home.top.map((t, i) => (
                  <Link key={t.username + t.category} href={`/u/${t.username}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-raised/60">
                    <span className="tnum w-4 font-mono text-mute">{i + 1}</span><span className="flex-1 truncate font-medium">{t.username} {flag(t.country)}</span>
                    <span className="text-xs capitalize text-mute">{t.category}</span><span className="tnum font-mono font-semibold">{t.rating}</span>
                  </Link>
                ))}
            </Card>
          </div>
          <Card className="grid grid-cols-3 divide-x divide-line text-center">
            {[['Players', home?.players], ['Games played', home?.games], ['Puzzles', home?.puzzles]].map(([l, v]) => <div key={l as string} className="px-2 py-4"><p className="tnum font-display text-3xl">{v ?? '–'}</p><p className="text-xs text-mute">{l}</p></div>)}
          </Card>
        </div>
      </section>
    </div>
  );
}
