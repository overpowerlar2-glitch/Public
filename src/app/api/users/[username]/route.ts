import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { follows, games, profiles, ratingHistory, ratings, users } from '@/lib/db/schema';
import { currentUser, HttpError, hub, ok, route } from '@/lib/api';

export const GET = route(async (_req, { params }: { params: Promise<{ username: string }> }) => {
  const name = (await params).username.toLowerCase();
  const [u] = await db.select({
    id: users.id, username: users.username, role: users.role, status: users.status, createdAt: users.createdAt, lastSeenAt: users.lastSeenAt,
    bio: profiles.bio, country: profiles.country, avatar: profiles.avatar,
  }).from(users).leftJoin(profiles, eq(profiles.userId, users.id)).where(eq(users.usernameLower, name));
  if (!u || u.status === 'banned') throw new HttpError(404, 'Player not found.');
  const me = await currentUser();
  const mine = or(eq(games.whiteId, u.id), eq(games.blackId, u.id));

  const [rs, history, recent, openings, followers, following, iFollow] = await Promise.all([
    db.select().from(ratings).where(eq(ratings.userId, u.id)),
    db.select({ category: ratingHistory.category, rating: ratingHistory.rating, at: ratingHistory.createdAt }).from(ratingHistory)
      .where(eq(ratingHistory.userId, u.id)).orderBy(desc(ratingHistory.createdAt)).limit(600),
    db.select({
      id: games.id, whiteId: games.whiteId, whiteName: games.whiteName, blackName: games.blackName, whiteRating: games.whiteRating, blackRating: games.blackRating,
      whiteDiff: games.whiteDiff, blackDiff: games.blackDiff, result: games.result, reason: games.reason, category: games.category, rated: games.rated,
      initial: games.initial, increment: games.increment, days: games.days, opening: games.opening, endedAt: games.endedAt, plies: sql<number>`array_length(string_to_array(${games.moves}, ' '), 1)`,
    }).from(games).where(and(mine, eq(games.status, 'finished'))).orderBy(desc(games.endedAt)).limit(25),
    db.execute<{ opening: string; games: number; wins: number }>(sql`
      select split_part(opening, ':', 1) as opening, count(*)::int as games,
        count(*) filter (where (result = '1-0' and white_id = ${u.id}) or (result = '0-1' and black_id = ${u.id}))::int as wins
      from games where status = 'finished' and opening is not null and (white_id = ${u.id} or black_id = ${u.id})
      group by 1 order by 2 desc limit 6`),
    db.select({ username: users.username }).from(follows).innerJoin(users, eq(users.id, follows.followerId)).where(eq(follows.followingId, u.id)).limit(200),
    db.select({ id: users.id, username: users.username }).from(follows).innerJoin(users, eq(users.id, follows.followingId)).where(eq(follows.followerId, u.id)).limit(200),
    me ? db.select().from(follows).where(and(eq(follows.followerId, me.id), eq(follows.followingId, u.id))) : Promise.resolve([]),
  ]);
  const followerNames = new Set(followers.map((f) => f.username));
  const h = hub();
  return ok({
    user: { id: u.id, username: u.username, role: u.role, bio: u.bio ?? '', country: u.country ?? '', avatar: u.avatar, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt, online: h?.isOnline(u.id) ?? false },
    ratings: rs, history: history.reverse(), recent, openings: openings.rows,
    followers: followers.map((f) => f.username),
    following: following.map((f) => ({ username: f.username, online: h?.isOnline(f.id) ?? false })),
    friends: following.filter((f) => followerNames.has(f.username)).map((f) => f.username), // mutual follows
    isFollowing: iFollow.length > 0, isMe: me?.id === u.id,
  });
});
