import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { follows, users } from '@/lib/db/schema';
import { HttpError, ok, requireUser, route } from '@/lib/api';

type Ctx = { params: Promise<{ username: string }> };
async function target(ctx: Ctx, meId: number) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.usernameLower, (await ctx.params).username.toLowerCase()));
  if (!u) throw new HttpError(404, 'Player not found.');
  if (u.id === meId) throw new HttpError(400, 'You cannot follow yourself.');
  return u.id;
}
export const POST = route(async (_req, ctx: Ctx) => {
  const me = await requireUser();
  await db.insert(follows).values({ followerId: me.id, followingId: await target(ctx, me.id) }).onConflictDoNothing();
  return ok({ following: true });
});
export const DELETE = route(async (_req, ctx: Ctx) => {
  const me = await requireUser();
  await db.delete(follows).where(and(eq(follows.followerId, me.id), eq(follows.followingId, await target(ctx, me.id))));
  return ok({ following: false });
});
