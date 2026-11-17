import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { puzzleAttempts, puzzles, ratingHistory, ratings } from '@/lib/db/schema';
import { currentUser, HttpError, ok, route } from '@/lib/api';

export const POST = route(async (req) => {
  const b = z.object({ id: z.number().int().positive(), solved: z.boolean() }).parse(await req.json());
  const [p] = await db.select().from(puzzles).where(eq(puzzles.id, b.id));
  if (!p) throw new HttpError(404, 'Puzzle not found.');
  await db.update(puzzles).set({ plays: sql`${puzzles.plays} + 1`, solves: sql`${puzzles.solves} + ${b.solved ? 1 : 0}` }).where(eq(puzzles.id, p.id));
  const me = await currentUser();
  if (!me) return ok({ rated: false });
  return ok(await db.transaction(async (tx) => {
    const [r] = await tx.select().from(ratings).where(and(eq(ratings.userId, me.id), eq(ratings.category, 'puzzle'))).for('update');
    const cur = r ?? (await tx.insert(ratings).values({ userId: me.id, category: 'puzzle' }).returning())[0];
    const [prior] = await tx.select({ id: puzzleAttempts.id }).from(puzzleAttempts).where(and(eq(puzzleAttempts.userId, me.id), eq(puzzleAttempts.puzzleId, p.id))).limit(1);
    // Only a player's first attempt at a puzzle moves their rating.
    const expected = 1 / (1 + 10 ** ((p.rating - cur.rating) / 400));
    const diff = prior ? 0 : Math.round((cur.games < 20 ? 40 : 24) * ((b.solved ? 1 : 0) - expected));
    const next = Math.max(400, cur.rating + diff);
    if (!prior) {
      await tx.update(ratings).set({
        rating: next, peak: Math.max(cur.peak, next), games: cur.games + 1, wins: cur.wins + (b.solved ? 1 : 0), losses: cur.losses + (b.solved ? 0 : 1), updatedAt: new Date(),
      }).where(and(eq(ratings.userId, me.id), eq(ratings.category, 'puzzle')));
      await tx.insert(ratingHistory).values({ userId: me.id, category: 'puzzle', rating: next });
    }
    await tx.insert(puzzleAttempts).values({ userId: me.id, puzzleId: p.id, solved: b.solved, ratingAfter: next });
    return { rated: !prior, rating: next, diff };
  }));
});
