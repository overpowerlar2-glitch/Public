import { z } from 'zod';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { passwordResets, sessions, users } from '@/lib/db/schema';
import { hashPassword, sha256 } from '@/lib/auth-core';
import { HttpError, ok, route } from '@/lib/api';
import * as v from '@/lib/validation';

export const POST = route(async (req) => {
  const b = z.object({ token: z.string().min(10).max(200), password: v.password }).parse(await req.json());
  const id = sha256(b.token);
  const [r] = await db.select().from(passwordResets).where(and(eq(passwordResets.id, id), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())));
  if (!r) throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
  const passwordHash = await hashPassword(b.password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, emailVerifiedAt: new Date() }).where(eq(users.id, r.userId)); // the reset link proves the address
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, id));
    await tx.delete(sessions).where(eq(sessions.userId, r.userId)); // sign out everywhere
  });
  return ok({ ok: true });
});
