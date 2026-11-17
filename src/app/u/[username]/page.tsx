'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Award, Settings, Swords, UserCheck, UserPlus } from 'lucide-react';
import { Avatar, Button, Card, cx, Empty, ErrorNote, flag, Modal, SectionTitle, Segmented, Skeleton, toast } from '@/components/ui';
import { useTimeControl } from '@/components/game-setup';
import { api, useMe } from '@/lib/client';
import { emitAck } from '@/lib/socket';
import { tcLabel } from '@/lib/chess/time';
import { REASONS, type Ack } from '@/lib/types';

type Rating = { category: string; rating: number; peak: number; games: number; wins: number; losses: number; draws: number };
type Game = { id: string; whiteId: number | null; whiteName: string; blackName: string; whiteRating: number | null; blackRating: number | null; whiteDiff: number | null; blackDiff: number | null; result: string; reason: string; category: string; rated: boolean; initial: number | null; increment: number; days: number | null; opening: string | null; endedAt: string; plies: number | null };
type Profile = {
  user: { id: number; username: string; role: string; bio: string; country: string; avatar: string | null; createdAt: string; lastSeenAt: string; online: boolean };
  ratings: Rating[]; history: { category: string; rating: number; at: string }[]; recent: Game[]; openings: { opening: string; games: number; wins: number }[];
  followers: string[]; following: { username: string; online: boolean }[]; friends: string[]; isFollowing: boolean; isMe: boolean;
};
const CATS = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence', 'puzzle'];

function RatingChart({ points }: { points: { rating: number; at: string }[] }) {
  if (points.length < 2) return <p className="flex h-40 items-center justify-center text-sm text-mute">The chart appears after two rated results in this category.</p>;
  const W = 600, H = 160, pad = 6;
  const rs = points.map((p) => p.rating), min = Math.min(...rs) - 15, max = Math.max(...rs) + 15;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2), y = (r: number) => H - pad - ((r - min) / (max - min)) * (H - pad * 2);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join(' ');
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none" role="img" aria-label={`Rating history from ${rs[0]} to ${rs[rs.length - 1]}`}>
        <path d={`${d} L${x(points.length - 1)},${H} L${x(0)},${H} Z`} fill="var(--accent)" opacity="0.12" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
      <span className="tnum absolute left-1 top-0 font-mono text-[11px] text-mute">{Math.max(...rs)}</span>
      <span className="tnum absolute bottom-0 left-1 font-mono text-[11px] text-mute">{Math.min(...rs)}</span>
    </div>
  );
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { me } = useMe();
  const { data, error, mutate } = useSWR<Profile>(`/api/users/${username}`, api);
  const [cat, setCat] = useState('blitz');
  const [challenge, setChallenge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tc = useTimeControl();

  const totals = useMemo(() => {
    const play = (data?.ratings ?? []).filter((r) => r.category !== 'puzzle');
    const games = play.reduce((s, r) => s + r.games, 0), wins = play.reduce((s, r) => s + r.wins, 0), draws = play.reduce((s, r) => s + r.draws, 0);
    return { games, wins, draws, losses: games - wins - draws, rate: games ? Math.round((wins / games) * 100) : null };
  }, [data]);

  if (error) return <div className="mx-auto max-w-md py-16"><Empty title="Player not found">{(error as Error).message} <Link href="/leaderboard" className="text-accent hover:underline">Browse the leaderboard</Link></Empty></div>;
  if (!data) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>;
  const u = data.user;
  const rating = (c: string) => data.ratings.find((r) => r.category === c);
  const puzzle = rating('puzzle');
  const best = Math.max(0, ...data.ratings.filter((r) => r.category !== 'puzzle' && r.games > 0).map((r) => r.peak));
  // Achievements are derived from real results, never stored separately.
  const badges = [
    totals.games >= 1 && 'First game', totals.wins >= 1 && 'First win', totals.games >= 25 && '25 games', totals.games >= 100 && 'Centurion · 100 games',
    best >= 1600 && 'Peak 1600+', best >= 1800 && 'Peak 1800+', best >= 2000 && 'Peak 2000+',
    (puzzle?.wins ?? 0) >= 10 && '10 puzzles solved', (puzzle?.wins ?? 0) >= 100 && '100 puzzles solved', data.followers.length >= 10 && '10 followers',
  ].filter(Boolean) as string[];

  async function toggleFollow() {
    if (!me) return router.push('/login');
    try { await api(`/api/users/${u.username}/follow`, { method: data!.isFollowing ? 'DELETE' : 'POST' }); mutate(); } catch (e) { toast.error((e as Error).message); }
  }
  async function sendChallenge() {
    setBusy(true); setErr(null);
    try {
      const r = await emitAck<Ack<{ id: string }>>('room:create', { tc: tc.tc, rated: false, color: 'random', invite: u.username });
      if (!r.ok) return setErr(r.error);
      toast.success(`Challenge sent to ${u.username}.`); router.push(`/game/${r.id}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-5 p-5 sm:p-6">
        <Avatar name={u.username} src={u.avatar} size={84} online={u.online} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-4xl leading-none">{u.username} <span className="text-2xl">{flag(u.country)}</span></h1>
          <p className="mt-1.5 text-sm text-mute">{u.online ? <span className="text-good">Online now</span> : `Last seen ${new Date(u.lastSeenAt).toLocaleDateString()}`} · Joined {new Date(u.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} · {data.followers.length} follower{data.followers.length === 1 ? '' : 's'}</p>
          {u.bio && <p className="mt-2 max-w-2xl whitespace-pre-line text-sm">{u.bio}</p>}
        </div>
        <div className="flex gap-2">
          {data.isMe ? <Button href="/settings"><Settings className="size-4" /> Edit profile</Button> : <>
            <Button variant={data.isFollowing ? 'secondary' : 'primary'} onClick={toggleFollow}>{data.isFollowing ? <><UserCheck className="size-4" /> Following</> : <><UserPlus className="size-4" /> Follow</>}</Button>
            <Button onClick={() => { setErr(null); setChallenge(true); }}><Swords className="size-4" /> Challenge</Button>
          </>}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CATS.map((c) => { const r = rating(c); return (
          <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className={cx('rounded-xl border bg-surface p-3.5 text-left transition-colors', cat === c ? 'border-accent' : 'border-line hover:border-mute/60')}>
            <span className="block text-[11px] font-medium uppercase tracking-wider text-mute">{c}</span>
            <span className="tnum block font-mono text-2xl font-semibold">{r && r.games > 0 ? r.rating : <span className="text-mute">{r?.rating ?? 1500}?</span>}</span>
            <span className="text-xs text-mute">{r?.games ?? 0} {c === 'puzzle' ? 'attempts' : 'games'}</span>
          </button>
        ); })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card className="p-4">
            <div className="mb-2 flex items-baseline justify-between"><h2 className="font-semibold capitalize">{cat} rating</h2>{rating(cat) && <span className="text-xs text-mute">Peak <span className="tnum font-mono text-ink">{rating(cat)!.peak}</span></span>}</div>
            <RatingChart points={data.history.filter((h) => h.category === cat)} />
          </Card>
          <div>
            <SectionTitle>Recent games</SectionTitle>
            {data.recent.length === 0 ? <Empty title="No finished games yet">{data.isMe ? <Link href="/play" className="text-accent hover:underline">Play your first game</Link> : 'Check back later.'}</Empty> : (
              <Card className="divide-y divide-line/60 overflow-hidden">
                {data.recent.map((g) => {
                  const white = g.whiteId === u.id;
                  const won = g.result === '1/2-1/2' ? null : (g.result === '1-0') === white;
                  const diff = white ? g.whiteDiff : g.blackDiff;
                  return (
                    <Link key={g.id} href={`/game/${g.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-raised/60">
                      <span className={cx('flex size-6 shrink-0 items-center justify-center rounded text-xs font-bold text-white', won === null ? 'bg-mute' : won ? 'bg-good' : 'bg-bad')} aria-label={won === null ? 'Draw' : won ? 'Win' : 'Loss'}>{won === null ? '½' : won ? 'W' : 'L'}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate"><span className={cx(white && 'font-semibold')}>{g.whiteName}</span> <span className="text-mute">vs</span> <span className={cx(!white && 'font-semibold')}>{g.blackName}</span></span>
                        <span className="block truncate text-xs text-mute">{REASONS[g.reason] ?? g.reason}{g.opening ? ` · ${g.opening}` : ''}</span></span>
                      {diff != null && <span className={cx('tnum font-mono text-xs', diff >= 0 ? 'text-good' : 'text-bad')}>{diff >= 0 ? '+' : ''}{diff}</span>}
                      <span className="hidden w-24 text-right text-xs text-mute sm:block"><span className="font-mono">{tcLabel({ initial: g.initial, increment: g.increment, days: g.days })}</span> · {g.rated ? 'rated' : 'casual'}</span>
                      <span className="hidden w-20 text-right text-xs text-mute md:block">{new Date(g.endedAt).toLocaleDateString()}</span>
                    </Link>
                  );
                })}
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Statistics</h2>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-raised py-3"><p className="tnum font-mono text-2xl font-semibold">{totals.games}</p><p className="text-xs text-mute">Total games</p></div>
              <div className="rounded-lg bg-raised py-3"><p className="tnum font-mono text-2xl font-semibold">{totals.rate != null ? `${totals.rate}%` : '–'}</p><p className="text-xs text-mute">Win rate</p></div>
            </div>
            {totals.games > 0 && <>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full" role="img" aria-label={`${totals.wins} wins, ${totals.draws} draws, ${totals.losses} losses`}>
                <span className="bg-good" style={{ width: `${(totals.wins / totals.games) * 100}%` }} /><span className="bg-mute" style={{ width: `${(totals.draws / totals.games) * 100}%` }} /><span className="bg-bad" style={{ width: `${(totals.losses / totals.games) * 100}%` }} />
              </div>
              <p className="tnum mt-1.5 flex justify-between font-mono text-xs text-mute"><span>{totals.wins} W</span><span>{totals.draws} D</span><span>{totals.losses} L</span></p>
            </>}
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">Favourite openings</h2>
            {data.openings.length === 0 ? <p className="text-sm text-mute">Openings appear here once games have been played.</p> : <ul className="space-y-2 text-sm">{data.openings.map((o) => <li key={o.opening} className="flex items-baseline justify-between gap-3"><span className="truncate">{o.opening}</span><span className="tnum shrink-0 font-mono text-xs text-mute">{o.games} · {Math.round((o.wins / o.games) * 100)}% won</span></li>)}</ul>}
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><Award className="size-4 text-accent" /> Achievements</h2>
            {badges.length === 0 ? <p className="text-sm text-mute">None yet — they are earned by playing and solving.</p> : <div className="flex flex-wrap gap-1.5">{badges.map((b) => <span key={b} className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium">{b}</span>)}</div>}
          </Card>
          <Card className="p-4">
            <h2 className="mb-1 font-semibold">Friends <span className="font-normal text-mute">· {data.friends.length}</span></h2>
            <p className="mb-3 text-xs text-mute">Players who follow each other.</p>
            {data.following.length === 0 ? <p className="text-sm text-mute">Not following anyone yet.</p> : (
              <ul className="space-y-1.5">{data.following.map((f) => (
                <li key={f.username}><Link href={`/u/${f.username}`} className="flex items-center gap-2.5 rounded-lg px-1 py-1 text-sm hover:bg-raised"><Avatar name={f.username} size={24} online={f.online} /><span className="flex-1 truncate">{f.username}</span>{data.friends.includes(f.username) ? <span className="text-xs text-good">Friend</span> : <span className="text-xs text-mute">Following</span>}</Link></li>
              ))}</ul>
            )}
          </Card>
        </div>
      </div>

      <Modal open={challenge} onClose={() => setChallenge(false)} title={`Challenge ${u.username}`}>
        {tc.ui}
        <p className="mt-3 text-sm text-mute">{u.online ? `${u.username} is online and will be notified immediately.` : `${u.username} is offline. You'll get a link you can send them.`}</p>
        <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>
        <Button variant="primary" className="mt-4 w-full" onClick={sendChallenge} loading={busy}>Send casual challenge</Button>
      </Modal>
    </div>
  );
}
