'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Chess } from 'chess.js';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, Download, Eye, Flag, Handshake, Maximize2, Microscope, Minimize2, Send, WifiOff, X } from 'lucide-react';
import { Board, type BoardMove } from '@/components/board';
import { MoveList, NavButtons, PlayerBar } from '@/components/game-ui';
import { Button, Card, cx, Empty, Skeleton, toast } from '@/components/ui';
import { api, refreshMe, useMe } from '@/lib/client';
import { emitAck, getSocket } from '@/lib/socket';
import { useFullscreen } from '@/lib/hooks';
import { buildPgn, replay, START_FEN } from '@/lib/chess/util';
import { tcLabel } from '@/lib/chess/time';
import { play, playMove, playResult } from '@/lib/sound';
import { REASONS, type Ack, type ChatMessage, type Color, type GameState } from '@/lib/types';
import { useT } from '@/lib/i18n';

type JoinAck = Ack<{ state: GameState; chat: ChatMessage[]; you: Color | null }>;

function useLiveClock(state: GameState | null, receivedAt: number) {
  const [, tick] = useState(0);
  const running = state?.clock?.running ?? null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [running]);
  if (!state?.clock) return null;
  const c = { w: state.clock.w, b: state.clock.b };
  if (running) c[running] = Math.max(0, c[running] - (performance.now() - receivedAt));
  return c;
}

export default function GamePage() {
  const tr = useT();
  const { id } = useParams<{ id: string }>();
  const { me, ready } = useMe();
  const [state, setState] = useState<GameState | null>(null);
  const [you, setYou] = useState<Color | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [viewPly, setViewPly] = useState<number | null>(null); // null = follow the live position
  const [flipped, setFlipped] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState('');
  const receivedAt = useRef(0);
  const prev = useRef<GameState | null>(null);
  const youRef = useRef<Color | null>(null);
  const lowWarned = useRef(false);
  const wrap = useRef<HTMLDivElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const fs = useFullscreen(wrap);

  const apply = useCallback((st: GameState, own = false) => {
    const p = prev.current;
    if (p && !own) {
      if (st.moves.length > p.moves.length) playMove(st.moves[st.moves.length - 1], false);
      if (st.drawOffer && st.drawOffer !== p.drawOffer && youRef.current && st.drawOffer !== youRef.current) play('notify');
      if (p.status === 'waiting' && st.status === 'active') play('start');
    }
    if (p && p.status === 'active' && st.status !== 'active') { playResult(st.result, youRef.current); refreshMe(); }
    prev.current = st;
    receivedAt.current = performance.now();
    setState(st);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const s = getSocket();
    let alive = true;
    const join = async () => {
      try {
        const r = await emitAck<JoinAck>('game:join', { id });
        if (!alive) return;
        if (r.ok) { youRef.current = r.you; setYou(r.you); setChat(r.chat); apply(r.state); setError(null); }
        else if (r.finished) {
          // Not live any more: load the stored game.
          const d = await api<{ state: GameState }>(`/api/games/${id}`);
          if (alive) { youRef.current = null; apply(d.state); setYou(null); }
        } else setError(r.error);
      } catch (e) { if (alive) setError((e as Error).message); }
    };
    const onState = (st: GameState) => st.id === id && apply(st);
    const onChat = (m: { id: string; message: ChatMessage }) => m.id === id && setChat((c) => [...c, m.message]);
    const onDown = () => setConnected(false);
    const onUp = () => { setConnected(true); join(); };
    s.on('game:state', onState); s.on('game:chat', onChat); s.on('disconnect', onDown); s.on('connect', onUp);
    setConnected(s.connected);
    if (s.connected) join();
    return () => { alive = false; s.off('game:state', onState); s.off('game:chat', onChat); s.off('disconnect', onDown); s.off('connect', onUp); s.emit('game:leave', { id }); };
  }, [id, ready, apply, me?.id]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'nearest' }); }, [chat.length]);
  useEffect(() => { if (!confirmResign) return; const t = setTimeout(() => setConfirmResign(false), 3000); return () => clearTimeout(t); }, [confirmResign]);

  const steps = useMemo(() => replay(state?.moves ?? []), [state?.moves]);
  const clock = useLiveClock(state, receivedAt.current);
  // One warning when the player's own clock drops under 20 seconds.
  const myMs = you && clock && state?.status === 'active' && state.tc.initial != null && state.tc.initial >= 60 ? clock[you] : null;
  useEffect(() => { if (myMs != null && myMs < 20000 && !lowWarned.current) { lowWarned.current = true; play('lowtime'); } }, [myMs]);

  if (error) return <div className="mx-auto max-w-md py-16"><Empty title={tr("This game is unavailable")}>{error} <Link href="/play" className="text-accent hover:underline">{tr("Back to the lobby")}</Link></Empty></div>;
  if (!state) return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"><Skeleton className="mx-auto aspect-square w-full max-w-[640px]" /><Skeleton className="h-96" /></div>;

  const total = state.moves.length;
  const ply = viewPly ?? total;
  const fen = ply === 0 ? START_FEN : steps[ply - 1]?.fen ?? state.fen;
  const last = ply > 0 && steps[ply - 1] ? ([steps[ply - 1].from, steps[ply - 1].to] as [string, string]) : null;
  const orientation: Color = ((you ?? 'w') === 'w') !== flipped ? 'w' : 'b';
  const top: Color = orientation === 'w' ? 'b' : 'w';
  const active = state.status === 'active';
  const over = state.status === 'finished' || state.status === 'aborted';
  const turn: Color = total % 2 === 0 ? 'w' : 'b';
  const opp = you ? (you === 'w' ? state.black : state.white) : null;
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/game/${id}` : '';

  function move(m: BoardMove) {
    if (!state || !you) return;
    const c = new Chess(state.fen);
    let mv;
    try { mv = c.move(m); } catch { return; }
    playMove(mv.san);
    // Optimistic update; the server's snapshot replaces it a moment later.
    const optimistic: GameState = { ...state, moves: [...state.moves, mv.san], fen: c.fen(), drawOffer: state.drawOffer === you ? you : null,
      clock: state.clock && clock ? { w: clock.w, b: clock.b, running: state.clock.running ? (you === 'w' ? 'b' : 'w') : null } : state.clock };
    apply(optimistic, true);
    setViewPly(null);
    emitAck<Ack>('game:move', { id, uci: mv.from + mv.to + (mv.promotion ?? '') }).then((r) => { if (!r.ok) toast.error(r.error); }).catch((e: Error) => toast.error(e.message));
  }
  const send = (ev: string, extra?: object) => getSocket().emit(ev, { id, ...extra });
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { toast.error(tr('Could not copy — select the link and copy it manually.')); } };
  function downloadPgn() {
    if (!state) return;
    const pgn = buildPgn(state.moves, { White: state.white?.name, Black: state.black?.name, Result: state.result ?? '*', WhiteElo: state.white?.rating?.toString(), BlackElo: state.black?.rating?.toString(), TimeControl: state.tc.initial != null ? `${state.tc.initial}+${state.tc.increment}` : '-', ECO: state.eco, Opening: state.opening, Site: inviteUrl });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }));
    a.download = `tabiya-${id}.pgn`; a.click(); URL.revokeObjectURL(a.href);
  }

  const bar = (c: Color) => {
    const p = c === 'w' ? state.white : state.black;
    if (!p) return <div className="flex h-[58px] items-center gap-3 text-mute"><span className="size-[34px] rounded-full border border-dashed border-line" /> {tr("Waiting for opponent…")}</div>;
    return <PlayerBar name={p.name} rating={p.rating} diff={state.ratingDiff?.[c]} avatar={p.avatar} country={p.country} online={active ? p.online : undefined} href={p.guest ? undefined : `/u/${p.name}`}
      fen={fen} color={c} clockMs={clock ? clock[c] : null} running={active && state.clock?.running === c} days={!!state.tc.days} />;
  };

  const headline = tr(state.status === 'aborted' ? 'Game aborted' : state.result === '1/2-1/2' ? 'Draw' : you ? ((state.result === '1-0') === (you === 'w') ? 'You won' : 'You lost') : state.result === '1-0' ? 'White won' : 'Black won');

  return (
    <div ref={wrap} className={cx('grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]', fs.active && 'h-full overflow-auto bg-bg p-6')}>
      <div className="mx-auto w-full" style={{ maxWidth: 'min(100%, calc(100dvh - 13rem))' }}>
        {bar(top)}
        <Board fen={fen} orientation={orientation} movable={active && you && viewPly === null ? you : null} onMove={move} lastMove={last} />
        {bar(orientation)}
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {!connected && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn" role="status">
              <WifiOff className="size-4" /> {tr("Connection lost — reconnecting…")}
            </motion.div>
          )}
        </AnimatePresence>

        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm">
            <span><span className="font-mono font-semibold">{tcLabel(state.tc, tr)}</span> <span className="text-mute">· <span className={state.rated ? 'font-semibold text-accent' : ''}>{tr(state.rated ? 'Rated' : 'Casual')}</span> · <span className="capitalize">{tr(state.category)}</span></span></span>
            <span className="flex items-center gap-3 text-mute">
              {state.spectators > 0 && <span className="flex items-center gap-1" title={tr("Spectators")}><Eye className="size-4" /> {state.spectators}</span>}
              <button onClick={fs.toggle} aria-label={tr(fs.active ? 'Exit fullscreen' : 'Fullscreen')} className="hover:text-ink">{fs.active ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}</button>
            </span>
          </div>

          {state.status === 'waiting' && (
            <div className="space-y-3 border-b border-line bg-accent/5 p-4">
              <p className="font-display text-2xl">{tr("Invite your opponent")}</p>
              <p className="text-sm text-mute">{tr("Send this link. The game starts as soon as someone opens it.")}</p>
              <div className="flex gap-2">
                <input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} aria-label={tr("Invitation link")} className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 font-mono text-xs" />
                <Button variant="primary" onClick={() => copy(inviteUrl)}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />} {tr(copied ? 'Copied' : 'Copy')}</Button>
              </div>
              <p className="flex items-center gap-2 text-sm text-mute"><span className="size-2 animate-pulse rounded-full bg-accent" /> {tr("Waiting for an opponent to join…")}</p>
            </div>
          )}

          {over && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-b border-line bg-accent/10 px-4 py-4">
              <p className="font-display text-3xl leading-tight">{headline} {state.result && <span className="ms-1 font-mono text-base text-mute">{state.result}</span>}</p>
              <p className="text-sm text-mute">{tr(REASONS[state.reason ?? ''] ?? state.reason ?? '')}{you && state.ratingDiff && <> · <span className={state.ratingDiff[you] >= 0 ? 'text-good' : 'text-bad'}>{tr('rating {diff}', { diff: `${state.ratingDiff[you] >= 0 ? '+' : ''}${state.ratingDiff[you]}` })}</span></>}</p>
              {state.status === 'finished' && <p className="mt-1 text-xs text-mute">{tr(state.rated ? 'Rated game — the result changes both players’ ratings.' : 'Casual game — ratings don’t change.')}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button href="/play" variant="primary" size="sm">{tr("New game")}</Button>
                {state.status === 'finished' && <Button href={`/analysis?game=${id}`} size="sm"><Microscope className="size-4" /> {tr("Analyse")}</Button>}
                {total > 0 && <Button size="sm" variant="ghost" onClick={downloadPgn}><Download className="size-4" /> {tr("PGN")}</Button>}
                <Button size="sm" variant="ghost" onClick={() => copy(inviteUrl)}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />} {tr('Share')}</Button>
              </div>
            </motion.div>
          )}

          {active && you && state.drawOffer && state.drawOffer !== you && (
            <div className="flex items-center gap-2 border-b border-line bg-info/10 px-4 py-3 text-sm">
              <Handshake className="size-4 text-info" /><span className="flex-1">{tr("Your opponent offers a draw")}</span>
              <Button size="sm" variant="primary" onClick={() => send('game:draw', { action: 'accept' })}>{tr("Accept")}</Button>
              <Button size="sm" onClick={() => send('game:draw', { action: 'decline' })} aria-label={tr("Decline draw")}><X className="size-4" /></Button>
            </div>
          )}
          {active && you && opp && !opp.online && state.tc.initial != null && (
            <p className="border-b border-line bg-warn/10 px-4 py-2 text-sm text-warn" role="status">{tr('{name} disconnected. They forfeit if they don’t return within a minute.', { name: opp.name })}</p>
          )}

          {state.opening && <p className="border-b border-line px-4 py-2 text-xs text-mute"><span className="font-mono">{state.eco}</span> {state.opening}</p>}
          <MoveList sans={state.moves} ply={ply} onSelect={(p) => setViewPly(p === total ? null : p)} className="h-48 lg:h-56" />
          <NavButtons ply={ply} max={total} onSelect={(p) => { const n = Math.max(0, Math.min(total, p)); setViewPly(n === total ? null : n); }} onFlip={() => setFlipped((f) => !f)} />

          {active && you && (
            <div className="grid grid-cols-2 gap-1.5 border-t border-line p-2">
              {total < 2 ? <Button size="sm" variant="ghost" className="col-span-2" onClick={() => send('game:resign')}><X className="size-4" /> {tr("Abort game")}</Button> : <>
                <Button size="sm" variant="ghost" onClick={() => send('game:draw', { action: 'offer' })} disabled={!!state.drawOffer}><Handshake className="size-4" /> {tr(state.drawOffer === you ? 'Draw offered' : 'Offer draw')}</Button>
                <Button size="sm" variant={confirmResign ? 'danger' : 'ghost'} onClick={() => (confirmResign ? (send('game:resign'), setConfirmResign(false)) : setConfirmResign(true))}><Flag className="size-4" /> {tr(confirmResign ? 'Confirm resign' : 'Resign')}</Button>
              </>}
            </div>
          )}
          {!you && !over && state.status !== 'waiting' && <p className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-sm text-mute"><Eye className="size-4" /> {tr("You are watching this game live.")}</p>}
          {active && you && turn === you && viewPly !== null && <button onClick={() => setViewPly(null)} className="border-t border-line bg-accent/10 px-4 py-2 text-sm font-medium text-accent">{tr('It’s your move — return to the live position')}</button>}
        </Card>

        {you && state.status !== 'waiting' && (
          <Card className="flex h-56 flex-col overflow-hidden">
            <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3 text-sm" aria-live="polite" aria-label={tr("Game chat")}>
              {chat.length === 0 && <p className="text-mute">{tr("Say hello — chat is visible only to you and your opponent.")}</p>}
              {chat.map((m, i) => m.system ? <p key={i} className="text-xs italic text-mute">{m.text}</p> : <p key={i}><span className={cx('font-semibold', m.color === you ? 'text-accent' : 'text-ink')}>{m.from}</span> <span className="break-words">{m.text}</span></p>)}
              <div ref={chatEnd} />
            </div>
            <form className="flex gap-2 border-t border-line p-2" onSubmit={(e) => { e.preventDefault(); const t = draft.trim(); if (t) { send('game:chat', { text: t }); setDraft(''); } }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={300} placeholder={tr("Message your opponent")} aria-label={tr("Chat message")} className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm focus:border-accent focus:outline-none" />
              <Button size="sm" type="submit" aria-label={tr("Send message")} disabled={!draft.trim()}><Send className="size-4" /></Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
