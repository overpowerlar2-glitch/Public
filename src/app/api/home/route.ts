import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { hub, ok, route } from '@/lib/api';
export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const [counts, top] = await Promise.all([
    db.execute<{ players: number; games: number; puzzles: number }>(sql`
      select (select count(*) from users)::int as players, (select count(*) from games where status = 'finished')::int as games, (select count(*) from puzzles)::int as puzzles`),
    db.execute<{ username: string; rating: number; category: string; country: string }>(sql`
      select u.username, r.rating, r.category, coalesce(p.country, '') as country from ratings r join users u on u.id = r.user_id left join profiles p on p.user_id = u.id
      where r.games > 0 and r.category <> 'puzzle' and u.status = 'active' order by r.rating desc limit 6`),
  ]);
  return ok({ ...counts.rows[0], top: top.rows, live: hub()?.stats() ?? { online: 0, playing: 0, seeking: 0 } });
});
