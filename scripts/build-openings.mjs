// Builds public/data/openings.json from the lichess-org/chess-openings TSV files (CC0).
// Usage: node scripts/build-openings.mjs <dir-with-a..e.tsv>
import fs from 'node:fs';
import path from 'node:path';
import { Chess } from 'chess.js';
const dir = process.argv[2] || 'data/openings-src';
const out = [];
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const rows = fs.readFileSync(path.join(dir, f + '.tsv'), 'utf8').trim().split('\n').slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const chess = new Chess();
    chess.loadPgn(pgn);
    const epd = chess.fen().split(' ').slice(0, 4).join(' ');
    out.push([eco, name, chess.history().join(' '), epd]);
  }
}
fs.writeFileSync('public/data/openings.json', JSON.stringify(out));
console.log('openings:', out.length);
