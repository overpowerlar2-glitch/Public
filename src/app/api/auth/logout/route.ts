import { cookies } from 'next/headers';
import { destroySession, SESSION_COOKIE } from '@/lib/auth-core';
import { clearSessionCookie, ok, route } from '@/lib/api';

export const POST = route(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  return clearSessionCookie(ok({ ok: true }));
});
