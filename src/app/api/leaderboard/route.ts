import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { PLAY_CATEGORIES } from '@/lib/chess/time';
import { currentUser, HttpError, hub, ok, route } from '@/lib/api';

type Row = { id: number; username: string; country: string; avatar: string | null; rating: number; games: number; wins: number; score: number };

export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams;
  const category = q.get('category') || 'blitz';
  const period = q.get('period') || 'all'; // all | week | month
  const scope = q.get('scope') || 'global'; // global | country | following
  const country = (q.get('country') || '').toUpperCase();
  if (!(PLAY_CATEGORIES as readonly string[]).includes(category)) throw new HttpError(400, 'Unknown rating category.');
  if (!['all', 'week', 'month'].includes(period)) throw new HttpError(400, 'Unknown period.');
  const me = await currentUser();
  if (scope === 'following' && !me) throw new HttpError(401, 'Sign in to see how you rank among the players you follow.');

  const scopeSql = scope === 'country' && /^[A-Z]{2}$/.test(country) ? sql`and p.country = ${country}`
    : scope === 'following' && me ? sql`and (u.id = ${me.id} or u.id in (select following_id from follows where follower_id = ${me.id}))` : sql``;

  let rows: Row[];
  if (period === 'all') {
    // All-time: ordered by current rating among players with at least one game in the category.
    rows = (await db.execute<Row>(sql`
      select u.id, u.username, coalesce(p.country, '') as country, p.avatar, r.rating, r.games, r.wins, r.rating as score
      from ratings r join users u on u.id = r.user_id left join profiles p on p.user_id = u.id
      where r.category = ${category} and r.games > 0 and u.status = 'active' ${scopeSql}
      order by r.rating desc, r.games desc limit 100`)).rows;
  } else {
    // Weekly / monthly: ordered by points scored (win = 1, draw = ½) in the period.
    const since = new Date(Date.now() - (period === 'week' ? 7 : 30) * 864e5);
    rows = (await db.execute<Row>(sql`
      with played as (
        select white_id as uid, case result when '1-0' then 2 when '1/2-1/2' then 1 else 0 end as pts from games
          where status = 'finished' and category = ${category} and ended_at > ${since} and white_id is not null
        union all
        select black_id, case result when '0-1' then 2 when '1/2-1/2' then 1 else 0 end from games
          where status = 'finished' and category = ${category} and ended_at > ${since} and black_id is not null)
      select u.id, u.username, coalesce(p.country, '') as country, p.avatar, coalesce(r.rating, 1500) as rating,
        count(*)::int as games, count(*) filter (where pts = 2)::int as wins, (sum(pts) / 2.0)::float as score
      from played join users u on u.id = played.uid left join profiles p on p.user_id = u.id
        left join ratings r on r.user_id = u.id and r.category = ${category}
      where u.status = 'active' ${scopeSql}
      group by u.id, p.country, p.avatar, r.rating order by score desc, games asc limit 100`)).rows;
  }
  const h = hub();
  return ok({ players: rows.map((r) => ({ ...r, online: h?.isOnline(r.id) ?? false })) });
});
