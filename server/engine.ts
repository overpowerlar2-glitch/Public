// Server-side analysis and computer play: a small pool of native Stockfish processes speaking UCI.
// If no binary is present the service reports itself unavailable and browsers fall back to WASM.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Socket } from 'socket.io';
import { Chess } from 'chess.js';

export type EngineLine = { multipv: number; depth: number; cp: number | null; mate: number | null; pv: string[] };
type Request = { id: number; fen: string; depth?: number; movetime?: number; multipv?: number; skill?: number };
type Job = { req: Request; socket: Socket; lines: EngineLine[]; done: (r: { bestmove: string | null; lines: EngineLine[]; stale?: boolean }) => void; cancelled: boolean; lastEmit: number };
type Proc = { child: ChildProcessWithoutNullStreams; job: Job | null; buf: string; options: Map<string, string> };

const MAX_MOVETIME = 10_000, MAX_DEPTH = 32, DEFAULT_MOVETIME = 6_000;

export function createEngineService() {
  const bin = process.env.STOCKFISH_PATH || path.join(process.cwd(), 'bin', 'stockfish');
  const available = fs.existsSync(bin);
  const size = Math.max(1, Number(process.env.STOCKFISH_POOL) || Math.min(4, Math.max(1, os.cpus().length - 1)));
  const threads = Math.max(1, Number(process.env.STOCKFISH_THREADS) || 1);
  const hash = Math.max(16, Number(process.env.STOCKFISH_HASH_MB) || 64);
  const procs: Proc[] = [];
  const queue: Job[] = [];
  const active = new Map<string, Job>(); // socket id → its current job (one search per connection)
  let name = 'Stockfish';

  function boot(): Proc {
    const child = spawn(bin, [], { stdio: 'pipe' });
    const p: Proc = { child, job: null, buf: '', options: new Map() };
    child.stdout.on('data', (d: Buffer) => {
      p.buf += d.toString();
      let i;
      while ((i = p.buf.indexOf('\n')) >= 0) { onLine(p, p.buf.slice(0, i).trim()); p.buf = p.buf.slice(i + 1); }
    });
    child.on('exit', () => {
      // A crashed engine fails its job cleanly and is replaced.
      const job = p.job; p.job = null;
      if (job) finish(job, null);
      const at = procs.indexOf(p);
      if (at >= 0) procs.splice(at, 1);
      if (!stopping) setTimeout(() => { if (procs.length < size) { procs.push(boot()); pump(); } }, 500);
    });
    child.on('error', (e) => console.error('[engine] process error:', e.message));
    child.stdin.write(`uci\nsetoption name Threads value ${threads}\nsetoption name Hash value ${hash}\nisready\n`);
    return p;
  }

  function onLine(p: Proc, line: string) {
    if (line.startsWith('id name ')) { name = line.slice(8); return; }
    const job = p.job;
    if (!job) return;
    if (line.startsWith('info') && line.includes(' pv ')) {
      if (/ (upper|lower)bound /.test(line)) return;
      const m = line.match(/depth (\d+) .*?multipv (\d+) score (cp|mate) (-?\d+)/);
      if (!m) return;
      job.lines[+m[2] - 1] = { multipv: +m[2], depth: +m[1], cp: m[3] === 'cp' ? +m[4] : null, mate: m[3] === 'mate' ? +m[4] : null, pv: line.split(' pv ')[1].trim().split(' ').slice(0, 12) };
      const now = Date.now();
      if (!job.cancelled && now - job.lastEmit > 120) { job.lastEmit = now; job.socket.emit('engine:info', { id: job.req.id, lines: job.lines.filter(Boolean) }); }
    } else if (line.startsWith('bestmove')) {
      p.job = null;
      const bm = line.split(' ')[1];
      finish(job, !bm || bm === '(none)' ? null : bm);
      pump();
    }
  }

  function finish(job: Job, bestmove: string | null) {
    if (active.get(job.socket.id) === job) active.delete(job.socket.id);
    job.done(job.cancelled ? { bestmove: null, lines: [], stale: true } : { bestmove, lines: job.lines.filter(Boolean) });
  }

  function pump() {
    for (const p of procs) {
      if (p.job) continue;
      const job = queue.shift();
      if (!job) return;
      if (job.cancelled) { finish(job, null); continue; }
      p.job = job;
      const set = (k: string, v: string | number) => { if (p.options.get(k) !== String(v)) { p.options.set(k, String(v)); p.child.stdin.write(`setoption name ${k} value ${v}\n`); } };
      const r = job.req;
      set('MultiPV', Math.min(5, Math.max(1, r.multipv ?? 1)));
      set('Skill Level', Math.min(20, Math.max(0, r.skill ?? 20)));
      const depth = r.depth ? `depth ${Math.min(MAX_DEPTH, Math.max(1, Math.floor(r.depth)))}` : '';
      // Every search is time-boxed so one client cannot hold an engine indefinitely.
      const movetime = `movetime ${Math.min(MAX_MOVETIME, Math.max(50, Math.floor(r.movetime ?? DEFAULT_MOVETIME)))}`;
      p.child.stdin.write(`position fen ${r.fen}\ngo ${depth} ${movetime}\n`);
    }
  }

  /** Cancels a connection's search. With `id`, only if that exact search is still the current one. */
  function cancel(socketId: string, id?: number) {
    const job = active.get(socketId);
    if (!job || (id !== undefined && job.req.id !== id)) return;
    job.cancelled = true;
    active.delete(socketId);
    const p = procs.find((x) => x.job === job);
    if (p) p.child.stdin.write('stop\n');
    else { const i = queue.indexOf(job); if (i >= 0) { queue.splice(i, 1); finish(job, null); } }
  }

  let stopping = false;
  if (available) {
    for (let i = 0; i < size; i++) procs.push(boot());
    console.log(`[engine] native Stockfish pool: ${size} process(es) × ${threads} thread(s) — ${bin}`);
  } else console.log(`[engine] no native Stockfish at ${bin}; browsers will use the built-in WASM engine (run scripts/build-stockfish.sh to enable it)`);

  return {
    available,
    attach(socket: Socket) {
      socket.on('engine:status', (...a: unknown[]) => { const ack = a[a.length - 1]; if (typeof ack === 'function') ack({ available, name }); });
      socket.on('engine:search', (req: Request, ack?: (r: unknown) => void) => {
        if (typeof ack !== 'function') return;
        if (!available) return ack({ error: 'Server engine is not available.' });
        if (!req || typeof req.fen !== 'string' || req.fen.length > 100 || !Number.isInteger(req.id)) return ack({ error: 'Invalid request.' });
        try { new Chess(req.fen); } catch { return ack({ error: 'Invalid position.' }); }
        if (queue.length > 200) return ack({ error: 'The engine is busy. Try again in a moment.' });
        cancel(socket.id); // a new search replaces this connection's previous one
        const job: Job = { req, socket, lines: [], done: ack, cancelled: false, lastEmit: 0 };
        active.set(socket.id, job);
        queue.push(job);
        pump();
      });
      socket.on('engine:stop', (m?: { id?: number }) => cancel(socket.id, typeof m?.id === 'number' ? m.id : undefined));
      socket.on('disconnect', () => cancel(socket.id));
    },
    stop() { stopping = true; for (const p of procs) p.child.kill(); },
  };
}
