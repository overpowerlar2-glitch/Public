import { Chess } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export type Step = { san: string; from: string; to: string; uci: string; fen: string };

/** Replays SAN moves from a starting position, returning the position after each move. Stops at the first illegal move. */
export function replay(sans: string[], startFen?: string): Step[] {
  const c = new Chess(startFen);
  const out: Step[] = [];
  for (const s of sans) {
    try {
      const m = c.move(s);
      out.push({ san: m.san, from: m.from, to: m.to, uci: m.from + m.to + (m.promotion ?? ''), fen: c.fen() });
    } catch { break; }
  }
  return out;
}

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const START_COUNT: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };

/** Pieces each side has captured (by type) plus the material balance from White's point of view. */
export function material(fen: string) {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 } as Record<string, number>, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } as Record<string, number> };
  for (const ch of fen.split(' ')[0]) {
    const t = ch.toLowerCase();
    if (t in VALUE) count[ch === t ? 'b' : 'w'][t]++;
  }
  const taken = (victim: 'w' | 'b') => (['q', 'r', 'b', 'n', 'p'] as const).flatMap((t) => Array(Math.max(0, START_COUNT[t] - count[victim][t])).fill(t) as string[]);
  const score = (c: 'w' | 'b') => Object.entries(count[c]).reduce((s, [t, n]) => s + VALUE[t] * n, 0);
  return { byWhite: taken('b'), byBlack: taken('w'), balance: score('w') - score('b') };
}

export function buildPgn(sans: string[], headers: Record<string, string | null | undefined>, startFen?: string): string {
  const h: Record<string, string> = { Event: 'Tabiya game', Site: 'Tabiya', Date: new Date().toISOString().slice(0, 10).replace(/-/g, '.'), White: 'White', Black: 'Black', Result: '*' };
  for (const [k, v] of Object.entries(headers)) if (v) h[k] = v;
  if (startFen && startFen !== START_FEN) { h.SetUp = '1'; h.FEN = startFen; }
  const startNo = startFen ? Number(startFen.split(' ')[5]) || 1 : 1;
  const blackFirst = startFen?.split(' ')[1] === 'b';
  let body = '';
  sans.forEach((s, i) => {
    const ply = i + (blackFirst ? 1 : 0);
    if (ply % 2 === 0) body += `${startNo + ply / 2}. `;
    else if (i === 0) body += `${startNo}... `;
    body += s + ' ';
  });
  return Object.entries(h).map(([k, v]) => `[${k} "${v.replace(/"/g, "'")}"]`).join('\n') + '\n\n' + (body + h.Result).trim() + '\n';
}

export const sideName = (c: 'w' | 'b') => (c === 'w' ? 'White' : 'Black');
