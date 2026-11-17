import { z } from 'zod';
import { eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { createSession, createUser, createVerification, rateLimit } from '@/lib/auth-core';
import { clientIp, HttpError, ok, route, setSessionCookie } from '@/lib/api';
import { domainList, emailAllowed, isRestricted } from '@/lib/access';
import { sendVerification } from '@/lib/mail';
import * as v from '@/lib/validation';

const body = z.object({ username: v.username, email: v.email, password: v.password });

export const POST = route(async (req) => {
  if (!rateLimit(`reg:${clientIp(req)}`, 10, 3600_000)) throw new HttpError(429, 'Too many sign-ups from this address. Try again later.');
  const b = body.parse(await req.json());
  if (!emailAllowed(b.email)) throw new HttpError(403, `This site is only for ${domainList()} addresses.`);
  const [taken] = await db.select({ u: users.usernameLower, e: users.email }).from(users)
    .where(or(eq(users.usernameLower, b.username.toLowerCase()), eq(users.email, b.email)));
  if (taken) throw new HttpError(409, taken.u === b.username.toLowerCase() ? 'That username is taken.' : 'An account with that email already exists.');
  const u = await createUser(b.username, b.email, b.password);
  if (isRestricted()) {
    // Private site: the address must be proven before the account can be used.
    await sendVerification(req, u, await createVerification(u.id));
    return ok({ id: u.id, username: u.username, verify: true }, 201);
  }
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, u.id));
  const s = await createSession(u.id);
  return setSessionCookie(ok({ id: u.id, username: u.username }, 201), s.token, s.expiresAt);
});
