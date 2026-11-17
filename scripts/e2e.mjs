// End-to-end check of auth + real-time play against a running server.
// Usage: node scripts/e2e.mjs [http://localhost:3000]
import { io } from 'socket.io-client';
const base = process.argv[2] || 'http://localhost:3000';
const tag = Date.now().toString(36).slice(-5);
let failed = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) failed++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function register(name) {
  const res = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: name, email: `${name}@example.com`, password: 'correct-horse-9' }) });
  if (res.status !== 201) throw new Error('register failed: ' + (await res.text()));
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}
function connect(cookie) {
  const s = io(base, { path: '/ws', transports: ['websocket'], extraHeaders: cookie ? { cookie } : {}, forceNew: true });
  s.state = null;
  s.on('game:state', (st) => { s.state = st; });
  return new Promise((r) => s.on('hello', (h) => { s.me = h; r(s); }));
}
const ack = (s, ev, p) => new Promise((r) => (p === undefined ? s.emit(ev, r) : s.emit(ev, p, r)));
const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await wait(40); } return false; };

const ca = await register(`alice_${tag}`), cb = await register(`bob_${tag}`);
const dup = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: `alice_${tag}`, email: 'x@example.com', password: 'correct-horse-9' }) });
check('duplicate username rejected', dup.status === 409);
const bad = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: `alice_${tag}`, password: 'wrong' }) });
check('wrong password rejected', bad.status === 401);

let a = await connect(ca), b = await connect(cb);
check('sockets identified from session cookie', a.me.name === `alice_${tag}` && !a.me.guest);

// 1. Rated matchmaking + checkmate + rating change
let matched = {};
a.on('seek:matched', (m) => (matched.a = m.id)); b.on('seek:matched', (m) => (matched.b = m.id));
const tc = { initial: 180, increment: 0, days: null };
await ack(a, 'seek', { tc, rated: true }); await ack(b, 'seek', { tc, rated: true });
check('two seekers are paired', await until(() => matched.a && matched.a === matched.b));
let id = matched.a;
const ja = await ack(a, 'game:join', { id }), jb = await ack(b, 'game:join', { id });
check('both seated with opposite colours', ja.you && jb.you && ja.you !== jb.you);
let W = ja.you === 'w' ? a : b, B = ja.you === 'w' ? b : a;
const illegal = await ack(W, 'game:move', { id, uci: 'e2e5' });
check('illegal move rejected by server', illegal.ok === false);
const outOfTurn = await ack(B, 'game:move', { id, uci: 'e7e5' });
check('out-of-turn move rejected', outOfTurn.ok === false);
for (const [s, u] of [[W, 'f2f3'], [B, 'e7e5'], [W, 'g2g4']]) await ack(s, 'game:move', { id, uci: u });
await wait(300);
check('clock is running for the side to move', a.state?.clock?.running === 'b' && a.state.clock.b < 180000 && a.state.clock.b > 170000, JSON.stringify(a.state?.clock));
await ack(B, 'game:move', { id, uci: 'd8h4' });
check('checkmate ends the game 0-1', await until(() => a.state?.status === 'finished' && a.state.result === '0-1' && a.state.reason === 'checkmate'));
check('ratings updated', a.state.ratingDiff && a.state.ratingDiff.b > 0 && a.state.ratingDiff.w < 0, JSON.stringify(a.state.ratingDiff));
const stored = await (await fetch(`${base}/api/games/${id}`)).json();
check('finished game stored with moves', stored.state?.moves?.join(' ') === 'f3 e5 g4 Qh4#', stored.state?.moves?.join(' '));

// 2. Private room by link, guest joins, chat, draw offer + accept
const g = await connect('tabiya_guest=guesttoken12345');
check('guest identity', g.me.guest === true);
const room = await ack(a, 'room:create', { tc: { initial: 300, increment: 3, days: null }, rated: false, color: 'w' });
id = room.id;
const w1 = await ack(a, 'game:join', { id });
check('creator waits in room', w1.state.status === 'waiting');
const gj = await ack(g, 'game:join', { id });
check('guest joins by link and game starts', gj.ok && gj.you === 'b' && gj.state.status === 'active');
let chatGot = null; g.on('game:chat', (m) => { if (!m.message.system) chatGot = m.message.text; });
a.emit('game:chat', { id, text: 'good luck' });
check('chat delivered to opponent', await until(() => chatGot === 'good luck'));
await ack(a, 'game:move', { id, uci: 'e2e4' }); await ack(g, 'game:move', { id, uci: 'e7e5' });
a.emit('game:draw', { id, action: 'offer' });
check('draw offer visible', await until(() => g.state?.drawOffer === 'w'));
g.emit('game:draw', { id, action: 'decline' });
check('draw offer declined', await until(() => g.state?.drawOffer === null));
a.emit('game:draw', { id, action: 'offer' }); await until(() => g.state?.drawOffer === 'w');
g.emit('game:draw', { id, action: 'accept' });
check('draw by agreement', await until(() => a.state?.status === 'finished' && a.state.result === '1/2-1/2'));

// 3. Disconnect detection, reconnect, spectator, resign
const room2 = await ack(a, 'room:create', { tc, rated: false, color: 'w' });
id = room2.id; await ack(a, 'game:join', { id }); await ack(b, 'game:join', { id });
await ack(a, 'game:move', { id, uci: 'd2d4' }); await ack(b, 'game:move', { id, uci: 'd7d5' });
const spec = await connect(''); const sj = await ack(spec, 'game:join', { id });
check('spectator can watch without a seat', sj.ok && sj.you === null);
b.disconnect();
check('opponent sees disconnect', await until(() => a.state?.black?.online === false));
b = await connect(cb); const rj = await ack(b, 'game:join', { id });
check('player reconnects to the same seat with moves intact', rj.you === 'b' && rj.state.moves.length === 2 && rj.state.status === 'active');
check('opponent sees reconnect', await until(() => a.state?.black?.online === true));
const mine = await ack(b, 'my:games');
check('active game listed for resume', mine.games.some((x) => x.id === id));
b.emit('game:resign', { id });
check('resignation ends the game 1-0', await until(() => a.state?.status === 'finished' && a.state.result === '1-0' && a.state.reason === 'resign'));

// 4. Flag fall
const room3 = await ack(a, 'room:create', { tc: { initial: 15, increment: 0, days: null }, rated: false, color: 'w' });
id = room3.id; await ack(a, 'game:join', { id }); await ack(b, 'game:join', { id });
await ack(a, 'game:move', { id, uci: 'e2e4' }); await ack(b, 'game:move', { id, uci: 'e7e5' });
console.log('  (waiting 15s for a flag to fall)');
check('time-out ends the game for the side that ran out', await until(() => a.state?.status === 'finished' && a.state.reason === 'timeout' && a.state.result === '0-1', 18000));

// Server-side Stockfish (skipped when the server has no native binary)
const es = await ack(a, 'engine:status');
if (es.available) {
  let infos = 0; a.on('engine:info', () => infos++);
  const r1 = await ack(a, 'engine:search', { id: 1, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', depth: 16, multipv: 3 });
  check(`server engine (${es.name}) searches the start position`, /^[a-h][1-8][a-h][1-8]/.test(r1.bestmove ?? '') && r1.lines.length === 3 && infos > 0, `${r1.bestmove} depth ${r1.lines[0]?.depth}`);
  const r2 = await ack(a, 'engine:search', { id: 2, fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', depth: 10 });
  check('server engine finds mate in one', r2.bestmove === 'a1a8' && r2.lines[0]?.mate === 1, JSON.stringify(r2.lines[0]));
  const slow = ack(a, 'engine:search', { id: 3, fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', movetime: 8000 });
  await wait(300);
  const r4 = await ack(a, 'engine:search', { id: 4, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', depth: 8 });
  check('a new search cancels the previous one', (await slow).stale === true && !!r4.bestmove);
  const bad = await ack(a, 'engine:search', { id: 5, fen: 'not a position', depth: 5 });
  check('invalid position rejected', !!bad.error);
} else console.log('  (server engine not installed — engine checks skipped)');

// 5. REST
const prof = await (await fetch(`${base}/api/users/bob_${tag}`)).json();
check('profile shows games and rating history', prof.recent?.length >= 2 && prof.history?.length >= 1, `recent=${prof.recent?.length} history=${prof.history?.length}`);
const lb = await (await fetch(`${base}/api/leaderboard?category=blitz`)).json();
check('leaderboard lists rated players', lb.players?.some((p) => p.username === `bob_${tag}`));
const pz = await (await fetch(`${base}/api/puzzles/next`)).json();
check('puzzle served', !!pz.puzzle?.solution?.length);
const at = await (await fetch(`${base}/api/puzzles/attempt`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: ca }, body: JSON.stringify({ id: pz.puzzle.id, solved: true }) })).json();
check('puzzle attempt rated', at.rated === true && at.diff > 0, JSON.stringify(at));
const op = await (await fetch(`${base}/api/openings/stats?moves=`)).json();
check('opening stats computed from stored games', op.moves?.length > 0, JSON.stringify(op.moves));
for (const s of [a, b, g, spec]) s.disconnect();
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
