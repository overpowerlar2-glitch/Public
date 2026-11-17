import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { passwordResets, users } from '@/lib/db/schema';
import { newToken, rateLimit, sha256 } from '@/lib/auth-core';
import { clientIp, HttpError, ok, route } from '@/lib/api';
import { sendMail } from '@/lib/mail';
import * as v from '@/lib/validation';
import { emailAllowed } from '@/lib/access';

export const POST = route(async (req) => {
  if (!rateLimit(`forgot:${clientIp(req)}`, 5, 3600_000)) throw new HttpError(429, 'Too many requests. Try again later.');
  const { email } = z.object({ email: v.email }).parse(await req.json());
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (u && emailAllowed(u.email)) {
    const token = newToken();
    await db.insert(passwordResets).values({ id: sha256(token), userId: u.id, expiresAt: new Date(Date.now() + 3600_000) });
    const link = `${process.env.APP_URL || new URL(req.url).origin}/reset?token=${token}`;
    await sendMail(u.email, 'Reset your Tabiya password', `Hi ${u.username},\n\nUse this link to choose a new password. It expires in one hour.\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`);
  }
  // Same response either way, so the form cannot be used to discover registered emails.
  return ok({ ok: true });
});
