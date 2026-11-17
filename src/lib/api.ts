import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { ZodError } from 'zod';
import { GUEST_COOKIE, SESSION_COOKIE, userFromToken, type SessionUser } from './auth-core';
import type { Hub } from '../../server/hub';
import { isRestricted } from './access';

const PUBLIC_API = new Set(['/api/auth/register', '/api/auth/login', '/api/auth/logout', '/api/auth/forgot', '/api/auth/reset', '/api/auth/verify', '/api/auth/resend', '/api/me']);

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export const ok = <T>(data: T, status = 200) => NextResponse.json(data, { status });
export const fail = (status: number, error: string) => NextResponse.json({ error }, { status });
export const hub = () => (globalThis as unknown as { __tabiyaHub?: Hub }).__tabiyaHub;

export async function currentUser(): Promise<SessionUser | null> {
  return userFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}
export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, 'Please sign in to continue.');
  return u;
}

const secure = () => (process.env.APP_URL || '').startsWith('https://');
export function setSessionCookie(res: NextResponse, token: string, expires: Date) {
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secure(), path: '/', expires });
  return res;
}
export function clearSessionCookie(res: NextResponse) { res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 }); return res; }
export function setGuestCookie(res: NextResponse, token: string) {
  res.cookies.set(GUEST_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: secure(), path: '/', maxAge: 60 * 60 * 24 * 365 });
  return res;
}

/** Wraps a route handler with uniform error handling. */
export function route<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    try {
      if (isRestricted() && !PUBLIC_API.has(new URL(req.url).pathname)) await requireUser();
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return fail(e.status, e.message);
      if (e instanceof ZodError) return fail(400, e.issues[0]?.message ?? 'Invalid input.');
      if (e instanceof SyntaxError) return fail(400, 'Malformed request body.');
      console.error('[api]', req.method, new URL(req.url).pathname, e);
      return fail(500, 'Something went wrong. Please try again.');
    }
  };
}
export const clientIp = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
