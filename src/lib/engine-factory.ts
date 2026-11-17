'use client';
// Picks the engine: native Stockfish on the server when the server offers it, otherwise the WASM build in the browser.
import { Engine, type ChessEngine, type EngineLine, type SearchOptions, type SearchResult } from './engine';
import { emitAck, getSocket } from './socket';
import { tx } from './i18n';

let nextId = 1; // shared by every remote engine on this connection so result ids never collide
type Reply = { bestmove: string | null; lines: EngineLine[]; stale?: boolean; error?: string };

class RemoteEngine implements ChessEngine {
  readonly ready = Promise.resolve();
  private current = 0;
  private onInfo?: (l: EngineLine[]) => void;
  private handler = (m: { id: number; lines: EngineLine[] }) => { if (m.id === this.current) this.onInfo?.(m.lines); };
  constructor(public name: string) { getSocket().on('engine:info', this.handler); }

  search(fen: string, opts: SearchOptions): Promise<SearchResult & { failed?: boolean }> {
    const id = (this.current = nextId++);
    this.onInfo = opts.onInfo;
    const { depth, movetime, multipv, skill } = opts;
    return new Promise((resolve) => {
      getSocket().timeout(20_000).emit('engine:search', { id, fen, depth, movetime, multipv, skill }, (err: Error | null, r?: Reply) => {
        const superseded = id !== this.current;
        if (err || !r || r.error) return resolve({ bestmove: null, lines: [], stale: superseded, failed: !superseded });
        resolve({ bestmove: r.bestmove, lines: r.lines, stale: r.stale || superseded });
      });
    });
  }
  // Stop only this engine's own search: another engine on the same connection may have started one since.
  cancel() { const id = this.current; this.current = 0; this.onInfo = undefined; if (id) getSocket().emit('engine:stop', { id }); }
  stop() { if (this.current) getSocket().emit('engine:stop', { id: this.current }); }
  newGame() {}
  destroy() { this.cancel(); getSocket().off('engine:info', this.handler); }
}

/** Asks the server once whether it has an engine, then delegates. Falls back to WASM if the server engine ever fails. */
class HybridEngine implements ChessEngine {
  name = 'Stockfish';
  readonly ready: Promise<void>;
  private impl: ChessEngine | null = null;
  private remote = false;
  private gen = 0;
  private dead = false;

  constructor() {
    this.ready = emitAck<{ available: boolean; name: string }>('engine:status', undefined, 2500)
      .then((s) => { if (!s.available) throw new Error('no server engine'); this.impl = new RemoteEngine(`${s.name} · ${tx('server')}`); this.remote = true; })
      .catch(() => this.useLocal())
      .then(() => { this.name = this.impl!.name; });
  }
  private useLocal() {
    this.impl?.destroy();
    const local = new Engine();
    this.impl = local; this.remote = false;
    return local.ready.then(() => { this.name = local.name; });
  }

  async search(fen: string, opts: SearchOptions): Promise<SearchResult> {
    const my = ++this.gen;
    await this.ready;
    if (my !== this.gen || this.dead) return { bestmove: null, lines: [], stale: true };
    const r = (await this.impl!.search(fen, opts)) as SearchResult & { failed?: boolean };
    if (!r.failed || !this.remote) return r;
    // The server engine stopped answering: switch this page to the browser engine and redo the search.
    await this.useLocal();
    if (my !== this.gen || this.dead) return { bestmove: null, lines: [], stale: true };
    return this.impl!.search(fen, opts);
  }
  cancel() { this.gen++; this.impl?.cancel(); }
  stop() { this.impl?.stop(); }
  newGame() { this.impl?.newGame(); }
  destroy() { this.dead = true; this.gen++; this.ready.then(() => this.impl?.destroy()).catch(() => {}); }
}

export const createEngine = (): ChessEngine => new HybridEngine();
