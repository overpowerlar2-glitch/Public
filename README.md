# Tabiya

A real-time chess platform: rated online play, Stockfish analysis, engine-verified puzzles and an opening explorer.

This is **phase 1** of the brief. Everything listed under "What works" is implemented end to end and covered by the test script. Everything under "Not built yet" is absent from the interface rather than mocked.

## Try it with Docker (easiest)

Needs only [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build
```

The first build takes several minutes (it also compiles native Stockfish; `STOCKFISH=0 docker compose up --build` skips that). Then:

- the site is at http://localhost:3000, open to everyone; visitors can play without an account
- confirmation emails are caught by Mailpit at http://localhost:8025; nothing is really sent
- `ALLOWED_EMAIL_DOMAINS=totersapp.com docker compose up` makes it private to that domain
- `docker compose down` stops it; add `-v` to also delete the database

The Docker files were checked for syntax, but the image build itself has not been run yet (the build environment could not reach Docker Hub).

## Run it without Docker

Requirements: Node.js 20.12+ and PostgreSQL 14+.

```bash
cp .env.example .env          # set DATABASE_URL
npm install                   # also copies the Stockfish WASM engine into public/engine
npm run db:migrate            # creates the schema
npm run db:seed               # loads the 246 puzzles
scripts/build-stockfish.sh    # optional: builds native Stockfish 19 into bin/ (strongest engine)
npm run dev                   # http://localhost:3000
```

Production: `npm run build && npm start`.

Private mode: start the server with `ALLOWED_EMAIL_DOMAINS` set and no `SMTP_URL`, then run `node scripts/e2e-private.mjs http://localhost:3000 <server log file> <domain>` (16 checks).

Check a running server: `node scripts/e2e.mjs http://localhost:3000` (34 checks with the native engine installed, 30 without: accounts, pairing, move validation, clocks, chat, draw/resign, disconnect/reconnect, time-outs, ratings, puzzles).

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `APP_URL` | recommended | Public base URL, used in password-reset links. Session cookies are marked `Secure` when it starts with `https://` |
| `PORT`, `HOST` | no | Listen address (default `0.0.0.0:3000`) |
| `STOCKFISH_PATH` | no | Path to a native Stockfish binary (default `bin/stockfish`). If the file is missing, browsers use the built-in WASM engine |
| `STOCKFISH_POOL` | no | Number of engine processes (default: CPU cores − 1, at most 4) |
| `STOCKFISH_THREADS`, `STOCKFISH_HASH_MB` | no | Threads and hash per process (default 1 thread, 64 MB) |
| `ALLOWED_EMAIL_DOMAINS` | no | Makes the site private, e.g. `totersapp.com` (comma-separate several). Only verified addresses at these exact domains can register and sign in; guests, pages, the API and real-time connections all require a session. Empty = open site |
| `SMTP_URL`, `MAIL_FROM` | no | SMTP for password-reset email. Without `SMTP_URL` the reset link is printed to the server log |

## What works

**Board** — custom component. Drag and drop, click to move, legal-move dots, selection / last-move / check highlights, promotion picker, castling and en passant (rules by chess.js), sliding animation, flip, 16 board themes (four with wood, marble or stone texture), 13 piece sets (four original), animation for every position change — slides that also cover takebacks and stepping through games, captures that shrink away with a burst, check pulse and king shudder, promotion pop-in, board flips that glide — with fast/normal/slow speeds, sampled sounds (move, capture, castle, promotion, check, game start/end, low time), fullscreen, blindfold mode, touch support. Right-click and drag draws planning arrows, right-click a square circles it (Shift/Ctrl red, Alt blue, Shift+Alt yellow); any left click clears them.

**Online play** (Socket.IO, server-authoritative)
- Quick pairing for all ten preset time controls, custom clocks, unlimited and correspondence (1–14 days per move)
- Private rooms with an invitation link; direct challenges to a username with a live notification
- Rated and casual games; Elo ratings per category (bullet, blitz, rapid, classical, correspondence)
- Server-side move validation and clocks, flag detection, draw on time-out against insufficient material
- Chat between the two players, resign, abort, draw offer / accept / decline
- Disconnect detection with a 60-second forfeit window, reconnection to the same seat, "game in progress" pill on every page
- Spectating and a live games page
- Active games are written to the database on every move and restored after a server restart
- Anonymous play, as on Lichess: visitors get a guest name and can quick-pair, invite by link, play the computer, solve puzzles and analyse without an account. Guest games are always casual; rated games need an account

**Engine** — two back ends behind one interface. If `bin/stockfish` exists, computer play, hints, analysis and game review run on native Stockfish 19 (full network) on the server through a process pool; each search is time-boxed to 10 seconds and each connection gets one search at a time. Otherwise, or if the server engine stops answering, the page uses Stockfish 19 lite (WASM) in the browser.

**Computer** — six levels, optional clock, takeback, hint, hand-off to analysis.

**Analysis** — live multi-line engine evaluation, eval bar, best-move arrow, variations tree, PGN and FEN import, PGN export, opening names, and a game review that labels inaccuracies, mistakes, blunders, best and brilliant moves with per-side accuracy and an evaluation graph.

**Puzzles** — rated training with theme filter, a daily puzzle, streak mode, hints, solution playback, explanations, per-theme statistics.

**Accounts** — register, sign in/out, password reset, profile editing (username, bio, country, picture), password change. Profiles with ratings, rating chart, win rate, recent games, favourite openings, derived achievements, follow/unfollow, online status. Player search.

**Leaderboards** — per category; all-time, monthly, weekly; global, by country, among players you follow.

**Openings** — 3,865 named lines with ECO codes, search, popular openings, and win/draw/loss counts computed from games played on your server.

**Settings** — theme, board, pieces, sounds and volume, animation, coordinates, legal-move dots, auto-queen.

## Not built yet

Tournaments (arena / Swiss), admin dashboard, direct messages, friend requests (friends are currently mutual follows), notifications inbox, lessons and learning path, board editor, Chess960, language selection, news, saved server-side analysis, rematch button, premoves.

The database schema already has tables for tournaments, messages, friend requests, notifications, achievements and stored analysis so those features can be added without reshaping existing data. They are marked as reserved in `src/lib/db/schema.ts` and nothing reads or writes them yet.

## Things to know

- **Drizzle instead of Prisma.** Same PostgreSQL schema, migrations in `drizzle/`. Prisma's engine binaries could not be downloaded in the build environment, so it could not be tested; Drizzle is pure JavaScript.
- **One Node process.** `server.ts` runs Next.js and the game server together, so it needs a host that keeps a process alive with WebSockets (a VM, Fly, Railway, Render). It will not run on serverless hosting such as Vercel as is.
- **Scaling out.** Live games, pairing queues, presence and rate limits are held in memory. Running more than one instance needs the Socket.IO Redis adapter and shared game state; that is not done.
- **Ratings are Elo**, not Glicko-2 (K = 40 for a player's first 30 games in a category, then 20).
- **Native engine cost.** Every server-side search uses a CPU core while it runs. The pool size caps this; extra requests queue. Not load-tested.
- **The native binary is not in the repository** (about 99 MB, CPU-specific). Build it on the host with `scripts/build-stockfish.sh [tag] [arch]`; the default arch is `native`.
- **Computer levels** are Stockfish skill levels with depth limits. The Elo labels are estimates, not measured.
- **Puzzles** were generated by engine self-play and verified at depth 18 (one mating move, or a best move at least three pawns better than any alternative). Their starting ratings are estimates by type. Generate more with `npm run puzzles:generate`, then merge into `data/puzzles.json` and re-seed.
- **Brilliant-move detection** is a heuristic: the engine's top move that also leaves a piece capturable.
- **Private mode needs real email.** Accounts are activated by a confirmation link. Without `SMTP_URL` the link is only printed to the server log, so in production set SMTP (for example your company's mail relay). Confirmation and password-reset emails were tested up to the generated link, not through a real mail server.
- **Private mode keeps outsiders off pages, the API and live games.** The page code itself (JavaScript bundles, the browser engine, piece images) is still downloadable, as on any site; it contains no data.
- **The single-file HTML edition has no accounts**, so it cannot be restricted; control who receives the file instead.
- **Not load-tested**, and there is no automated unit-test suite beyond `scripts/e2e.mjs`.

## Layout

```
server.ts               HTTP server: Next.js + Socket.IO
server/hub.ts           game server (pairing, rooms, clocks, persistence, ratings)
server/engine.ts        native Stockfish process pool
src/app                 pages and REST routes
standalone              browser-only edition (no server): `node standalone/build.mjs` → standalone/dist
src/components          board, game UI, shell, primitives
src/lib                 db schema, auth, engine wrapper, sounds, settings
scripts                 migrate, seed, puzzle generator, openings builder, e2e test
drizzle                 SQL migrations
data                    puzzle set, opening source files
```

## Third-party material

| Item | Licence |
| --- | --- |
| Stockfish 19 (official-stockfish/Stockfish), built unmodified by `scripts/build-stockfish.sh` and run as a separate process | GPL-3.0 |
| Stockfish.js 19 (nmrugg/stockfish.js), served as a separate worker file | GPL-3.0 — if you distribute it, keep it unmodified or publish your changes to it |
| Piece set "Chessnut" by Alexis Luengas | Apache-2.0 |
| Piece set "Fantasy" by Maurizio Monge | MIT |
| Piece set "Rhos" by RhosGFX | CC0 |
| Piece sets "Spatial" and "Celtic" by Maurizio Monge | MIT |
| Piece set "Firi" by James Faure | CC BY 4.0 |
| Piece set "Papercut" by Nikolay Anzarov | CC BY 4.0 |
| Piece set "Totoy" by Kosal Sen | CC BY 4.0 |
| Piece set "Kiwen Suwi" by neverRare | CC BY 4.0 |
| Piece sets "Tabiya", "Royal", "Glass", "Geo" | Original to this project, generated by `scripts/gen-pieces.mjs` |
| Opening names (lichess-org/chess-openings) | CC0 |
| Fonts: Geist, Geist Mono, Instrument Serif | SIL OFL 1.1 |
| Sound samples in `public/sounds` (supplied by the project owner from a GitHub sound set) | **Unverified** — confirm the source repository's licence before distributing |
