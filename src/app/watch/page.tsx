'use client';
import Link from 'next/link';
import { LiveGameCard, useLobby } from '@/components/mini';
import { Button, Empty, PageHeader, Skeleton } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function WatchPage() {
  const tr = useT();
  const lobby = useLobby(3000);
  return (
    <div>
      <PageHeader title={tr("Watch")} sub={tr("Games being played right now. Open one to follow it move by move.")} />
      {!lobby ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[4/5]" />)}</div>
        : lobby.live.length === 0 ? <Empty title={tr("No games in progress")}>{tr("Be the first on the board.")} <Button href="/play" size="sm" variant="primary" className="ms-2">{tr("Play now")}</Button></Empty>
        : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{lobby.live.map((g) => <LiveGameCard key={g.id} g={g} />)}</div>}
    </div>
  );
}
