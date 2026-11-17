import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { hashPassword, verifyPassword } from '@/lib/auth-core';
import { HttpError, ok, requireUser, route } from '@/lib/api';
import * as v from '@/lib/validation';

export const POST = route(async (req) => {
  const u = await requireUser();
  const b = z.object({ current: z.string().min(1, 'Enter your current password.'), next: v.password }).parse(await req.json());
  const [row] = await db.select({ h: users.passwordHash }).from(users).where(eq(users.id, u.id));
  if (!(await verifyPassword(b.current, row.h))) throw new HttpError(400, 'Your current password is incorrect.');
  await db.update(users).set({ passwordHash: await hashPassword(b.next) }).where(eq(users.id, u.id));
  return ok({ ok: true });
});
