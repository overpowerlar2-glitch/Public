import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { HttpError, ok, route } from '@/lib/api';

/** Win/draw/loss counts for each continuation of a move sequence, computed from games played on this server. */
export const GET = route(async (req) => {
  const prefix = (new URL(req.url).searchParams.get('moves') || '').trim();
  if (!/^[A-Za-z0-9+#=\- ]{0,400}$/.test(prefix)) throw new HttpError(400, 'Invalid move sequence.');
  const skip = prefix ? prefix.length + 2 : 1;
  const where = prefix ? sql`moves like ${prefix + ' %'}` : sql`moves <> ''`;
  const res = await db.execute<{ san: string; white: number; draws: number; black: number }>(sql`
    select split_part(substr(moves, ${skip}), ' ', 1) as san,
      count(*) filter (where result = '1-0')::int as white, count(*) filter (where result = '1/2-1/2')::int as draws, count(*) filter (where result = '0-1')::int as black
    from games where status = 'finished' and ${where} group by 1 order by count(*) desc limit 30`);
  return ok({ moves: res.rows });
});
