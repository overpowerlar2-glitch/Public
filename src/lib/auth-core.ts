// Framework-independent auth: used by both Next.js route handlers and the socket server.
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { and, eq, gt } from 'drizzle-orm';
import { db } from './db';
import { users, sessions, profiles, ratings } from './db/schema';
import { CATEGORIES } from './chess/time';
import { emailAllowed, isRestricted } from './access';
import { emailVerifications } from './db/schema';

export const SESSION_COOKIE = 'tabiya_sid';
export const GUEST_COOKIE = 'tabiya_guest';
const SESSION_DAYS = 30;

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export type SessionUser = {
  id: number; username: string; email: string; role: string; status: string;
  avatar: string | null; country: string; bio: string;
};

export async function createSession(userId: number) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function userFromToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id, username: users.username, email: users.email, role: users.role, status: users.status, verifiedAt: users.emailVerifiedAt,
      avatar: profiles.avatar, country: profiles.country, bio: profiles.bio,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const u = rows[0];
  if (!u || u.status === 'banned') return null;
  // On a private site an existing session stops working if the account is outside the allowed domains or unverified.
  if (isRestricted() && (!u.verifiedAt || !emailAllowed(u.email))) return null;
  const { verifiedAt: _v, ...rest } = u;
  return { ...rest, country: u.country ?? '', bio: u.bio ?? '' };
}

export async function createUser(username: string, email: string, password: string) {
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const [u] = await tx.insert(users).values({ username, usernameLower: username.toLowerCase(), email: email.toLowerCase(), passwordHash }).returning();
    await tx.insert(profiles).values({ userId: u.id });
    await tx.insert(ratings).values(CATEGORIES.map((category) => ({ userId: u.id, category })));
    return u;
  });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// Tiny in-memory rate limiter (per process). Swap for Redis when running several nodes.
const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return true; }
  return ++b.n <= max;
}

let dummy: Promise<string> | undefined;
/** A throwaway hash to compare against when the account does not exist (keeps login timing uniform). */
export const dummyHash = () => (dummy ??= hashPassword(newToken()));

/** Creates an email-verification token for a user, valid for 24 hours. */
export async function createVerification(userId: number) {
  const token = newToken();
  await db.insert(emailVerifications).values({ id: sha256(token), userId, expiresAt: new Date(Date.now() + 24 * 3600_000) });
  return token;
}
