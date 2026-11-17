'use client';
import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Avatar, Card, cx, Empty, flag, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { api, useMe } from '@/lib/client';
import { PLAY_CATEGORIES } from '@/lib/chess/time';

type Row = { id: number; username: string; country: string; avatar: string | null; rating: number; games: number; wins: number; score: number; online: boolean };

export default function LeaderboardPage() {
  const { me } = useMe();
  const [category, setCategory] = useState<string>('blitz');
  const [period, setPeriod] = useState<'all' | 'week' | 'month'>('all');
  const [scope, setScope] = useState<'global' | 'country' | 'following'>('global');
  const country = me?.country || '';
  const url = `/api/leaderboard?category=${category}&period=${period}&scope=${scope}${scope === 'country' ? `&country=${country}` : ''}`;
  const blocked = scope === 'following' && !me ? 'Sign in to compare yourself with the players you follow.' : scope === 'country' && !country ? 'Set your country in Settings to see your national ranking.' : null;
  const { data, error, isLoading } = useSWR<{ players: Row[] }>(blocked ? null : url, api, { keepPreviousData: true });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Leaderboard" sub={period === 'all' ? 'Ranked by current rating.' : `Ranked by points scored in the last ${period === 'week' ? '7' : '30'} days (win 1, draw ½).`} />
      <div className="mb-4 flex flex-wrap gap-3">
        <Segmented label="Rating category" value={category} onChange={setCategory} options={PLAY_CATEGORIES.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))} />
        <Segmented label="Period" value={period} onChange={setPeriod} options={[{ value: 'all', label: 'All time' }, { value: 'month', label: 'Month' }, { value: 'week', label: 'Week' }]} />
        <Segmented label="Scope" value={scope} onChange={setScope} options={[{ value: 'global', label: 'Global' }, { value: 'country', label: country ? `${flag(country)} Country` : 'Country' }, { value: 'following', label: 'Following' }]} />
      </div>
      {blocked ? <Empty title={blocked}><Link href={me ? '/settings' : '/login'} className="text-accent hover:underline">{me ? 'Open settings' : 'Sign in'}</Link></Empty>
        : error ? <Empty title="The leaderboard could not be loaded">{(error as Error).message}</Empty>
        : isLoading && !data ? <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        : !data?.players.length ? <Empty title="No ranked players yet">Finish a {category} game to claim the first spot.</Empty>
        : (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase tracking-wider text-mute"><th className="w-14 px-4 py-2.5 font-medium">#</th><th className="py-2.5 font-medium">Player</th><th className="px-3 py-2.5 text-right font-medium">{period === 'all' ? 'Rating' : 'Points'}</th><th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Games</th><th className="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Wins</th></tr></thead>
              <tbody>
                {data.players.map((p, i) => (
                  <tr key={p.id} className={cx('border-b border-line/50 last:border-0 hover:bg-raised/60', me?.id === p.id && 'bg-accent/10')}>
                    <td className={cx('tnum px-4 py-2.5 font-mono', i < 3 ? 'font-bold text-accent' : 'text-mute')}>{i + 1}</td>
                    <td className="py-2.5"><Link href={`/u/${p.username}`} className="flex items-center gap-3 hover:underline"><Avatar name={p.username} src={p.avatar} size={28} online={p.online} /><span className="font-medium">{p.username}</span><span>{flag(p.country)}</span></Link></td>
                    <td className="tnum px-3 py-2.5 text-right font-mono font-semibold">{period === 'all' ? p.rating : p.score}</td>
                    <td className="tnum hidden px-3 py-2.5 text-right font-mono text-mute sm:table-cell">{p.games}</td>
                    <td className="tnum hidden px-4 py-2.5 text-right font-mono text-mute sm:table-cell">{p.wins}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
    </div>
  );
}
