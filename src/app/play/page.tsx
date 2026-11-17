'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Cpu, Link2, SlidersHorizontal, Users, X } from 'lucide-react';
import { Button, Card, cx, ErrorNote, Modal, PageHeader, Segmented, Spinner, toast } from '@/components/ui';
import { InviteField, useTimeControl } from '@/components/game-setup';
import { PRESETS, tcLabel, type TimeControl } from '@/lib/chess/time';
import { emitAck, getSocket } from '@/lib/socket';
import { useMe } from '@/lib/client';
import type { Ack } from '@/lib/types';
import { useT } from '@/lib/i18n';

export default function PlayPage() {
  const tr = useT();
  const router = useRouter();
  const { me, ready } = useMe();
  const [rated, setRated] = useState<'casual' | 'rated'>('rated');
  const [seeking, setSeeking] = useState<TimeControl | null>(null);
  const [lobby, setLobby] = useState<{ online: number; seeking: number; live: unknown[] } | null>(null);
  const [modal, setModal] = useState<'custom' | 'friend' | null>(null);
  const [color, setColor] = useState<'w' | 'random' | 'b'>('random');
  const [invite, setInvite] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const custom = useTimeControl();
  const isRated = rated === 'rated' && !!me;
  useEffect(() => { if (new URLSearchParams(window.location.search).get('friend')) setModal('friend'); }, []);

  useEffect(() => {
    if (!ready) return;
    const s = getSocket();
    const sub = () => emitAck<typeof lobby>('lobby:subscribe').then(setLobby).catch(() => {});
    sub();
    s.on('connect', sub); s.on('lobby:state', setLobby);
    // Leaving the lobby cancels any open seek so nobody gets paired with an absent player.
    return () => { s.off('connect', sub); s.off('lobby:state', setLobby); s.emit('lobby:unsubscribe'); s.emit('seek:cancel'); };
  }, [ready]);

  async function seek(tc: TimeControl) {
    setError(null);
    try {
      const r = await emitAck<Ack>('seek', { tc, rated: isRated });
      if (!r.ok) return setError(r.error);
      setSeeking(tc); setModal(null);
    } catch (e) { setError((e as Error).message); }
  }
  const cancel = () => { getSocket().emit('seek:cancel'); setSeeking(null); };

  async function createRoom() {
    setBusy(true); setError(null);
    try {
      const r = await emitAck<Ack<{ id: string }>>('room:create', { tc: custom.tc, rated: isRated && custom.mode !== 'unlimited', color, invite: invite.trim() || undefined });
      if (!r.ok) return setError(r.error);
      if (invite.trim()) toast.success(tr('Challenge sent to {name}.', { name: invite.trim() }));
      router.push(`/game/${r.id}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div>
      <PageHeader title={tr("Play")} sub={tr("Pick a time control to be paired with the next available opponent, or set up a game with a friend.")}>
        <div className="flex flex-col items-end gap-1">
          <Segmented label={tr("Game mode")} value={me ? rated : 'casual'} onChange={(v) => (me ? setRated(v) : toast.info(tr('Sign in to play rated games.'), { label: tr('Sign in'), run: () => router.push('/login') }))} options={[{ value: 'casual', label: 'Casual' }, { value: 'rated', label: 'Rated' }]} />
          {!me && ready ? <span className="text-xs text-mute">{tr("Playing as a guest — casual only")}</span>
            : <span className="max-w-64 text-end text-xs text-mute">{tr(isRated ? "Rated games change your rating: a win adds points, a loss takes them away." : "Casual games never change your rating.")}</span>}
        </div>
      </PageHeader>

      <AnimatePresence>
        {seeking && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="mb-5 flex items-center gap-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
            <Spinner className="text-accent" />
            <div className="flex-1"><p className="font-medium">{tr("Looking for an opponent…")}</p><p className="text-sm text-mute">{tcLabel(seeking)} · {isRated ? 'Rated' : 'Casual'} · you&apos;ll be taken to the board as soon as someone joins</p></div>
            <Button size="sm" onClick={cancel}><X className="size-4" /> {tr("Cancel")}</Button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mb-4"><ErrorNote>{!modal && error}</ErrorNote></div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {PRESETS.map((p) => {
            const tc = { initial: p.initial, increment: p.increment, days: null };
            const active = seeking && seeking.initial === p.initial && seeking.increment === p.increment && !seeking.days;
            return (
              <motion.button key={p.label} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => (active ? cancel() : seek(tc))} aria-label={`${p.label} ${p.category}`}
                className={cx('flex aspect-[4/3] flex-col items-center justify-center rounded-xl border bg-surface transition-colors', active ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/60')}>
                <span className="font-display text-4xl leading-none sm:text-5xl">{p.label}</span>
                <span className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-mute">{tr(active ? 'Searching…' : p.category)}</span>
              </motion.button>
            );
          })}
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => { setError(null); setModal('custom'); }}
            className="flex aspect-[4/3] flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface/50 hover:border-accent/60">
            <SlidersHorizontal className="size-7 text-mute" />
            <span className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-mute">{tr("Custom")}</span>
          </motion.button>
        </div>

        <div className="space-y-3">
          <button onClick={() => { setError(null); setModal('friend'); }} className="flex w-full items-center gap-4 rounded-xl border border-line bg-surface p-4 text-start transition-colors hover:border-accent/60">
            <span className="flex size-11 items-center justify-center rounded-lg bg-raised"><Users className="size-5 text-accent" /></span>
            <span><span className="block font-semibold">{tr("Play a friend")}</span><span className="text-sm text-mute">{tr("Private game with an invitation link")}</span></span>
          </button>
          <Link href="/play/computer" className="flex w-full items-center gap-4 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent/60">
            <span className="flex size-11 items-center justify-center rounded-lg bg-raised"><Cpu className="size-5 text-accent" /></span>
            <span><span className="block font-semibold">{tr("Play the computer")}</span><span className="text-sm text-mute">{tr("Six levels of Stockfish")}</span></span>
          </Link>
          <Card className="grid grid-cols-3 divide-x divide-line p-0 text-center">
            {[['Online', lobby?.online], ['Seeking', lobby?.seeking], ['Live games', lobby?.live.length]].map(([l, v]) => (
              <div key={l as string} className="px-2 py-4"><p className="tnum font-display text-3xl">{v ?? '–'}</p><p className="text-xs text-mute">{tr(l as string)}</p></div>
            ))}
          </Card>
        </div>
      </div>

      <Modal open={modal === 'custom'} onClose={() => setModal(null)} title={tr("Custom game")}>
        {custom.ui}
        {me && <div className="mt-4"><Segmented label={tr("Game mode")} value={rated} onChange={setRated} options={[{ value: 'rated', label: 'Rated' }, { value: 'casual', label: 'Casual' }]} /></div>}
        <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>
        <Button variant="primary" className="mt-5 w-full" onClick={() => seek(custom.tc)}>{tr("Find an opponent")}</Button>
      </Modal>
      <Modal open={modal === 'friend'} onClose={() => setModal(null)} title={tr("Play a friend")}>
        {custom.ui}
        <div className="mt-4 space-y-4">
          {me && <div><Segmented label={tr("Game mode")} value={rated} onChange={setRated} options={[{ value: 'rated', label: 'Rated' }, { value: 'casual', label: 'Casual' }]} /></div>}
          <div><p className="mb-1.5 text-[13px] font-medium">{tr("You play")}</p><Segmented label={tr("Your colour")} value={color} onChange={setColor} options={[{ value: 'w', label: 'White' }, { value: 'random', label: 'Random' }, { value: 'b', label: 'Black' }]} /></div>
          <InviteField value={invite} onChange={setInvite} />
          <p className="text-sm text-mute">{tr(isRated && custom.mode !== 'unlimited' ? 'Rated — both players need an account.' : 'Casual game.')}</p>
          <ErrorNote>{error}</ErrorNote>
        </div>
        <Button variant="primary" className="mt-5 w-full" onClick={createRoom} loading={busy}><Link2 className="size-4" /> {tr(invite.trim() ? 'Send challenge' : 'Create invitation link')}</Button>
      </Modal>
    </div>
  );
}
