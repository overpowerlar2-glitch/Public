'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Chess } from 'chess.js';
import { motion } from 'motion/react';
import { EyeOff, Flag, Lightbulb, Maximize2, Microscope, Minimize2, RotateCcw, Undo2 } from 'lucide-react';
import { Board, type Arrow, type BoardMove } from '@/components/board';
import { MoveList, NavButtons, PlayerBar } from '@/components/game-ui';
import { Button, Card, cx, ErrorNote, PageHeader, Segmented } from '@/components/ui';
import { ANALYSIS_HANDOFF, useEngine, useFullscreen } from '@/lib/hooks';
import { buildPgn, replay, START_FEN } from '@/lib/chess/util';
import { play, playMove, playResult } from '@/lib/sound';
import { useMe } from '@/lib/client';
import type { Color } from '@/lib/types';
import { useT } from '@/lib/i18n';

const LEVELS = [
  { name: 'Beginner', elo: '≈ 600', blurb: 'Often misses threats and gives pieces away.', skill: 0, depth: 1, random: 0.4 },
  { name: 'Easy', elo: '≈ 1000', blurb: 'Plays simple moves; punishes only obvious blunders.', skill: 1, depth: 2, random: 0.15 },
  { name: 'Intermediate', elo: '≈ 1400', blurb: 'Solid club player with occasional tactical slips.', skill: 5, depth: 5, random: 0 },
  { name: 'Advanced', elo: '≈ 1800', blurb: 'Sees most tactics and plays sound positional chess.', skill: 10, depth: 8, random: 0 },
  { name: 'Expert', elo: '≈ 2200', blurb: 'Strong, precise and unforgiving.', skill: 15, depth: 12, random: 0 },
  { name: 'Master', elo: '2800+', blurb: 'Full-strength Stockfish. Good luck.', skill: 20, movetime: 1200, random: 0 },
] as const;
const CLOCKS = [{ label: 'No clock', initial: 0, inc: 0 }, { label: '5+0', initial: 300, inc: 0 }, { label: '10+0', initial: 600, inc: 0 }, { label: '15+10', initial: 900, inc: 10 }];

type Outcome = { result: '1-0' | '0-1' | '1/2-1/2'; text: string; side?: 'White' | 'Black' }; // text is an English key, translated when shown

export default function ComputerPage() {
  const tr = useT();
  const router = useRouter();
  const { me } = useMe();
  const { get: engine, error: engineError } = useEngine();
  const [phase, setPhase] = useState<'setup' | 'playing'>('setup');
  const [level, setLevel] = useState(2);
  const [colorPref, setColorPref] = useState<'w' | 'b' | 'random'>('w');
  const [clockIdx, setClockIdx] = useState(0);

  const [color, setColor] = useState<Color>('w');
  const [sans, setSans] = useState<string[]>([]);
  const [ply, setPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [thinking, setThinking] = useState(false);
  const [blindfold, setBlindfold] = useState(false);
  const [hint, setHint] = useState<Arrow | null>(null);
  const [clock, setClock] = useState<{ w: number; b: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const fs = useFullscreen(wrap);
  const gameId = useRef(0);
  const sansRef = useRef<string[]>([]);

  const steps = useMemo(() => replay(sans), [sans]);
  const fen = ply === 0 ? START_FEN : steps[ply - 1].fen;
  const liveFen = steps.length ? steps[steps.length - 1].fen : START_FEN;
  const atEnd = ply === sans.length;
  const turn: Color = sans.length % 2 === 0 ? 'w' : 'b';
  const tc = CLOCKS[clockIdx];
  const lv = LEVELS[level];

  const finish = useCallback((o: Outcome) => { setOutcome(o); setThinking(false); engine()?.cancel(); }, [engine]);

  const push = useCallback((mv: BoardMove) => {
    const prev = sansRef.current;
    const c = new Chess();
    for (const s of prev) c.move(s);
    let m;
    try { m = c.move(mv); } catch { return; }
    playMove(m.san, m.color === color);
    const next = [...prev, m.san];
    sansRef.current = next;
    setSans(next); setPly(next.length); setHint(null);
    if (tc.inc) setClock((cl) => cl && { ...cl, [m.color]: cl[m.color] + tc.inc * 1000 });
    if (c.isCheckmate()) setOutcome({ result: m.color === 'w' ? '1-0' : '0-1', text: 'Checkmate — {side} wins', side: m.color === 'w' ? 'White' : 'Black' });
    else if (c.isStalemate()) setOutcome({ result: '1/2-1/2', text: 'Draw by stalemate' });
    else if (c.isInsufficientMaterial()) setOutcome({ result: '1/2-1/2', text: 'Draw — insufficient material' });
    else if (c.isThreefoldRepetition()) setOutcome({ result: '1/2-1/2', text: 'Draw by threefold repetition' });
    else if (c.isDraw()) setOutcome({ result: '1/2-1/2', text: 'Draw by the fifty-move rule' });
  }, [tc.inc, color]);

  // Engine to move.
  useEffect(() => {
    if (phase !== 'playing' || outcome || turn === color) return;
    const id = gameId.current;
    const e = engine();
    if (!e) return;
    setThinking(true);
    const started = performance.now();
    const c = new Chess(liveFen);
    const legal = c.moves({ verbose: true });
    const randomMove = Math.random() < lv.random ? legal[Math.floor(Math.random() * legal.length)] : null;
    const pick = randomMove
      ? Promise.resolve(randomMove.from + randomMove.to + (randomMove.promotion ?? ''))
      : e.search(liveFen, { skill: lv.skill, ...('movetime' in lv ? { movetime: lv.movetime } : { depth: lv.depth }) }).then((r) => (r.stale ? null : r.bestmove));
    let cancelled = false;
    pick.then((uci) => {
      if (cancelled || !uci || id !== gameId.current) return;
      // A short, human-feeling pause so instant replies are not jarring.
      const wait = Math.max(0, 450 - (performance.now() - started));
      setTimeout(() => { if (!cancelled && id === gameId.current) { setThinking(false); push({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } }, wait);
    }).catch(() => setThinking(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, liveFen, turn, color, outcome]);

  // Clock.
  useEffect(() => {
    if (phase !== 'playing' || !clock || outcome) return;
    let last = performance.now();
    const t = setInterval(() => {
      const now = performance.now(), dt = now - last; last = now;
      setClock((c) => {
        if (!c) return c;
        const left = c[turn] - dt;
        if (left <= 0) { finish({ result: turn === 'w' ? '0-1' : '1-0', text: '{side} ran out of time', side: turn === 'w' ? 'White' : 'Black' }); return { ...c, [turn]: 0 }; }
        return { ...c, [turn]: left };
      });
    }, 100);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turn, outcome, !!clock]);

  useEffect(() => { if (outcome) playResult(outcome.result, color); }, [outcome]); // eslint-disable-line react-hooks/exhaustive-deps

  function start() {
    gameId.current++;
    const c: Color = colorPref === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : colorPref;
    sansRef.current = []; setColor(c); setFlipped(false); setSans([]); setPly(0); setOutcome(null); setHint(null); setThinking(false);
    setClock(tc.initial ? { w: tc.initial * 1000, b: tc.initial * 1000 } : null);
    engine()?.newGame();
    setPhase('playing');
    play('start');
  }
  function takeback() {
    if (outcome || !sans.length) return;
    gameId.current++;
    engine()?.cancel();
    setThinking(false); setHint(null);
    // Go back to the player's previous turn: two plies if the engine has replied, otherwise one.
    const n = turn === color ? 2 : 1;
    const next = sans.slice(0, Math.max(0, sans.length - n));
    sansRef.current = next; setSans(next); setPly(next.length);
  }
  async function showHint() {
    if (turn !== color || outcome) return;
    const e = engine();
    if (!e) return;
    const r = await e.search(liveFen, { depth: 12 });
    if (r.bestmove && !r.stale) setHint({ from: r.bestmove.slice(0, 2), to: r.bestmove.slice(2, 4), color: 'var(--good)' });
  }
  function analyze() {
    const names = { w: color === 'w' ? me?.username ?? 'You' : `Stockfish (${lv.name})`, b: color === 'b' ? me?.username ?? 'You' : `Stockfish (${lv.name})` };
    sessionStorage.setItem(ANALYSIS_HANDOFF, buildPgn(sans, { Event: 'Game vs computer', White: names.w, Black: names.b, Result: outcome?.result ?? '*' }));
    router.push('/analysis?import=1');
  }

  if (phase === 'setup') {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={tr("Play the computer")} sub={`${tr('Stockfish runs right in your browser — no account or connection needed once the page has loaded.')} ${tr('Games against the computer are practice: they never change your rating.')}`} />
        <ErrorNote>{engineError}</ErrorNote>
        <Card className="p-5 sm:p-6">
          <h2 className="mb-3 text-sm font-semibold">{tr("Strength")}</h2>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={tr("Difficulty")}>
            {LEVELS.map((l, i) => (
              <button key={l.name} role="radio" aria-checked={level === i} onClick={() => setLevel(i)}
                className={cx('rounded-xl border p-3.5 text-start transition-colors', level === i ? 'border-accent bg-accent/10' : 'border-line hover:border-mute/60')}>
                <span className="flex items-baseline justify-between"><span className="font-semibold">{tr(l.name)}</span><span className="tnum font-mono text-xs text-mute">{l.elo}</span></span>
                <span className="mt-1 block text-[13px] leading-snug text-mute">{tr(l.blurb)}</span>
              </button>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
            <div><h2 className="mb-2 text-sm font-semibold">{tr("You play")}</h2><Segmented label={tr("Your colour")} value={colorPref} onChange={setColorPref} options={[{ value: 'w', label: 'White' }, { value: 'random', label: 'Random' }, { value: 'b', label: 'Black' }]} /></div>
            <div><h2 className="mb-2 text-sm font-semibold">{tr("Clock")}</h2><Segmented label={tr("Clock")} value={String(clockIdx)} onChange={(v) => setClockIdx(+v)} options={CLOCKS.map((c, i) => ({ value: String(i), label: c.label }))} /></div>
          </div>
          <Button variant="primary" size="lg" className="mt-7 w-full sm:w-auto" onClick={start}>{tr("Start game")}</Button>
        </Card>
      </div>
    );
  }

  const orientation: Color = (color === 'w') !== flipped ? 'w' : 'b';
  const top: Color = orientation === 'w' ? 'b' : 'w';
  const last = ply > 0 ? ([steps[ply - 1].from, steps[ply - 1].to] as [string, string]) : null;
  const bar = (c: Color) => (
    <PlayerBar name={c === color ? me?.username ?? tr('You') : tr('Stockfish · {level}', { level: tr(lv.name) })} avatar={c === color ? me?.avatar : null} fen={fen} color={c}
      clockMs={clock ? clock[c] : null} running={!!clock && !outcome && turn === c} thinking={c !== color && thinking} sub={c !== color ? lv.elo : undefined} />
  );

  return (
    <div ref={wrap} className={cx('grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]', fs.active && 'h-full overflow-auto bg-bg p-6')}>
      <div className="mx-auto w-full" style={{ maxWidth: 'min(100%, calc(100dvh - 13rem))' }}>
        {bar(top)}
        <Board fen={fen} orientation={orientation} movable={atEnd && !outcome ? color : null} onMove={push} lastMove={last} arrows={hint && atEnd ? [hint] : undefined} blindfold={blindfold} />
        {bar(orientation)}
      </div>
      <Card className="flex max-h-[calc(100dvh-7rem)] flex-col overflow-hidden">
        {outcome && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="border-b border-line bg-accent/10 px-4 py-4">
            <p className="font-display text-2xl">{tr(outcome.result === '1/2-1/2' ? 'Draw' : (outcome.result === '1-0') === (color === 'w') ? 'You won' : 'You lost')}</p>
            <p className="text-sm text-mute">{tr(outcome.text, outcome.side && { side: tr(outcome.side) })}</p>
            <div className="mt-3 flex flex-wrap gap-2"><Button variant="primary" size="sm" onClick={start}>{tr("Rematch")}</Button><Button size="sm" onClick={analyze}><Microscope className="size-4" /> {tr("Analyse game")}</Button><Button size="sm" variant="ghost" onClick={() => setPhase('setup')}>{tr("Change settings")}</Button></div>
          </motion.div>
        )}
        {engineError && <div className="border-b border-line p-3"><ErrorNote>{engineError}</ErrorNote></div>}
        <MoveList sans={sans} ply={ply} onSelect={setPly} className="min-h-40 flex-1" />
        <NavButtons ply={ply} max={sans.length} onSelect={(p) => setPly(Math.max(0, Math.min(sans.length, p)))} onFlip={() => setFlipped((f) => !f)} />
        <div className="grid grid-cols-3 gap-1.5 border-t border-line p-2">
          <Button size="sm" variant="ghost" onClick={takeback} disabled={!!outcome || !sans.length}><Undo2 className="size-4" /> {tr("Takeback")}</Button>
          <Button size="sm" variant="ghost" onClick={showHint} disabled={!!outcome || turn !== color}><Lightbulb className="size-4" /> {tr("Hint")}</Button>
          <Button size="sm" variant="ghost" onClick={() => finish({ result: color === 'w' ? '0-1' : '1-0', text: 'You resigned' })} disabled={!!outcome}><Flag className="size-4" /> {tr("Resign")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setBlindfold((b) => !b)} aria-pressed={blindfold} className={cx(blindfold && 'text-accent')}><EyeOff className="size-4" /> {tr("Blindfold")}</Button>
          <Button size="sm" variant="ghost" onClick={fs.toggle}>{fs.active ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />} {tr(fs.active ? 'Exit' : 'Fullscreen')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setPhase('setup')}><RotateCcw className="size-4" /> {tr("New game")}</Button>
        </div>
      </Card>
    </div>
  );
}
