import { and, eq, gte, lte, notInArray, sql } from 'drizzle-orm';
import { db } from './db';
import { puzzles } from './db/schema';

export type PuzzleDTO = { id: number; fen: string; lead: string; solution: string[]; themes: string[]; rating: number; plays: number; solves: number };
const dto = (p: typeof puzzles.$inferSelect): PuzzleDTO => ({ ...p, solution: p.solution.split(' ') });

/** Picks a random puzzle near `rating`, widening the window until one is found. */
export async function pickPuzzle(rating: number, theme: string | null, exclude: number[]): Promise<PuzzleDTO | null> {
  for (const window of [120, 300, 700, 5000]) {
    const conds = [gte(puzzles.rating, rating - window), lte(puzzles.rating, rating + window)];
    if (theme) conds.push(sql`${theme} = any(${puzzles.themes})`);
    if (exclude.length) conds.push(notInArray(puzzles.id, exclude));
    const [p] = await db.select().from(puzzles).where(and(...conds)).orderBy(sql`random()`).limit(1);
    if (p) return dto(p);
  }
  return null;
}

/** The daily puzzle is a deterministic pick for the UTC date, so everyone gets the same one. */
export async function dailyPuzzle(): Promise<{ puzzle: PuzzleDTO | null; date: string }> {
  const date = new Date().toISOString().slice(0, 10);
  const pool = await db.select({ id: puzzles.id }).from(puzzles).where(and(gte(puzzles.rating, 1200), lte(puzzles.rating, 1900))).orderBy(puzzles.id);
  if (!pool.length) return { puzzle: null, date };
  let h = 0;
  for (const ch of date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [p] = await db.select().from(puzzles).where(eq(puzzles.id, pool[h % pool.length].id));
  return { puzzle: dto(p), date };
}
