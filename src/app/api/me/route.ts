import { z } from 'zod';
import { cookies } from 'next/headers';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { profiles, ratings, users } from '@/lib/db/schema';
import { GUEST_COOKIE, newToken } from '@/lib/auth-core';
import { currentUser, HttpError, ok, requireUser, route, setGuestCookie } from '@/lib/api';
import * as v from '@/lib/validation';
import { allowedDomains } from '@/lib/access';

export const GET = route(async () => {
  const u = await currentUser();
  if (!u) {
    const res = ok({ user: null, domains: allowedDomains() });
    if (!(await cookies()).get(GUEST_COOKIE)) setGuestCookie(res, newToken(12));
    return res;
  }
  const rs = await db.select({ category: ratings.category, rating: ratings.rating, games: ratings.games }).from(ratings).where(eq(ratings.userId, u.id));
  return ok({ domains: allowedDomains(), user: { ...u, ratings: Object.fromEntries(rs.map((r) => [r.category, { rating: r.rating, games: r.games }])) } });
});

const patch = z.object({
  username: v.username.optional(),
  bio: z.string().max(400, 'Bio is limited to 400 characters.').optional(),
  country: z.string().regex(/^([A-Z]{2})?$/, 'Pick a country from the list.').optional(),
  avatar: z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Unsupported image.').max(120_000, 'Image is too large.').nullable().optional(),
});

export const PATCH = route(async (req) => {
  const u = await requireUser();
  const b = patch.parse(await req.json());
  if (b.username && b.username !== u.username) {
    const [taken] = await db.select({ id: users.id }).from(users).where(and(eq(users.usernameLower, b.username.toLowerCase()), ne(users.id, u.id)));
    if (taken) throw new HttpError(409, 'That username is taken.');
    await db.update(users).set({ username: b.username, usernameLower: b.username.toLowerCase() }).where(eq(users.id, u.id));
  }
  const p: Partial<typeof profiles.$inferInsert> = {};
  if (b.bio !== undefined) p.bio = b.bio;
  if (b.country !== undefined) p.country = b.country;
  if (b.avatar !== undefined) p.avatar = b.avatar;
  if (Object.keys(p).length) await db.insert(profiles).values({ userId: u.id, ...p }).onConflictDoUpdate({ target: profiles.userId, set: p });
  return ok({ ok: true });
});
