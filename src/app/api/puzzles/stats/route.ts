import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ok, requireUser, route } from '@/lib/api';

export const GET = route(async () => {
  const me = await requireUser();
  const [totals, themes, recent] = await Promise.all([
    db.execute<{ attempts: number; solved: number; rating: number | null; peak: number | null }>(sql`
      select count(a.*)::int as attempts, count(a.*) filter (where a.solved)::int as solved,
        (select rating from ratings where user_id = ${me.id} and category = 'puzzle') as rating,
        (select peak from ratings where user_id = ${me.id} and category = 'puzzle') as peak
      from puzzle_attempts a where a.user_id = ${me.id}`),
    db.execute<{ theme: string; attempts: number; solved: number }>(sql`
      select t.theme, count(*)::int as attempts, count(*) filter (where a.solved)::int as solved
      from puzzle_attempts a join puzzles p on p.id = a.puzzle_id, unnest(p.themes) as t(theme)
      where a.user_id = ${me.id} group by t.theme order by attempts desc`),
    db.execute<{ solved: boolean; rating: number; at: string }>(sql`
      select solved, rating_after as rating, created_at as at from puzzle_attempts where user_id = ${me.id} order by created_at desc limit 60`),
  ]);
  return ok({ ...totals.rows[0], themes: themes.rows, recent: recent.rows.reverse() });
});
