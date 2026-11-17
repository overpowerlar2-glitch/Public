import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { games } from '@/lib/db/schema';
import { HttpError, ok, route } from '@/lib/api';
import type { Category } from '@/lib/chess/time';
import type { GameState } from '@/lib/types';

export const GET = route(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const [g] = await db.select().from(games).where(eq(games.id, (await params).id));
  if (!g) throw new HttpError(404, 'Game not found.');
  const seat = (c: 'white' | 'black') => ({
    key: g[`${c}Key`], userId: g[`${c}Id`], name: g[`${c}Name`], guest: !g[`${c}Id`], rating: g[`${c}Rating`], avatar: null, country: '', online: false,
  });
  const state: GameState = {
    id: g.id, status: g.status as GameState['status'], tc: { initial: g.initial, increment: g.increment, days: g.days }, category: g.category as Category, rated: g.rated,
    white: seat('white'), black: seat('black'), moves: g.moves ? g.moves.split(' ') : [], fen: g.fen,
    clock: g.whiteMs != null && g.blackMs != null ? { w: g.whiteMs, b: g.blackMs, running: null } : null, at: Date.now(),
    result: g.result as GameState['result'], reason: g.reason, drawOffer: null,
    ratingDiff: g.whiteDiff != null && g.blackDiff != null ? { w: g.whiteDiff, b: g.blackDiff } : null,
    eco: g.eco, opening: g.opening, spectators: 0, createdAt: g.createdAt.getTime(),
  };
  return ok({ state, endedAt: g.endedAt });
});
