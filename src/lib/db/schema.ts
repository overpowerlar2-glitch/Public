import { pgTable, serial, text, integer, boolean, timestamp, primaryKey, index, uniqueIndex, jsonb, bigint } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/* ───────────── Accounts ───────────── */

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull(),
  usernameLower: text('username_lower').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'), // user | admin
  status: text('status').notNull().default('active'), // active | suspended | banned
  createdAt: ts('created_at').notNull().defaultNow(),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  emailVerifiedAt: ts('email_verified_at'),
}, (t) => [uniqueIndex('users_username_uq').on(t.usernameLower), uniqueIndex('users_email_uq').on(t.email)]);

export const profiles = pgTable('profiles', {
  userId: integer('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  bio: text('bio').notNull().default(''),
  country: text('country').notNull().default(''), // ISO 3166-1 alpha-2
  avatar: text('avatar'), // small data URL, resized client-side
  preferences: jsonb('preferences').$type<Record<string, unknown>>().notNull().default({}),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // sha256 of the cookie token
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

export const passwordResets = pgTable('password_resets', {
  id: text('id').primaryKey(), // sha256 of the emailed token
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
});

export const emailVerifications = pgTable('email_verifications', {
  id: text('id').primaryKey(), // sha256 of the emailed token
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
}, (t) => [index('email_verifications_user_idx').on(t.userId)]);

/* ───────────── Ratings ───────────── */

export const ratings = pgTable('ratings', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: text('category').notNull(), // bullet | blitz | rapid | classical | correspondence | puzzle
  rating: integer('rating').notNull().default(1500),
  peak: integer('peak').notNull().default(1500),
  games: integer('games').notNull().default(0),
  wins: integer('wins').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  draws: integer('draws').notNull().default(0),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.category] }), index('ratings_board_idx').on(t.category, t.rating)]);

export const ratingHistory = pgTable('rating_history', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  rating: integer('rating').notNull(),
  gameId: text('game_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('rating_history_idx').on(t.userId, t.category, t.createdAt)]);

/* ───────────── Games ───────────── */

export const games = pgTable('games', {
  id: text('id').primaryKey(),
  whiteId: integer('white_id').references(() => users.id, { onDelete: 'set null' }),
  blackId: integer('black_id').references(() => users.id, { onDelete: 'set null' }),
  whiteKey: text('white_key').notNull(), // identity key: "u:<id>" or "g:<guest token>"
  blackKey: text('black_key').notNull(),
  whiteName: text('white_name').notNull(),
  blackName: text('black_name').notNull(),
  whiteRating: integer('white_rating'),
  blackRating: integer('black_rating'),
  whiteDiff: integer('white_diff'),
  blackDiff: integer('black_diff'),
  initial: integer('initial'), // seconds; null = no clock
  increment: integer('increment').notNull().default(0),
  days: integer('days'), // correspondence: days per move
  category: text('category').notNull(),
  rated: boolean('rated').notNull().default(false),
  status: text('status').notNull().default('active'), // active | finished | aborted
  result: text('result'), // 1-0 | 0-1 | 1/2-1/2
  reason: text('reason'), // checkmate | resign | timeout | stalemate | agreement | repetition | ...
  moves: text('moves').notNull().default(''), // SAN, space separated
  fen: text('fen').notNull(),
  whiteMs: bigint('white_ms', { mode: 'number' }),
  blackMs: bigint('black_ms', { mode: 'number' }),
  lastMoveAt: ts('last_move_at'),
  eco: text('eco'),
  opening: text('opening'),
  createdAt: ts('created_at').notNull().defaultNow(),
  endedAt: ts('ended_at'),
}, (t) => [
  index('games_white_idx').on(t.whiteId, t.createdAt),
  index('games_black_idx').on(t.blackId, t.createdAt),
  index('games_status_idx').on(t.status),
]);

export const moves = pgTable('moves', {
  gameId: text('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),
  ply: integer('ply').notNull(),
  san: text('san').notNull(),
  uci: text('uci').notNull(),
  clockMs: bigint('clock_ms', { mode: 'number' }),
}, (t) => [primaryKey({ columns: [t.gameId, t.ply] })]);

/* ───────────── Social ───────────── */

export const follows = pgTable('follows', {
  followerId: integer('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followingId: integer('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.followerId, t.followingId] }), index('follows_following_idx').on(t.followingId)]);

/* ───────────── Puzzles ───────────── */

export const puzzles = pgTable('puzzles', {
  id: serial('id').primaryKey(),
  fen: text('fen').notNull(), // position before the opponent's lead-in move
  lead: text('lead').notNull(), // opponent move (UCI) that sets up the puzzle
  solution: text('solution').notNull(), // UCI moves, space separated, solver first
  themes: text('themes').array().notNull(),
  rating: integer('rating').notNull(),
  plays: integer('plays').notNull().default(0),
  solves: integer('solves').notNull().default(0),
}, (t) => [index('puzzles_rating_idx').on(t.rating), uniqueIndex('puzzles_fen_uq').on(t.fen, t.lead)]);

export const puzzleAttempts = pgTable('puzzle_attempts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  puzzleId: integer('puzzle_id').notNull().references(() => puzzles.id, { onDelete: 'cascade' }),
  solved: boolean('solved').notNull(),
  ratingAfter: integer('rating_after').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [index('puzzle_attempts_user_idx').on(t.userId, t.createdAt)]);

/* ───────────── Reserved for later phases (schema designed, not yet used by the app) ───────────── */

export const friendRequests = pgTable('friend_requests', {
  id: serial('id').primaryKey(),
  fromId: integer('from_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  toId: integer('to_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('pending'), // pending | accepted | declined
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('friend_requests_pair_uq').on(t.fromId, t.toId), index('friend_requests_to_idx').on(t.toId, t.status)]);

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  fromId: integer('from_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  toId: integer('to_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  readAt: ts('read_at'),
}, (t) => [index('messages_thread_idx').on(t.fromId, t.toId, t.createdAt), index('messages_inbox_idx').on(t.toId, t.readAt)]);

export const tournaments = pgTable('tournaments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  format: text('format').notNull(), // arena | swiss
  visibility: text('visibility').notNull().default('public'),
  initial: integer('initial').notNull(),
  increment: integer('increment').notNull().default(0),
  rounds: integer('rounds'),
  durationMinutes: integer('duration_minutes'),
  status: text('status').notNull().default('scheduled'), // scheduled | running | finished
  createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
  startsAt: ts('starts_at').notNull(),
  endedAt: ts('ended_at'),
}, (t) => [index('tournaments_status_idx').on(t.status, t.startsAt)]);

export const tournamentParticipants = pgTable('tournament_participants', {
  tournamentId: integer('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  score: integer('score').notNull().default(0), // stored ×2 so half points stay integral
  tiebreak: integer('tiebreak').notNull().default(0),
  joinedAt: ts('joined_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.tournamentId, t.userId] }), index('tp_standings_idx').on(t.tournamentId, t.score)]);

export const achievements = pgTable('achievements', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  earnedAt: ts('earned_at').notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.code] })]);

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts('created_at').notNull().defaultNow(),
  readAt: ts('read_at'),
}, (t) => [index('notifications_user_idx').on(t.userId, t.readAt, t.createdAt)]);

export const gameAnalysis = pgTable('game_analysis', {
  gameId: text('game_id').primaryKey().references(() => games.id, { onDelete: 'cascade' }),
  engine: text('engine').notNull(),
  depth: integer('depth').notNull(),
  evals: jsonb('evals').$type<number[]>().notNull(),
  whiteAccuracy: integer('white_accuracy'),
  blackAccuracy: integer('black_accuracy'),
  createdAt: ts('created_at').notNull().defaultNow(),
});
