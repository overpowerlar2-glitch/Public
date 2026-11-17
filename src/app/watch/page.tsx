'use client';
import Link from 'next/link';
import { LiveGameCard, useLobby } from '@/components/mini';
import { Button, Empty, PageHeader, Skeleton } from '@/components/ui';

export default function WatchPage() {
  const lobby = useLobby(3000);
  return (
    <div>
      <PageHeader title="Watch" sub="Games being played right now. Open one to follow it move by move." />
      {!lobby ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
        : lobby.live.length === 0 ? <Empty title="No games in progress">Be the first on the board. <Button href="/play" size="sm" variant="primary" className="ml-2">Play now</Button></Empty>
        : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{lobby.live.map((g) => <LiveGameCard key={g.id} g={g} />)}</div>}
    </div>
  );
}
