// Real-time game server: matchmaking, private rooms, authoritative clocks, chat,
// draw/resign flow, disconnect handling, persistence and rating updates.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { Chess } from 'chess.js';
import { createEngineService } from './engine';
import { isRestricted } from '../src/lib/access';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { games, moves as movesTable, ratings, ratingHistory, users } from '../src/lib/db/schema';
import { GUEST_COOKIE, SESSION_COOKIE, parseCookies, userFromToken } from '../src/lib/auth-core';
import { categoryOf, validTc, type Category, type TimeControl } from '../src/lib/chess/time';
import type { Ack, ChatMessage, Color, GameState, LiveGameSummary, PlayerInfo } from '../src/lib/types';

type Identity = { key: string; userId: number | null; name: string; guest: boolean; avatar: string | null; country: string; status: string };
type Seat = Identity & { rating: number | null };
type Result = '1-0' | '0-1' | '1/2-1/2';

type Game = {
  id: string;
  status: GameState['status'];
  tc: TimeControl;
  category: Category;
  rated: boolean;
  seats: { w: Seat | null; b: Seat | null };
  chess: Chess;
  sans: string[];
  ucis: string[];
  clocks: number[]; // mover's remaining ms after each ply
  clock: { w: number; b: number } | null;
  lastTick: number;
  result: Result | null;
  reason: string | null;
  drawOffer: Color | null;
  ratingDiff: { w: number; b: number } | null;
  eco: string | null;
  opening: string | null;
  chat: ChatMessage[];
  createdAt: number;
  persisted: boolean;
  flagTimer?: NodeJS.Timeout;
  startTimer?: NodeJS.Timeout;
  leaveTimers: { w?: NodeJS.Timeout; b?: NodeJS.Timeout };
  gcTimer?: NodeJS.Timeout;
};

const lastFn = (a: unknown[]) => (typeof a[a.length - 1] === 'function' ? (a[a.length - 1] as (r: unknown) => void) : undefined);
const FIRST_MOVE_MS = 60_000;
const ABANDON_MS = 60_000;
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const newId = () => randomBytes(6).toString('base64url');

export function createHub(io: Server) {
  const live = new Map<string, Game>();
  const seeks = new Map<string, { identity: Identity; socketId: string; tc: TimeControl; rated: boolean; sig: string }>();
  const online = new Map<string, number>(); // identity key → open sockets
  const openings = loadOpenings();
  const engine = createEngineService();

  /* ───────── identity ───────── */

  async function identify(socket: Socket): Promise<Identity> {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const user = await userFromToken(cookies[SESSION_COOKIE]).catch(() => null);
    if (user) return { key: `u:${user.id}`, userId: user.id, name: user.username, guest: false, avatar: user.avatar, country: user.country, status: user.status };
    const token = /^[\w-]{8,64}$/.test(cookies[GUEST_COOKIE] || '') ? cookies[GUEST_COOKIE] : socket.id;
    return { key: `g:${token}`, userId: null, name: `Guest-${token.slice(0, 4).toUpperCase()}`, guest: true, avatar: null, country: '', status: 'active' };
  }

  async function seat(identity: Identity, category: Category): Promise<Seat> {
    if (!identity.userId) return { ...identity, rating: null };
    const [r] = await db.select({ rating: ratings.rating }).from(ratings).where(and(eq(ratings.userId, identity.userId), eq(ratings.category, category)));
    return { ...identity, rating: r?.rating ?? 1500 };
  }

  /* ───────── state ───────── */

  const colorOf = (g: Game, key: string): Color | null => (g.seats.w?.key === key ? 'w' : g.seats.b?.key === key ? 'b' : null);
  const isRealtime = (g: Game) => g.tc.initial != null;
  const room = (id: string) => `game:${id}`;
  const connected = (g: Game, key: string) => {
    const r = io.sockets.adapter.rooms.get(room(g.id));
    if (!r) return false;
    for (const sid of r) if ((io.sockets.sockets.get(sid)?.data.identity as Identity | undefined)?.key === key) return true;
    return false;
  };

  function liveClock(g: Game, now = Date.now()) {
    if (!g.clock) return null;
    const running: Color | null = g.status === 'active' && (g.sans.length >= 2 || g.tc.days != null) ? g.chess.turn() : null;
    const c = { w: g.clock.w, b: g.clock.b, running };
    if (running) c[running] = Math.max(0, c[running] - (now - g.lastTick));
    return c;
  }

  function info(g: Game, c: Color): PlayerInfo | null {
    const s = g.seats[c];
    if (!s) return null;
    return { key: s.key, userId: s.userId, name: s.name, guest: s.guest, rating: s.rating, avatar: s.avatar, country: s.country, online: connected(g, s.key) };
  }

  function snapshot(g: Game): GameState {
    const r = io.sockets.adapter.rooms.get(room(g.id));
    let spectators = 0;
    if (r) for (const sid of r) { const k = (io.sockets.sockets.get(sid)?.data.identity as Identity | undefined)?.key; if (k && !colorOf(g, k)) spectators++; }
    return {
      id: g.id, status: g.status, tc: g.tc, category: g.category, rated: g.rated,
      white: info(g, 'w'), black: info(g, 'b'), moves: g.sans, fen: g.chess.fen(),
      clock: liveClock(g), at: Date.now(), result: g.result, reason: g.reason, drawOffer: g.drawOffer,
      ratingDiff: g.ratingDiff, eco: g.eco, opening: g.opening, spectators, createdAt: g.createdAt,
    };
  }

  const broadcast = (g: Game) => io.to(room(g.id)).emit('game:state', snapshot(g));
  const say = (g: Game, text: string) => {
    const m: ChatMessage = { from: '', color: null, text, at: Date.now(), system: true };
    g.chat.push(m);
    io.to(room(g.id)).emit('game:chat', { id: g.id, message: m });
  };

  function summaries(): LiveGameSummary[] {
    const out: LiveGameSummary[] = [];
    for (const g of live.values()) {
      if (g.status !== 'active' || !g.seats.w || !g.seats.b) continue;
      out.push({
        id: g.id, white: g.seats.w.name, black: g.seats.b.name, whiteRating: g.seats.w.rating, blackRating: g.seats.b.rating,
        tc: g.tc, category: g.category, rated: g.rated, fen: g.chess.fen(), lastMove: g.ucis[g.ucis.length - 1] ?? null, plies: g.sans.length,
      });
    }
    return out.sort((a, b) => (b.whiteRating ?? 0) + (b.blackRating ?? 0) - (a.whiteRating ?? 0) - (a.blackRating ?? 0)).slice(0, 24);
  }
  const lobbyPush = () => io.to('lobby').emit('lobby:state', { live: summaries(), seeking: seeks.size, online: online.size });

  /* ───────── lifecycle ───────── */

  function makeGame(tc: TimeControl, rated: boolean): Game {
    const g: Game = {
      id: newId(), status: 'waiting', tc, category: categoryOf(tc), rated, seats: { w: null, b: null },
      chess: new Chess(), sans: [], ucis: [], clocks: [],
      clock: tc.days ? { w: tc.days * 864e5, b: tc.days * 864e5 } : tc.initial != null ? { w: tc.initial * 1000, b: tc.initial * 1000 } : null,
      lastTick: Date.now(), result: null, reason: null, drawOffer: null, ratingDiff: null, eco: null, opening: null,
      chat: [], createdAt: Date.now(), persisted: false, leaveTimers: {},
    };
    live.set(g.id, g);
    // Unjoined invitations expire after 30 minutes.
    g.gcTimer = setTimeout(() => { if (g.status === 'waiting') { g.status = 'aborted'; g.reason = 'aborted'; broadcast(g); live.delete(g.id); } }, 30 * 60_000);
    return g;
  }

  async function start(g: Game) {
    clearTimeout(g.gcTimer);
    g.status = 'active';
    g.lastTick = Date.now();
    g.createdAt = Date.now();
    await db.insert(games).values({
      id: g.id, whiteId: g.seats.w!.userId, blackId: g.seats.b!.userId, whiteKey: g.seats.w!.key, blackKey: g.seats.b!.key,
      whiteName: g.seats.w!.name, blackName: g.seats.b!.name, whiteRating: g.seats.w!.rating, blackRating: g.seats.b!.rating,
      initial: g.tc.initial, increment: g.tc.increment, days: g.tc.days, category: g.category, rated: g.rated,
      status: 'active', fen: g.chess.fen(), whiteMs: g.clock?.w ?? null, blackMs: g.clock?.b ?? null, lastMoveAt: new Date(),
    });
    g.persisted = true;
    arm(g);
    broadcast(g);
    lobbyPush();
  }

  function arm(g: Game) {
    clearTimeout(g.flagTimer); clearTimeout(g.startTimer);
    if (g.status !== 'active') return;
    const c = liveClock(g);
    if (c?.running) {
      const ms = Math.min(c[c.running] + 30, 2 ** 31 - 1);
      g.flagTimer = setTimeout(() => flag(g), ms);
    } else if (isRealtime(g) && g.sans.length < 2) {
      g.startTimer = setTimeout(() => finish(g, null, 'aborted'), FIRST_MOVE_MS);
    }
  }

  function flag(g: Game) {
    if (g.status !== 'active') return;
    const c = liveClock(g);
    if (!c?.running) return;
    if (c[c.running] > 0) return arm(g);
    const loser = c.running;
    g.clock![loser] = 0;
    g.lastTick = Date.now();
    // A lone king (or king + minor) cannot deliver mate: draw instead of a win on time.
    const winnerPieces = g.chess.board().flat().filter((p) => p && p.color !== loser && p.type !== 'k').map((p) => p!.type);
    const cannotMate = winnerPieces.length === 0 || (winnerPieces.length === 1 && 'bn'.includes(winnerPieces[0]));
    if (cannotMate) finish(g, '1/2-1/2', 'timeout-insufficient');
    else finish(g, loser === 'w' ? '0-1' : '1-0', 'timeout');
  }

  async function finish(g: Game, result: Result | null, reason: string) {
    if (g.status !== 'active') return;
    clearTimeout(g.flagTimer); clearTimeout(g.startTimer); clearTimeout(g.leaveTimers.w); clearTimeout(g.leaveTimers.b);
    const c = liveClock(g);
    if (g.clock && c) { g.clock.w = c.w; g.clock.b = c.b; }
    g.status = result ? 'finished' : 'aborted';
    g.result = result; g.reason = reason; g.drawOffer = null;
    const op = identifyOpening(g.sans);
    g.eco = op?.[0] ?? null; g.opening = op?.[1] ?? null;
    try {
      if (result && g.rated && g.seats.w?.userId && g.seats.b?.userId) g.ratingDiff = await applyRatings(g, result);
      else if (result) await bumpCounts(g, result);
      await db.update(games).set({
        status: g.status, result, reason, moves: g.sans.join(' '), fen: g.chess.fen(), whiteMs: g.clock?.w ?? null, blackMs: g.clock?.b ?? null,
        whiteDiff: g.ratingDiff?.w ?? null, blackDiff: g.ratingDiff?.b ?? null, eco: g.eco, opening: g.opening, endedAt: new Date(),
      }).where(eq(games.id, g.id));
      if (result && g.sans.length) {
        await db.insert(movesTable).values(g.sans.map((san, i) => ({ gameId: g.id, ply: i + 1, san, uci: g.ucis[i], clockMs: g.clocks[i] ?? null }))).onConflictDoNothing();
      }
    } catch (e) { console.error('[hub] failed to persist finished game', g.id, e); }
    broadcast(g);
    lobbyPush();
    // Keep the finished game in memory briefly so both players see the final state, then release it.
    setTimeout(() => live.delete(g.id), 10 * 60_000);
  }

  async function applyRatings(g: Game, result: Result) {
    const w = g.seats.w!, b = g.seats.b!;
    const score = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5;
    return db.transaction(async (tx) => {
      const get = async (uid: number) => (await tx.select().from(ratings).where(and(eq(ratings.userId, uid), eq(ratings.category, g.category))).for('update'))[0]
        ?? (await tx.insert(ratings).values({ userId: uid, category: g.category }).returning())[0];
      // Lock rows in a stable order to avoid deadlocks between concurrent finishes.
      const first = w.userId! < b.userId! ? await get(w.userId!) : await get(b.userId!);
      const second = w.userId! < b.userId! ? await get(b.userId!) : await get(w.userId!);
      const rw = w.userId! < b.userId! ? first : second, rb = w.userId! < b.userId! ? second : first;
      const expW = 1 / (1 + 10 ** ((rb.rating - rw.rating) / 400));
      const k = (n: number) => (n < 30 ? 40 : 20);
      const dw = Math.round(k(rw.games) * (score - expW));
      const db_ = Math.round(k(rb.games) * (1 - score - (1 - expW)));
      for (const [r, d, s] of [[rw, dw, score], [rb, db_, 1 - score]] as const) {
        const next = Math.max(100, r.rating + d);
        await tx.update(ratings).set({
          rating: next, peak: Math.max(r.peak, next), games: r.games + 1,
          wins: r.wins + (s === 1 ? 1 : 0), losses: r.losses + (s === 0 ? 1 : 0), draws: r.draws + (s === 0.5 ? 1 : 0), updatedAt: new Date(),
        }).where(and(eq(ratings.userId, r.userId), eq(ratings.category, g.category)));
        await tx.insert(ratingHistory).values({ userId: r.userId, category: g.category, rating: next, gameId: g.id });
      }
      return { w: dw, b: db_ };
    });
  }

  // Casual games still count towards a player's win/loss/draw totals, just not their rating.
  async function bumpCounts(g: Game, result: Result) {
    for (const c of ['w', 'b'] as const) {
      const uid = g.seats[c]?.userId;
      if (!uid) continue;
      const s = result === '1/2-1/2' ? 'draws' : (result === '1-0') === (c === 'w') ? 'wins' : 'losses';
      await db.insert(ratings).values({ userId: uid, category: g.category, games: 1, [s]: 1 })
        .onConflictDoUpdate({ target: [ratings.userId, ratings.category], set: { games: sql`${ratings.games} + 1`, [s]: sql`${ratings[s]} + 1` } });
    }
  }

  function persistMove(g: Game) {
    db.update(games).set({ moves: g.sans.join(' '), fen: g.chess.fen(), whiteMs: g.clock?.w ?? null, blackMs: g.clock?.b ?? null, lastMoveAt: new Date() })
      .where(eq(games.id, g.id)).catch((e) => console.error('[hub] persist move failed', e.message));
  }

  /** Restore an in-progress game from the database (after a restart, or a correspondence game). */
  async function restore(id: string): Promise<Game | null> {
    const [row] = await db.select().from(games).where(and(eq(games.id, id), eq(games.status, 'active')));
    if (!row) return null;
    if (live.has(id)) return live.get(id)!;
    const chess = new Chess();
    const sans = row.moves ? row.moves.split(' ') : [];
    const ucis: string[] = [];
    for (const s of sans) { const m = chess.move(s); ucis.push(m.from + m.to + (m.promotion ?? '')); }
    const lookup = async (uid: number | null, key: string, name: string, rating: number | null): Promise<Seat> => {
      const base: Seat = { key, userId: uid, name, guest: !uid, avatar: null, country: '', status: 'active', rating };
      return base;
    };
    const tc: TimeControl = { initial: row.initial, increment: row.increment, days: row.days };
    const g: Game = {
      id, status: 'active', tc, category: row.category as Category, rated: row.rated,
      seats: { w: await lookup(row.whiteId, row.whiteKey, row.whiteName, row.whiteRating), b: await lookup(row.blackId, row.blackKey, row.blackName, row.blackRating) },
      chess, sans, ucis, clocks: [], clock: row.whiteMs != null && row.blackMs != null ? { w: row.whiteMs, b: row.blackMs } : null,
      // Real-time clocks resume from "now" so server downtime is not charged to the player; correspondence keeps wall time.
      lastTick: tc.days ? (row.lastMoveAt?.getTime() ?? Date.now()) : Date.now(),
      result: null, reason: null, drawOffer: null, ratingDiff: null, eco: null, opening: null, chat: [],
      createdAt: row.createdAt.getTime(), persisted: true, leaveTimers: {},
    };
    live.set(id, g);
    arm(g);
    // A restored real-time game must not hang forever if its players never come back.
    if (isRealtime(g)) setTimeout(() => {
      if (g.status !== 'active') return;
      const here = { w: connected(g, g.seats.w!.key), b: connected(g, g.seats.b!.key) };
      if (here.w && here.b) return;
      if (g.sans.length < 2 || (!here.w && !here.b)) return void finish(g, null, 'aborted');
      finish(g, here.w ? '1-0' : '0-1', 'abandoned');
    }, ABANDON_MS);
    return g;
  }

  async function restoreAll() {
    const rows = await db.select({ id: games.id }).from(games).where(eq(games.status, 'active'));
    for (const r of rows) await restore(r.id).catch((e) => console.error('[hub] restore failed', r.id, e.message));
    if (rows.length) console.log(`[hub] restored ${rows.length} active game(s)`);
  }

  function identifyOpening(sans: string[]): [string, string] | null {
    const c = new Chess();
    let hit: [string, string] | null = null;
    for (const s of sans.slice(0, 40)) {
      try { c.move(s); } catch { break; }
      const o = openings.get(c.fen().split(' ').slice(0, 4).join(' '));
      if (o) hit = o;
    }
    return hit;
  }

  /* ───────── sockets ───────── */

  // Identify the player before the connection is announced, so every handler below is registered
  // synchronously and no event sent right after connecting can be missed.
  io.use(async (socket, next) => {
    try {
      const who = await identify(socket);
      if (isRestricted() && who.guest) return next(new Error('auth-required'));
      socket.data.identity = who; next();
    } catch (e) { console.error('[hub] identify failed', e); next(new Error('Could not identify the connection.')); }
  });

  io.on('connection', (socket) => {
    const me = socket.data.identity as Identity;
    socket.join(`id:${me.key}`);
    online.set(me.key, (online.get(me.key) ?? 0) + 1);
    if (me.userId) db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, me.userId)).catch(() => {});
    engine.attach(socket);
    socket.emit('hello', { key: me.key, name: me.name, guest: me.guest });

    const safe = <A extends unknown[]>(fn: (...a: A) => unknown) => async (...a: A) => {
      try { await fn(...a); } catch (e) {
        console.error('[hub] handler error', e);
        const ack = a[a.length - 1];
        if (typeof ack === 'function') ack({ ok: false, error: 'Something went wrong on the server.' });
      }
    };
    const parseTc = (raw: unknown): TimeControl | null => {
      const t = raw as Partial<TimeControl> | null;
      if (!t || typeof t !== 'object') return null;
      const tc: TimeControl = { initial: t.initial ?? null, increment: t.increment ?? 0, days: t.days ?? null };
      return validTc(tc) ? tc : null;
    };
    const ratedAllowed = (tc: TimeControl): string | null =>
      me.guest ? 'Sign in to play rated games.' : me.status !== 'active' ? 'Your account cannot play rated games.' : tc.initial == null && !tc.days ? 'Unlimited games cannot be rated.' : null;

    socket.on('lobby:subscribe', safe((...a: unknown[]) => {
      const ack = lastFn(a);
      socket.join('lobby');
      ack?.({ live: summaries(), seeking: seeks.size, online: online.size });
    }));
    socket.on('lobby:unsubscribe', () => socket.leave('lobby'));
    socket.on('lobby:get', safe((...a: unknown[]) => lastFn(a)?.({ live: summaries(), seeking: seeks.size, online: online.size })));

    socket.on('my:games', safe((...a: unknown[]) => {
      const ack = lastFn(a);
      const mine = [...live.values()].filter((g) => g.status === 'active' && colorOf(g, me.key)).map((g) => {
        const c = colorOf(g, me.key)!;
        return { id: g.id, opponent: g.seats[other(c)]?.name ?? '?', color: c, turn: g.chess.turn(), tc: g.tc };
      });
      ack?.({ games: mine });
    }));

    socket.on('seek', safe(async (p: { tc: unknown; rated?: boolean }, ack?: (r: Ack) => void) => {
      const tc = parseTc(p?.tc);
      if (!tc) return ack?.({ ok: false, error: 'Invalid time control.' });
      const rated = !!p.rated;
      if (rated) { const why = ratedAllowed(tc); if (why) return ack?.({ ok: false, error: why }); }
      seeks.delete(socket.id);
      const sig = `${tc.initial}|${tc.increment}|${tc.days}|${rated}`;
      const match = [...seeks.values()].find((s) => s.sig === sig && s.identity.key !== me.key && io.sockets.sockets.has(s.socketId));
      if (!match) {
        seeks.set(socket.id, { identity: me, socketId: socket.id, tc, rated, sig });
        ack?.({ ok: true });
        return lobbyPush();
      }
      seeks.delete(match.socketId);
      const g = makeGame(tc, rated);
      const meWhite = Math.random() < 0.5;
      g.seats.w = await seat(meWhite ? me : match.identity, g.category);
      g.seats.b = await seat(meWhite ? match.identity : me, g.category);
      await start(g);
      ack?.({ ok: true });
      io.to(match.socketId).to(socket.id).emit('seek:matched', { id: g.id });
    }));
    socket.on('seek:cancel', () => { if (seeks.delete(socket.id)) lobbyPush(); });

    socket.on('room:create', safe(async (p: { tc: unknown; rated?: boolean; color?: string; invite?: string }, ack?: (r: Ack<{ id: string }>) => void) => {
      const tc = parseTc(p?.tc);
      if (!tc) return ack?.({ ok: false, error: 'Invalid time control.' });
      const rated = !!p.rated;
      if (rated) { const why = ratedAllowed(tc); if (why) return ack?.({ ok: false, error: why }); }
      let target: { id: number; username: string } | undefined;
      if (p.invite) {
        [target] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.usernameLower, String(p.invite).toLowerCase()));
        if (!target) return ack?.({ ok: false, error: 'Player not found.' });
        if (target.id === me.userId) return ack?.({ ok: false, error: 'You cannot challenge yourself.' });
      }
      const g = makeGame(tc, rated);
      const color: Color = p.color === 'w' || p.color === 'b' ? p.color : Math.random() < 0.5 ? 'w' : 'b';
      g.seats[color] = await seat(me, g.category);
      if (target) io.to(`id:u:${target.id}`).emit('challenge:incoming', { id: g.id, from: me.name, tc, rated });
      ack?.({ ok: true, id: g.id });
    }));

    socket.on('game:join', safe(async (p: { id: string }, ack?: (r: Ack<{ state: GameState; chat: ChatMessage[]; you: Color | null }>) => void) => {
      const id = String(p?.id ?? '');
      const g = live.get(id) ?? (await restore(id));
      if (!g) return ack?.({ ok: false, error: 'Game not found.', finished: true });
      let you = colorOf(g, me.key);
      if (g.status === 'waiting' && !you) {
        if (g.rated && me.guest) return ack?.({ ok: false, error: 'This is a rated game. Sign in to accept it.' });
        const free: Color = g.seats.w ? 'b' : 'w';
        g.seats[free] = await seat(me, g.category);
        you = free;
        socket.join(room(id));
        await start(g);
      } else {
        socket.join(room(id));
        if (you) { clearTimeout(g.leaveTimers[you]); g.leaveTimers[you] = undefined; }
        broadcast(g);
      }
      ack?.({ ok: true, state: snapshot(g), chat: you ? g.chat : g.chat.filter((m) => m.system), you });
    }));

    socket.on('game:leave', (p: { id: string }) => { socket.leave(room(String(p?.id))); onLeftGame(String(p?.id)); });

    socket.on('game:move', safe((p: { id: string; uci: string }, ack?: (r: Ack) => void) => {
      const g = live.get(String(p?.id));
      const color = g && colorOf(g, me.key);
      if (!g || g.status !== 'active' || !color) return ack?.({ ok: false, error: 'Game is not in progress.' });
      if (g.chess.turn() !== color) { socket.emit('game:state', snapshot(g)); return ack?.({ ok: false, error: 'Not your turn.' }); }
      const uci = String(p.uci ?? '');
      const now = Date.now();
      const c = liveClock(g, now);
      if (c?.running && c[color] <= 0) return flag(g);
      let mv;
      try { mv = g.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { mv = null; }
      if (!mv) { socket.emit('game:state', snapshot(g)); return ack?.({ ok: false, error: 'Illegal move.' }); }
      if (g.clock) {
        if (g.tc.days) g.clock[color] = g.tc.days * 864e5;
        else if (c?.running) g.clock[color] = c[color] + g.tc.increment * 1000;
      }
      g.lastTick = now;
      g.sans.push(mv.san); g.ucis.push(uci); g.clocks.push(g.clock ? g.clock[color] : 0);
      if (g.drawOffer && g.drawOffer !== color) g.drawOffer = null;
      ack?.({ ok: true });
      const ch = g.chess;
      if (ch.isCheckmate()) return finish(g, color === 'w' ? '1-0' : '0-1', 'checkmate');
      if (ch.isStalemate()) return finish(g, '1/2-1/2', 'stalemate');
      if (ch.isInsufficientMaterial()) return finish(g, '1/2-1/2', 'insufficient');
      if (ch.isThreefoldRepetition()) return finish(g, '1/2-1/2', 'repetition');
      if (ch.isDraw()) return finish(g, '1/2-1/2', 'fifty');
      arm(g);
      persistMove(g);
      broadcast(g);
    }));

    socket.on('game:resign', safe((p: { id: string }) => {
      const g = live.get(String(p?.id));
      const color = g && colorOf(g, me.key);
      if (!g || g.status !== 'active' || !color) return;
      if (g.sans.length < 2) return finish(g, null, 'aborted');
      finish(g, color === 'w' ? '0-1' : '1-0', 'resign');
    }));

    socket.on('game:draw', safe((p: { id: string; action: 'offer' | 'accept' | 'decline' }) => {
      const g = live.get(String(p?.id));
      const color = g && colorOf(g, me.key);
      if (!g || g.status !== 'active' || !color || g.sans.length < 2) return;
      if (p.action === 'offer' && !g.drawOffer) { g.drawOffer = color; say(g, `${g.seats[color]!.name} offers a draw`); return broadcast(g); }
      if (p.action === 'accept' && g.drawOffer === other(color)) return finish(g, '1/2-1/2', 'agreement');
      if (p.action === 'decline' && g.drawOffer === other(color)) { g.drawOffer = null; say(g, 'Draw offer declined'); return broadcast(g); }
    }));

    let lastChat = 0;
    socket.on('game:chat', safe((p: { id: string; text: string }) => {
      const g = live.get(String(p?.id));
      const color = g && colorOf(g, me.key);
      const text = String(p?.text ?? '').trim().slice(0, 300);
      if (!g || !color || !text || Date.now() - lastChat < 400) return;
      lastChat = Date.now();
      const m: ChatMessage = { from: me.name, color, text, at: Date.now() };
      g.chat.push(m);
      if (g.chat.length > 200) g.chat.shift();
      // Player chat is only delivered to the two players.
      for (const c of ['w', 'b'] as const) if (g.seats[c]) io.to(`id:${g.seats[c]!.key}`).emit('game:chat', { id: g.id, message: m });
    }));

    function onLeftGame(id: string) {
      const g = live.get(id);
      if (!g) return;
      const color = colorOf(g, me.key);
      if (color && g.status === 'active' && !connected(g, me.key) && isRealtime(g) && !g.leaveTimers[color]) {
        g.leaveTimers[color] = setTimeout(() => {
          g.leaveTimers[color] = undefined;
          if (g.status !== 'active' || connected(g, me.key)) return;
          if (g.sans.length < 2) finish(g, null, 'aborted');
          else finish(g, color === 'w' ? '0-1' : '1-0', 'abandoned');
        }, ABANDON_MS);
      }
      if (g.status !== 'waiting') broadcast(g);
    }

    socket.on('disconnecting', () => {
      const ids = [...socket.rooms].filter((r) => r.startsWith('game:')).map((r) => r.slice(5));
      // Rooms are still populated during 'disconnecting'; evaluate after the socket has actually left.
      setImmediate(() => ids.forEach(onLeftGame));
    });
    socket.on('disconnect', () => {
      if (seeks.delete(socket.id)) lobbyPush();
      const n = (online.get(me.key) ?? 1) - 1;
      if (n <= 0) online.delete(me.key); else online.set(me.key, n);
    });
  });

  restoreAll().catch((e) => console.error('[hub] could not restore active games:', e.message));

  return {
    isOnline: (userId: number) => online.has(`u:${userId}`),
    stats: () => ({ online: online.size, playing: [...live.values()].filter((g) => g.status === 'active').length, seeking: seeks.size }),
    live: summaries,
    stop: () => engine.stop(),
  };
}

export type Hub = ReturnType<typeof createHub>;

function loadOpenings(): Map<string, [string, string]> {
  const m = new Map<string, [string, string]>();
  try {
    const rows = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'openings.json'), 'utf8')) as [string, string, string, string][];
    for (const [eco, name, , epd] of rows) m.set(epd, [eco, name]);
  } catch { console.warn('[hub] openings.json not found; games will not be tagged with opening names'); }
  return m;
}
