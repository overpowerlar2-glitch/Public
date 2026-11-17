'use client';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Chess } from 'chess.js';
import { motion } from 'motion/react';
import { ArrowRight, Check, Eye, Flame, Lightbulb, Microscope, RotateCcw, X } from 'lucide-react';
import { Board, type BoardMove } from '@/components/board';
import { Button, Card, cx, Empty, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { api, refreshMe, useMe } from '@/lib/client';
import { play, playMove } from '@/lib/sound';
import type { PuzzleDTO } from '@/lib/puzzles';
import type { Color } from '@/lib/types';
import { tx, useT } from '@/lib/i18n';

type Mode = 'training' | 'daily' | 'streak';
type Status = 'loading' | 'lead' | 'solving' | 'solved' | 'failed';
const THEMES = [{ value: '', label: 'Mixed' }, { value: 'tactics', label: 'Tactics' }, { value: 'mate', label: 'Checkmates' }, { value: 'endgame', label: 'Endgames' }];
const THEME_LABEL: Record<string, string> = { mate: 'Checkmate', mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', tactics: 'Tactics', endgame: 'Endgame' };
const STREAK_KEY = 'tabiya-streak-best';
type Stats = { attempts: number; solved: number; rating: number | null; peak: number | null; themes: { theme: string; attempts: number; solved: number }[]; recent: { solved: boolean; rating: number }[] };

const toMove = (u: string): BoardMove => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

/** Turns the stored UCI solution into numbered SAN plus a one-line, engine-backed explanation. */
function explain(p: PuzzleDTO) {
  const c = new Chess(p.fen);
  c.move(toMove(p.lead));
  const blackFirst = c.turn() === 'b';
  let no = c.moveNumber(), text = '';
  p.solution.forEach((u, i) => {
    const white = c.turn() === 'w';
    const san = c.move(toMove(u)).san;
    if (white) text += `${no}. ${san} `; else { text += `${i === 0 && blackFirst ? `${no}… ` : ''}${san} `; no++; }
  });
  const mate = p.themes.find((t) => t.startsWith('mateIn'));
  const why = mate
    ? 'It is a forced checkmate in {n}: Stockfish found no other first move that mates.'
    : p.solution.length > 1
      ? 'The first move wins material by force, and the follow-up is the only way to keep the advantage. Every alternative leaves the position roughly level.'
      : 'This is the only move that wins material by force — Stockfish rates every alternative at least three pawns worse.';
  return { line: text.trim(), why, n: mate ? mate.slice(6) : '' }; // `why` is an English key, translated when shown
}

function Puzzles() {
  const tr = useT();
  const router = useRouter();
  const params = useSearchParams();
  const mode = (['training', 'daily', 'streak'].includes(params.get('mode') ?? '') ? params.get('mode') : 'training') as Mode;
  const { me, ready } = useMe();
  const [theme, setTheme] = useState('');
  const [puzzle, setPuzzle] = useState<PuzzleDTO | null>(null);
  const [fen, setFen] = useState<string | null>(null);
  const [last, setLast] = useState<[string, string] | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [mistake, setMistake] = useState(false);
  const [outcome, setOutcome] = useState<{ rated: boolean; rating?: number; diff?: number } | null>(null);
  const [session, setSession] = useState<boolean[]>([]);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [streakOver, setStreakOver] = useState(false);
  const step = useRef(0);
  const reported = useRef(false);
  const seen = useRef<number[]>([]);
  const token = useRef(0);
  const { data: stats, mutate: reloadStats } = useSWR<Stats>(me ? '/api/puzzles/stats' : null, api);

  useEffect(() => { try { setBest(Number(localStorage.getItem(STREAK_KEY)) || 0); } catch {} }, []);

  const loadNext = useCallback(async (streakLevel = 0) => {
    const my = ++token.current;
    setStatus('loading'); setError(null); setHint(null); setWrong(null); setMistake(false); setOutcome(null); setLast(null);
    step.current = 0; reported.current = false;
    try {
      let p: PuzzleDTO | null;
      if (mode === 'daily') p = (await api<{ puzzle: PuzzleDTO | null }>('/api/puzzles/daily')).puzzle;
      else {
        const q = new URLSearchParams({ exclude: seen.current.slice(-150).join(',') });
        if (mode === 'training' && theme) q.set('theme', theme);
        if (mode === 'streak') q.set('rating', String(800 + streakLevel * 70)); // each solved puzzle raises the difficulty
        p = (await api<{ puzzle: PuzzleDTO }>(`/api/puzzles/next?${q}`)).puzzle;
      }
      if (my !== token.current) return;
      if (!p) throw new Error(tx('No puzzle is available yet.'));
      seen.current.push(p.id);
      setPuzzle(p); setFen(p.fen); setStatus('lead');
      // Show the position first, then play the opponent's move that creates the puzzle.
      setTimeout(() => {
        if (my !== token.current) return;
        const c = new Chess(p!.fen);
        const m = c.move(toMove(p!.lead));
        playMove(m.san, false); setFen(c.fen()); setLast([m.from, m.to]); setStatus('solving');
      }, 700);
    } catch (e) { if (my === token.current) setError((e as Error).message); }
  }, [mode, theme]);

  useEffect(() => { if (ready) { setStreak(0); setStreakOver(false); loadNext(0); } }, [ready, loadNext]);

  const report = useCallback(async (solved: boolean) => {
    if (reported.current || !puzzle) return;
    reported.current = true;
    setSession((s) => [...s.slice(-19), solved]);
    try {
      const r = await api<{ rated: boolean; rating?: number; diff?: number }>('/api/puzzles/attempt', { method: 'POST', body: { id: puzzle.id, solved } });
      setOutcome(r);
      if (r.rated) { reloadStats(); refreshMe(); }
    } catch { /* the attempt simply is not recorded; solving continues */ }
  }, [puzzle, reloadStats]);

  const solver: Color | null = useMemo(() => (puzzle ? (puzzle.fen.split(' ')[1] === 'w' ? 'b' : 'w') : null), [puzzle]);

  function finish(clean: boolean) {
    setStatus(clean ? 'solved' : 'failed');
    play(clean ? 'success' : 'notify');
    report(clean);
    if (mode === 'streak' && clean) { const n = streak + 1; setStreak(n); if (n > best) { setBest(n); try { localStorage.setItem(STREAK_KEY, String(n)); } catch {} } }
  }

  function onMove(m: BoardMove) {
    if (!puzzle || !fen || status !== 'solving') return;
    const c = new Chess(fen);
    const expected = puzzle.solution[step.current];
    let mv;
    try { mv = c.move(m); } catch { return; }
    const uci = mv.from + mv.to + (mv.promotion ?? '');
    // Any move that delivers checkmate is accepted, even if the stored line mates differently.
    if (uci !== expected && !c.isCheckmate()) {
      play('error'); setWrong(mv.to); setTimeout(() => setWrong(null), 600);
      setMistake(true); setHint(null); report(false);
      if (mode === 'streak') setStreakOver(true);
      return;
    }
    playMove(mv.san); setFen(c.fen()); setLast([mv.from, mv.to]); setHint(null);
    step.current++;
    if (step.current >= puzzle.solution.length || c.isCheckmate()) return finish(!mistake);
    const my = token.current, reply = puzzle.solution[step.current];
    setStatus('lead');
    setTimeout(() => {
      if (my !== token.current) return;
      const r = c.move(toMove(reply));
      playMove(r.san, false); setFen(c.fen()); setLast([r.from, r.to]); step.current++; setStatus('solving');
    }, 500);
  }

  function showSolution() {
    if (!puzzle || !fen) return;
    report(false); setMistake(true); setHint(null);
    if (mode === 'streak') setStreakOver(true);
    const my = token.current;
    const c = new Chess(fen);
    setStatus('lead');
    const rest = puzzle.solution.slice(step.current);
    rest.forEach((u, i) => setTimeout(() => {
      if (my !== token.current) return;
      const m = c.move(toMove(u));
      playMove(m.san); setFen(c.fen()); setLast([m.from, m.to]);
      if (i === rest.length - 1) setStatus('failed');
    }, 650 * (i + 1)));
  }

  const done = status === 'solved' || status === 'failed';
  const ex = useMemo(() => (puzzle && done ? explain(puzzle) : null), [puzzle, done]);
  const solveRate = stats && stats.attempts ? Math.round((stats.solved / stats.attempts) * 100) : null;

  return (
    <div>
      <PageHeader title={tr("Puzzles")} sub={tr("Every puzzle comes from a real game position and has a single engine-verified solution.")}>
        <Segmented label={tr("Puzzle mode")} value={mode} onChange={(m) => router.replace(m === 'training' ? '/puzzles' : `/puzzles?mode=${m}`)} options={[{ value: 'training', label: 'Training' }, { value: 'daily', label: 'Daily' }, { value: 'streak', label: 'Streak' }]} />
      </PageHeader>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="mx-auto w-full" style={{ maxWidth: 'min(100%, calc(100dvh - 12rem))' }}>
          {error ? <Empty title={tr("Puzzles are unavailable")}>{error} <button className="text-accent hover:underline" onClick={() => loadNext(streak)}>{tr("Try again")}</button></Empty>
            : !fen || !solver ? <Skeleton className="aspect-square w-full" />
            : <div className={cx(wrong && 'shake')}><Board fen={fen} orientation={solver} movable={status === 'solving' ? solver : null} onMove={onMove} lastMove={last} hint={hint} wrong={wrong} /></div>}
        </div>

        <div className="space-y-3">
          <Card className="overflow-hidden">
            <div className={cx('flex items-center gap-3 px-4 py-4', status === 'solved' && 'bg-good/10', status === 'failed' && 'bg-bad/10')}>
              {status === 'solved' ? <span className="flex size-10 items-center justify-center rounded-full bg-good text-white"><Check className="size-5" /></span>
                : status === 'failed' ? <span className="flex size-10 items-center justify-center rounded-full bg-bad text-white"><X className="size-5" /></span>
                : solver && <span className={cx('size-10 rounded-full border-2 border-line', solver === 'w' ? 'bg-[#f1efe9]' : 'bg-[#222]')} />}
              <div className="min-w-0 flex-1">
                <p className="font-display text-2xl leading-tight">
                  {tr(status === 'loading' ? 'Loading puzzle…' : status === 'solved' ? 'Solved!' : status === 'failed' ? 'Puzzle complete' : mistake ? 'Not that one — try again' : solver === 'w' ? 'White to move' : 'Black to move')}
                </p>
                <p className="text-sm text-mute">
                  {done && outcome?.rated ? <>{tr('Your puzzle rating: {rating}', { rating: outcome.rating ?? '' })} <span className={cx('tnum font-mono', (outcome.diff ?? 0) >= 0 ? 'text-good' : 'text-bad')}>{(outcome.diff ?? 0) >= 0 ? '+' : ''}{outcome.diff}</span></>
                    : done && !me ? <><Link href="/login" className="text-accent hover:underline">{tr("Sign in")}</Link> {tr("to earn a puzzle rating")}</>
                    : tr(done ? 'Already attempted — rating unchanged' : mode === 'daily' ? 'Daily puzzle — the same for everyone today' : 'Find the best move')}
                </p>
              </div>
              {mode === 'streak' && <span className="flex items-center gap-1 font-mono text-2xl font-semibold text-accent"><Flame className="size-5" />{streak}</span>}
            </div>

            {ex && puzzle && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="border-t border-line px-4 py-3 text-sm">
                <p className="font-mono text-[13px] font-semibold">{ex.line}</p>
                <p className="mt-1.5 text-mute">{tr(ex.why, { n: ex.n })}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {puzzle.themes.map((t) => <span key={t} className="rounded-full bg-raised px-2.5 py-0.5 text-xs">{tr(THEME_LABEL[t] === 'Checkmate' ? 'Checkmate_theme' : THEME_LABEL[t] ?? t)}</span>)}
                  <span className="ms-auto text-xs text-mute">{tr('Rating {n}', { n: puzzle.rating })}{puzzle.plays > 0 && <> · {tr('solved {pct}% of {n}', { pct: Math.round((puzzle.solves / puzzle.plays) * 100), n: puzzle.plays })}</>}</span>
                </div>
              </motion.div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-line p-3">
              {done ? (
                <>
                  {mode === 'daily' ? <Button variant="primary" onClick={() => router.replace('/puzzles')}>{tr("More puzzles")} <ArrowRight className="size-4" /></Button>
                    : mode === 'streak' && streakOver ? <Button variant="primary" onClick={() => { setStreak(0); setStreakOver(false); loadNext(0); }}><RotateCcw className="size-4" /> {tr("New streak")}</Button>
                    : <Button variant="primary" onClick={() => loadNext(streak + (mode === 'streak' && status === 'solved' ? 1 : 0))}>{tr("Next puzzle")} <ArrowRight className="size-4" /></Button>}
                  {fen && <Button href={`/analysis?fen=${encodeURIComponent(fen)}`} variant="ghost"><Microscope className="size-4" /> {tr("Analyse")}</Button>}
                </>
              ) : (
                <>
                  <Button variant="ghost" disabled={status !== 'solving'} onClick={() => puzzle && setHint(puzzle.solution[step.current].slice(0, 2))}><Lightbulb className="size-4" /> {tr("Hint")}</Button>
                  <Button variant="ghost" disabled={status !== 'solving'} onClick={showSolution}><Eye className="size-4" /> {tr("Show solution")}</Button>
                </>
              )}
            </div>
          </Card>

          {mode === 'training' && (
            <Card className="p-4"><p className="mb-2 text-[13px] font-medium">{tr("Theme")}</p><Segmented size="sm" label={tr("Puzzle theme")} value={theme} onChange={setTheme} options={THEMES} /></Card>
          )}
          {mode === 'streak' && (
            <Card className="p-4 text-sm"><p className="font-semibold">{tr("Puzzle streak")}</p><p className="mt-1 text-mute">{tr("Puzzles get harder with each solve. One wrong move ends the run.")}</p><p className="mt-2">{tr('Best on this device: {n}', { n: best })}</p></Card>
          )}

          <Card className="p-4">
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-mute">{tr("Your performance")}</p>
            {!me ? <p className="text-sm text-mute"><Link href="/register" className="text-accent hover:underline">{tr("Create an account")}</Link> {tr("to track your puzzle rating and statistics.")}</p>
              : !stats ? <Skeleton className="h-20" /> : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[['Rating', stats.rating ?? 1500], ['Solved', stats.solved], ['Success', solveRate != null ? `${solveRate}%` : '–']].map(([l, v]) => <div key={l as string} className="rounded-lg bg-raised py-2.5"><p className="tnum font-mono text-xl font-semibold">{v}</p><p className="text-xs text-mute">{tr(l as string)}</p></div>)}
                  </div>
                  {stats.themes.length > 0 && <div className="mt-3 space-y-1.5">{stats.themes.filter((t) => !t.theme.startsWith('mateIn')).map((t) => (
                    <div key={t.theme} className="flex items-center gap-2 text-xs"><span className="w-20 text-mute">{tr(THEME_LABEL[t.theme] ?? t.theme)}</span><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised"><span className="block h-full bg-good" style={{ width: `${(t.solved / t.attempts) * 100}%` }} /></span><span className="tnum w-12 text-end font-mono">{t.solved}/{t.attempts}</span></div>
                  ))}</div>}
                </>
              )}
            {session.length > 0 && <div className="mt-3 flex flex-wrap gap-1" aria-label={tr("This session")}>{session.map((s, i) => <span key={i} className={cx('size-2.5 rounded-full', s ? 'bg-good' : 'bg-bad')} title={tr(s ? 'Solved' : 'Missed')} />)}</div>}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function PuzzlesPage() { return <Suspense><Puzzles /></Suspense>; }
