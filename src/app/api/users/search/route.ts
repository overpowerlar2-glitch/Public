import { and, asc, eq, like, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profiles, ratings, users } from '@/lib/db/schema';
import { hub, ok, route } from '@/lib/api';

export const GET = route(async (req) => {
  const q = (new URL(req.url).searchParams.get('q') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
  if (q.length < 2) return ok({ users: [] });
  const rows = await db.select({ id: users.id, username: users.username, avatar: profiles.avatar, country: profiles.country, blitz: ratings.rating })
    .from(users).leftJoin(profiles, eq(profiles.userId, users.id)).leftJoin(ratings, and(eq(ratings.userId, users.id), eq(ratings.category, 'blitz')))
    .where(and(like(users.usernameLower, `${q}%`), ne(users.status, 'banned'))).orderBy(asc(users.usernameLower)).limit(8);
  const h = hub();
  return ok({ users: rows.map((r) => ({ ...r, online: h?.isOnline(r.id) ?? false })) });
});
