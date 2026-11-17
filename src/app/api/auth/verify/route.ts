import { z } from 'zod';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { emailVerifications, users } from '@/lib/db/schema';
import { createSession, sha256 } from '@/lib/auth-core';
import { HttpError, ok, route, setSessionCookie } from '@/lib/api';

export const POST = route(async (req) => {
  const { token } = z.object({ token: z.string().min(10).max(200) }).parse(await req.json());
  const id = sha256(token);
  const [v] = await db.select().from(emailVerifications).where(and(eq(emailVerifications.id, id), isNull(emailVerifications.usedAt), gt(emailVerifications.expiresAt, new Date())));
  if (!v) throw new HttpError(400, 'This confirmation link is invalid or has expired. Sign in to get a new one.');
  await db.transaction(async (tx) => {
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, v.userId));
    await tx.update(emailVerifications).set({ usedAt: new Date() }).where(eq(emailVerifications.id, id));
  });
  const s = await createSession(v.userId);
  return setSessionCookie(ok({ ok: true }), s.token, s.expiresAt);
});
