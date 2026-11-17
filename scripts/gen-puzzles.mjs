// Generates verified puzzles by self-play + Stockfish analysis.
// Every puzzle's solution is engine-verified (unique winning move / forced mate).
// Usage: node scripts/gen-puzzles.mjs <outfile> <seconds>
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { Chess } from 'chess.js';
const require = createRequire(import.meta.url);
const enginePath = require('stockfish').findEngine('lite-single');
const outFile = process.argv[2] || 'data/puzzles.jsonl';
const deadline = Date.now() + 1000 * Number(process.argv[3] || 120);
const openings = JSON.parse(fs.readFileSync('public/data/openings.json', 'utf8'));

const eng = spawn(process.execPath, [enginePath], { stdio: 'pipe' });
let buf = '', onLine = () => {};
eng.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { onLine(buf.slice(0, i).trim()); buf = buf.slice(i + 1); } });
const send = (c) => eng.stdin.write(c + '\n');
function analyze(fen, depth, multipv = 2) {
  return new Promise((resolve) => {
    const lines = [];
    onLine = (l) => {
      if (l.startsWith('info') && l.includes(' pv ')) {
        const m = l.match(/multipv (\d+) score (cp|mate) (-?\d+)/);
        if (!m || / (upper|lower)bound/.test(l)) return;
        const pv = l.split(' pv ')[1].split(' ');
        const v = m[2] === 'cp' ? +m[3] : (+m[3] > 0 ? 100000 - +m[3] : -100000 - +m[3]);
        lines[+m[1] - 1] = { val: v, mate: m[2] === 'mate' ? +m[3] : null, pv };
      } else if (l.startsWith('bestmove')) resolve(lines.filter(Boolean));
    };
    send(`setoption name MultiPV value ${multipv}`);
    send(`position fen ${fen}`);
    send(`go depth ${depth}`);
  });
}
const rnd = (n) => Math.floor(Math.random() * n);
const uciOf = (m) => m.from + m.to + (m.promotion || '');
const play = (c, uci) => c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
const seen = new Set();

async function tryPuzzle(chess, last, prevFen, prevValForMover) {
  const fen = chess.fen();
  if (seen.has(fen)) return;
  const L = await analyze(fen, 18, 2);
  if (!L[0]) return;
  const [a, b] = L;
  let solution, themes = [], rating;
  const minor = chess.board().flat().filter((p) => p && !'kp'.includes(p.type)).length;
  if (a.mate && a.mate > 0 && a.mate <= 3) {
    if (b && b.mate && b.mate > 0) return; // more than one mating move
    solution = a.pv.slice(0, a.mate * 2 - 1);
    if (solution.length !== a.mate * 2 - 1) return;
    themes.push('mate', 'mateIn' + a.mate);
    rating = [0, 750, 1250, 1700][a.mate] + rnd(350);
  } else if (!a.mate && a.val >= 300 && b && a.val - b.val >= 300 && b.val <= 150 && prevValForMover <= 200) {
    if (last.captured && a.pv[0].slice(2, 4) === last.to) return; // plain recapture
    solution = [a.pv[0]];
    const c2 = new Chess(fen);
    if (!play(c2, a.pv[0]) || !a.pv[1] || !play(c2, a.pv[1])) return;
    if (!c2.isGameOver()) {
      const L2 = await analyze(c2.fen(), 16, 2);
      if (L2[0] && L2[1] && L2[0].val - L2[1].val >= 250 && L2[0].val >= 250) solution.push(a.pv[1], L2[0].pv[0]);
    }
    themes.push('tactics');
    rating = (solution.length > 1 ? 1500 : 1100) + rnd(400);
  } else return;
  if (minor <= 4) themes.push('endgame');
  // sanity: replay full solution
  const v = new Chess(fen);
  for (const u of solution) if (!play(v, u)) return;
  if (themes[0] === 'mate' && !v.isCheckmate()) return;
  seen.add(fen);
  fs.appendFileSync(outFile, JSON.stringify({ fen: prevFen, lead: uciOf(last), solution, themes, rating, moveNo: chess.moveNumber() }) + '\n');
}

async function game() {
  const chess = new Chess();
  const op = openings[rnd(openings.length)][2].split(' ');
  for (const s of op) chess.move(s);
  let prevVal = 0; // eval for the side that just moved, before its move
  while (!chess.isGameOver() && chess.history().length < 180 && Date.now() < deadline) {
    const fen = chess.fen();
    const L = await analyze(fen, 11, 2);
    if (!L[0]) break;
    const hist = chess.history({ verbose: true });
    const last = hist[hist.length - 1];
    const interesting = (L[0].mate && L[0].mate > 0 && L[0].mate <= 3) || (!L[0].mate && L[0].val >= 300 && L[1] && L[0].val - L[1].val >= 280);
    if (interesting && last) await tryPuzzle(chess, last, last.before, -prevVal);
    const r = Math.random();
    const legal = chess.moves({ verbose: true });
    let uci = L[0].pv[0];
    if (r < 0.14) uci = uciOf(legal[rnd(legal.length)]);
    else if (r < 0.34 && L[1]) uci = L[1].pv[0];
    prevVal = L[0].val;
    if (!play(chess, uci)) break;
  }
}
send('uci'); send('setoption name Hash value 32'); send('isready');
await new Promise((r) => { onLine = (l) => l === 'readyok' && r(); });
while (Date.now() < deadline) await game();
eng.kill(); process.exit(0);
