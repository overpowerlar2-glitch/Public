'use client';
// Thin UCI client around the Stockfish WASM worker (served from /public/engine).

export type EngineLine = { multipv: number; depth: number; cp: number | null; mate: number | null; pv: string[] };
export type SearchResult = { bestmove: string | null; lines: EngineLine[]; stale?: boolean };
type Job = { onInfo?: (lines: EngineLine[]) => void; resolve: (r: SearchResult) => void; lines: EngineLine[] };

export type SearchOptions = { depth?: number; movetime?: number; multipv?: number; skill?: number; onInfo?: (l: EngineLine[]) => void };
/** What the pages need from an engine, whether it runs in the browser (WASM) or on the server (native). */
export interface ChessEngine {
  readonly ready: Promise<void>;
  name: string;
  search(fen: string, opts: SearchOptions): Promise<SearchResult>;
  cancel(): void;
  stop(): void;
  newGame(): void;
  destroy(): void;
}

// Tried in order: the WASM build, then the plain-JavaScript (asm.js) build for viewers that block WebAssembly.
const ENGINE_URLS = ['/engine/stockfish-19-lite-single.js', '/engine/stockfish-19-asm.js'];
function engineUrl(i: number): string { return ENGINE_URLS[i]; }
const START_TIMEOUT_MS = 6000;

export class Engine implements ChessEngine {
  private worker: Worker | null = null;
  private job: Job | null = null;
  private idle: Promise<unknown> = Promise.resolve();
  private options = new Map<string, string>();
  private gen = 0;
  private dead = false;
  readonly ready: Promise<void>;
  name = 'Stockfish';

  constructor() {
    this.ready = this.boot(0);
    this.ready.catch(() => {}); // callers attach their own handlers; avoid an unhandled-rejection report
  }

  /** Starts build `i`; if it errors or stays silent, moves on to the next build instead of hanging forever. */
  private boot(i: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let w: Worker | null = null, settled = false;
      const fail = () => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        try { w?.terminate(); } catch { /* already gone */ }
        if (this.dead) return reject(new Error('Engine stopped.'));
        if (i + 1 < ENGINE_URLS.length) this.boot(i + 1).then(resolve, reject);
        else reject(new Error('The chess engine could not start here. If you opened this file in a preview panel, download it and open it directly in your browser.'));
      };
      const timer = setTimeout(fail, START_TIMEOUT_MS);
      try { w = new Worker(engineUrl(i)); } catch { return fail(); }
      w.onerror = fail;
      w.onmessage = (ev) => {
        const line = String(ev.data);
        if (line.startsWith('id name ')) this.name = line.slice(8).trim() + (i > 0 ? ' (compatibility mode)' : '');
        else if (line === 'uciok' && !settled) {
          settled = true; clearTimeout(timer);
          this.worker = w;
          w!.onmessage = (e) => this.onLine(String(e.data));
          resolve();
        }
      };
      w.postMessage('uci');
    });
  }

  private onLine(line: string) {
    const job = this.job;
    if (!job) return;
    if (line.startsWith('info') && line.includes(' pv ')) {
      if (/ (upper|lower)bound /.test(line)) return;
      const m = line.match(/depth (\d+) .*?multipv (\d+) score (cp|mate) (-?\d+)/);
      if (!m) return;
      const idx = +m[2] - 1;
      job.lines[idx] = { multipv: +m[2], depth: +m[1], cp: m[3] === 'cp' ? +m[4] : null, mate: m[3] === 'mate' ? +m[4] : null, pv: line.split(' pv ')[1].trim().split(' ') };
      job.onInfo?.(job.lines.filter(Boolean));
    } else if (line.startsWith('bestmove')) {
      const bm = line.split(' ')[1];
      this.job = null;
      job.resolve({ bestmove: !bm || bm === '(none)' ? null : bm, lines: job.lines.filter(Boolean) });
    }
  }

  private setOption(name: string, value: string | number) {
    const v = String(value);
    if (this.options.get(name) === v) return;
    this.options.set(name, v);
    this.worker?.postMessage(`setoption name ${name} value ${v}`);
  }

  /** Starts a search, cancelling any search already running. Scores are from the side to move's point of view. */
  search(fen: string, opts: SearchOptions): Promise<SearchResult> {
    this.stop();
    const my = ++this.gen;
    const run = this.idle.then(() => this.ready).then(() => new Promise<SearchResult>((resolve) => {
      // A newer search was requested while this one was queued: skip it.
      if (my !== this.gen) return resolve({ bestmove: null, lines: [], stale: true });
      this.job = { onInfo: opts.onInfo, resolve, lines: [] };
      this.setOption('MultiPV', opts.multipv ?? 1);
      this.setOption('Skill Level', opts.skill ?? 20);
      this.worker?.postMessage(`position fen ${fen}`);
      const limits = [opts.depth ? `depth ${opts.depth}` : '', opts.movetime ? `movetime ${opts.movetime}` : ''].filter(Boolean).join(' ');
      this.worker?.postMessage(`go ${limits || 'depth 18'}`);
    }));
    this.idle = run.catch(() => {});
    return run;
  }

  /** Cancels the running search and any queued one. */
  cancel() { this.gen++; this.stop(); }
  stop() { if (this.job) { this.job.onInfo = undefined; this.worker?.postMessage('stop'); } }
  newGame() { this.worker?.postMessage('ucinewgame'); }
  destroy() { this.dead = true; this.stop(); this.worker?.terminate(); }
}

/** Converts a centipawn score to a 0–100 win chance for the side the score is for (Lichess' model). */
export const winChance = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
export function lineToWhiteCp(l: Pick<EngineLine, 'cp' | 'mate'>, turn: 'w' | 'b'): number {
  const raw = l.mate != null ? (l.mate > 0 ? 10000 - l.mate * 10 : -10000 - l.mate * 10) : (l.cp ?? 0);
  return turn === 'w' ? raw : -raw;
}
export function formatEval(l: Pick<EngineLine, 'cp' | 'mate'>, turn: 'w' | 'b'): string {
  if (l.mate != null) { const m = turn === 'w' ? l.mate : -l.mate; return `${m < 0 ? '-' : ''}M${Math.abs(m)}`; }
  const cp = (turn === 'w' ? 1 : -1) * (l.cp ?? 0);
  return `${cp > 0 ? '+' : ''}${(cp / 100).toFixed(1)}`;
}
