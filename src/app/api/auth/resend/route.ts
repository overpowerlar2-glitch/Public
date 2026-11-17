import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { createVerification, rateLimit } from '@/lib/auth-core';
import { clientIp, HttpError, ok, route } from '@/lib/api';
import { emailAllowed } from '@/lib/access';
import { sendVerification } from '@/lib/mail';
import * as v from '@/lib/validation';

export const POST = route(async (req) => {
  if (!rateLimit(`resend:${clientIp(req)}`, 5, 3600_000)) throw new HttpError(429, 'Too many requests. Try again later.');
  const { email } = z.object({ email: v.email }).parse(await req.json());
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (u && !u.emailVerifiedAt && emailAllowed(u.email)) await sendVerification(req, u, await createVerification(u.id));
  return ok({ ok: true }); // same answer either way: does not reveal which addresses have accounts
});
