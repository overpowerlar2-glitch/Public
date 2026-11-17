// Loads the engine-verified puzzle set (data/puzzles.json) into the database. Safe to re-run.
try { process.loadEnvFile(); } catch {}
import fs from 'node:fs';
import { db } from '../src/lib/db';
import { puzzles } from '../src/lib/db/schema';

type P = { fen: string; lead: string; solution: string[]; themes: string[]; rating: number };
async function main() {
  const rows = JSON.parse(fs.readFileSync('data/puzzles.json', 'utf8')) as P[];
  let n = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const res = await db.insert(puzzles).values(rows.slice(i, i + 100).map((p) => ({ ...p, solution: p.solution.join(' ') }))).onConflictDoNothing().returning({ id: puzzles.id });
    n += res.length;
  }
  console.log(`Puzzles: ${n} inserted, ${rows.length - n} already present.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
