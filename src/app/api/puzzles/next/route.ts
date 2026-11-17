import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { puzzleAttempts, ratings } from '@/lib/db/schema';
import { currentUser, HttpError, ok, route } from '@/lib/api';
import { pickPuzzle } from '@/lib/puzzles';

const THEMES = ['mate', 'mateIn1', 'mateIn2', 'mateIn3', 'tactics', 'endgame'];

export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams;
  const theme = q.get('theme');
  if (theme && !THEMES.includes(theme)) throw new HttpError(400, 'Unknown puzzle theme.');
  const exclude = (q.get('exclude') || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
  const me = await currentUser();
  let rating = Number(q.get('rating')) || 0;
  if (me) {
    const [r] = await db.select({ rating: ratings.rating }).from(ratings).where(and(eq(ratings.userId, me.id), eq(ratings.category, 'puzzle')));
    if (!rating) rating = r?.rating ?? 1500;
    const seen = await db.select({ id: puzzleAttempts.puzzleId }).from(puzzleAttempts).where(eq(puzzleAttempts.userId, me.id)).orderBy(desc(puzzleAttempts.createdAt)).limit(300);
    exclude.push(...seen.map((s) => s.id));
  }
  rating = Math.min(2600, Math.max(600, rating || 1300));
  // If the player has exhausted fresh puzzles, fall back to ones they have seen (minus the current session).
  const puzzle = (await pickPuzzle(rating, theme, exclude)) ?? (await pickPuzzle(rating, theme, exclude.slice(0, 20)));
  if (!puzzle) throw new HttpError(404, 'No puzzles available. Run "npm run db:seed" to load the puzzle set.');
  return ok({ puzzle });
});
