import { z } from 'zod';
import { eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { createSession, dummyHash, rateLimit, verifyPassword } from '@/lib/auth-core';
import { clientIp, HttpError, ok, route, setSessionCookie } from '@/lib/api';
import { domainList, emailAllowed, isRestricted } from '@/lib/access';

const body = z.object({ login: z.string().trim().min(1, 'Enter your username or email.').max(254), password: z.string().min(1, 'Enter your password.').max(200) });

export const POST = route(async (req) => {
  const b = body.parse(await req.json());
  if (!rateLimit(`login:${clientIp(req)}:${b.login.toLowerCase()}`, 8, 10 * 60_000)) throw new HttpError(429, 'Too many attempts. Wait a few minutes and try again.');
  const l = b.login.toLowerCase();
  const [u] = await db.select().from(users).where(or(eq(users.usernameLower, l), eq(users.email, l)));
  // Always run a hash comparison so response time does not reveal whether the account exists.
  const valid = await verifyPassword(b.password, u?.passwordHash ?? (await dummyHash()));
  if (!u || !valid) throw new HttpError(401, 'Incorrect username or password.');
  if (u.status === 'banned') throw new HttpError(403, 'This account has been closed.');
  if (!emailAllowed(u.email)) throw new HttpError(403, `This site is only for ${domainList()} addresses.`);
  if (isRestricted() && !u.emailVerifiedAt) throw new HttpError(403, 'Confirm your email address first — check your inbox for the link we sent.');
  const s = await createSession(u.id);
  return setSessionCookie(ok({ id: u.id, username: u.username }), s.token, s.expiresAt);
});
