'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SWRConfig } from 'swr';
import { applyAppearance, useSettings } from '@/lib/store';
import { api, useMe } from '@/lib/client';
import { getSocket } from '@/lib/socket';
import { tcLabel, type TimeControl } from '@/lib/chess/time';
import { play } from '@/lib/sound';
import { toast, Toaster } from './ui';
import { tx } from '@/lib/i18n';

function Realtime() {
  const { ready, me, restricted } = useMe();
  const router = useRouter();
  const allowed = ready && (!restricted || !!me);
  useEffect(() => {
    if (!allowed) return; // wait for /api/me so the guest cookie exists before the socket handshake
    const s = getSocket();
    const matched = ({ id }: { id: string }) => { play('start'); router.push(`/game/${id}`); };
    const challenge = (c: { id: string; from: string; tc: TimeControl; rated: boolean }) => {
      play('notify');
      toast.info(tx('{from} challenges you to a {kind} {tc} game', { from: c.from, kind: tx(c.rated ? 'rated' : 'casual'), tc: tcLabel(c.tc, tx) }), { label: tx('Accept'), run: () => router.push(`/game/${c.id}`) }, 30000);
    };
    s.on('seek:matched', matched); s.on('challenge:incoming', challenge);
    return () => { s.off('seek:matched', matched); s.off('challenge:incoming', challenge); };
  }, [allowed, router]);
  return null;
}

function Appearance() {
  const { theme, board, animation } = useSettings();
  useEffect(() => applyAppearance({ theme, board, animation }), [theme, board, animation]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ fetcher: api, shouldRetryOnError: false }}>
      <Appearance />
      <Realtime />
      {children}
      <Toaster />
    </SWRConfig>
  );
}
