'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Board } from './board';
import { tcLabel } from '@/lib/chess/time';
import { emitAck, getSocket } from '@/lib/socket';
import { useMe } from '@/lib/client';
import type { LiveGameSummary } from '@/lib/types';
import { useT } from '@/lib/i18n';

export type LobbyState = { live: LiveGameSummary[]; seeking: number; online: number };

/** Live lobby snapshot, refreshed by server pushes plus a light poll so thumbnails follow the moves. */
export function useLobby(pollMs = 4000) {
  const { ready } = useMe();
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  useEffect(() => {
    if (!ready) return;
    const s = getSocket();
    let alive = true;
    const get = () => emitAck<LobbyState>('lobby:subscribe').then((l) => alive && setLobby(l)).catch(() => {});
    get();
    const t = setInterval(get, pollMs);
    s.on('lobby:state', setLobby); s.on('connect', get);
    return () => { alive = false; clearInterval(t); s.off('lobby:state', setLobby); s.off('connect', get); s.emit('lobby:unsubscribe'); };
  }, [ready, pollMs]);
  return lobby;
}

export function LiveGameCard({ g }: { g: LiveGameSummary }) {
  const tr = useT();
  const row = (name: string, rating: number | null) => <div className="flex items-baseline justify-between gap-2 px-1 text-[13px]"><span className="truncate font-medium">{name}</span><span className="tnum font-mono text-xs text-mute">{rating ?? ''}</span></div>;
  return (
    <Link href={`/game/${g.id}`} className="group block rounded-xl border border-line bg-surface p-2.5 transition-colors hover:border-accent/60">
      {row(g.black, g.blackRating)}
      <div className="my-1.5"><Board mini fen={g.fen} lastMove={g.lastMove ? [g.lastMove.slice(0, 2), g.lastMove.slice(2, 4)] : null} label={tr('{white} versus {black}', { white: g.white, black: g.black })} /></div>
      {row(g.white, g.whiteRating)}
      <p className="mt-1.5 px-1 text-xs text-mute"><span className="font-mono">{tcLabel(g.tc, tr)}</span> · {tr(g.rated ? 'Rated' : 'Casual')} · {tr('move {n}', { n: Math.floor(g.plies / 2) + 1 })}</p>
    </Link>
  );
}
