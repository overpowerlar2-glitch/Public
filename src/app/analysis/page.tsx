'use client';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWRImmutable from 'swr/immutable';
import { Chess, type Square } from 'chess.js';
import { ClipboardCopy, Cpu, Download, FileUp, Maximize2, Minimize2, Sparkles, Trash2 } from 'lucide-react';
import { Board, type Arrow, type BoardMove } from '@/components/board';
import { EvalBar, GLYPH, NavButtons } from '@/components/game-ui';
import { Button, Card, cx, ErrorNote, Modal, PageHeader, Toggle, toast } from '@/components/ui';
import { api } from '@/lib/client';
import { type ChessEngine, formatEval, lineToWhiteCp, winChance, type EngineLine } from '@/lib/engine';
import { ANALYSIS_HANDOFF, useEngine, useFullscreen } from '@/lib/hooks';
import { createEngine } from '@/lib/engine-factory';
import { buildPgn, START_FEN } from '@/lib/chess/util';
import { playMove } from '@/lib/sound';
import type { Color, GameState } from '@/lib/types';

type Node = { id: number; parent: Node | null; children: Node[]; san: string; from: string; to: string; uci: string; fen: string; ply: number; glyph?: string; cp?: number; best?: string };
type Review = { accuracy: { w: number; b: number }; counts: Record<Color, Record<string, number>> };
let nextId = 1;
const mkRoot = (fen: string): Node => ({ id: nextId++, parent: null, children: [], san: '', from: '', to: '', uci: '', fen, ply: fen.split(' ')[1] === 'b' ? 1 : 0 });
const epd = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 99 };

function addMove(parent: Node, mv: BoardMove | string): Node | null {
  const c = new Chess(parent.fen);
  let m;
  try { m = c.move(mv); } catch { return null; }
  const existing = parent.children.find((ch) => ch.san === m.san);
  if (existing) return existing;
  const n: Node = { id: nextId++, parent, children: [], san: m.san, from: m.from, to: m.to, uci: m.from + m.to + (m.promotion ?? ''), fen: c.fen(), ply: parent.ply + 1 };
  parent.children.push(n);
  return n;
}
function mainline(root: Node): Node[] { const out = [root]; let n = root; while (n.children[0]) { n = n.children[0]; out.push(n); } return out; }
function pathTo(n: Node): Node[] { const out: Node[] = []; for (let x: Node | null = n; x; x = x.parent) out.unshift(x); return out; }

/** A sound sacrifice: the best move leaves a piece where a cheaper (or any, if undefended) enemy piece can take it. */
function isSacrifice(parent: Node, node: Node): boolean {
  const before = new Chess(parent.fen), after = new Chess(node.fen);
  const moved = after.get(node.to as Square);
  if (!moved || VAL[moved.type] < 3 || moved.type === 'k') return false;
  const captured = before.get(node.to as Square);
  if (captured && VAL[captured.type] >= VAL[moved.type]) return false;
  const enemy: Color = moved.color === 'w' ? 'b' : 'w';
  const attackers = after.attackers(node.to as Square, enemy);
  if (!attackers.length) return false;
  const cheapest = Math.min(...attackers.map((s) => VAL[after.get(s)!.type]));
  const defended = after.attackers(node.to as Square, moved.color).length > 0;
  return cheapest < VAL[moved.type] - (captured ? VAL[captured.type] : 0) || (!defended && !captured);
}

function TreeView({ root, cursor, onSelect }: { root: Node; cursor: Node; onSelect: (n: Node) => void }) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => { active.current?.scrollIntoView({ block: 'nearest' }); }, [cursor]);
  const moveBtn = (n: Node, forceNo: boolean) => {
    const g = n.glyph ? GLYPH[n.glyph] : null;
    const white = n.ply % 2 === 1;
    return (
      <span key={n.id} className="inline-flex items-baseline">
        {(white || forceNo) && <span className="tnum mr-0.5 font-mono text-xs text-mute">{Math.ceil(n.ply / 2)}{white ? '.' : '…'}</span>}
        <button ref={n === cursor ? active : undefined} onClick={() => onSelect(n)} aria-current={n === cursor}
          className={cx('rounded px-1.5 py-0.5 font-mono text-[13px]', n === cursor ? 'bg-accent/25 font-semibold' : 'hover:bg-raised')}>
          {n.san}{g && <span className={cx('ml-0.5 font-sans text-xs font-bold', g.cls)} title={g.label}>{g.sym}</span>}
        </button>
      </span>
    );
  };
  const line = (start: Node, first: boolean): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    let n: Node | undefined = start, force = first;
    while (n) {
      out.push(moveBtn(n, force));
      force = false;
      const sibs: Node[] = n.parent ? n.parent.children.filter((c) => c !== n && n!.parent!.children[0] === n) : [];
      for (const s of sibs) { out.push(<span key={`v${s.id}`} className="mx-1 text-mute">({line(s, true)})</span>); force = true; }
      n = n.children[0];
    }
    return out;
  };
  if (!root.children.length) return <p className="p-6 text-center text-sm text-mute">Make a move on the board, or import a PGN to begin.</p>;
  return <div className="flex flex-wrap items-baseline gap-x-0.5 gap-y-1 p-3 leading-relaxed">{line(root.children[0], false)}</div>;
}

function EvalGraph({ nodes, cursor, onSelect }: { nodes: Node[]; cursor: Node; onSelect: (n: Node) => void }) {
  const pts = nodes.filter((n) => n.cp !== undefined);
  if (pts.length < 3) return null;
  const W = 300, H = 56;
  const x = (i: number) => (i / (nodes.length - 1)) * W;
  const y = (n: Node) => H - (winChance(n.cp!) / 100) * H;
  let started = false;
  const d = nodes.map((n, i) => { if (n.cp === undefined) return ''; const cmd = started ? 'L' : 'M'; started = true; return `${cmd}${x(i).toFixed(1)},${y(n).toFixed(1)}`; }).join(' ');
  const ci = nodes.indexOf(cursor);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-14 w-full cursor-pointer rounded-md bg-[#2a2a2c]" preserveAspectRatio="none" role="img" aria-label="Evaluation over the game"
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSelect(nodes[Math.round(((e.clientX - r.left) / r.width) * (nodes.length - 1))]); }}>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill="#f1efe9" />
      <line x1="0" x2={W} y1={H / 2} y2={H / 2} stroke="var(--mute)" strokeWidth="0.5" strokeDasharray="3 3" />
      {nodes.map((n, i) => n.glyph && ['blunder', 'mistake', 'brilliant'].includes(n.glyph) ? <circle key={n.id} cx={x(i)} cy={y(n)} r="2.6" fill={n.glyph === 'blunder' ? 'var(--bad)' : n.glyph === 'brilliant' ? 'var(--info)' : '#e08a3c'} /> : null)}
      {ci >= 0 && <line x1={x(ci)} x2={x(ci)} y1="0" y2={H} stroke="var(--accent)" strokeWidth="1.5" />}
    </svg>
  );
}

function Analysis() {
  const params = useSearchParams();
  const rootRef = useRef<Node>(mkRoot(START_FEN));
  const [cursor, setCursor] = useState<Node>(rootRef.current);
  const [, bump] = useState(0);
  const [orientation, setOrientation] = useState<Color>('w');
  const [engineOn, setEngineOn] = useState(true);
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [pgnText, setPgnText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const { get: engine, error: engineError } = useEngine();
  const reviewEngine = useRef<ChessEngine | null>(null);
  const [engineName, setEngineName] = useState('Stockfish');
  const wrap = useRef<HTMLDivElement>(null);
  const fs = useFullscreen(wrap);
  const { data: book } = useSWRImmutable<[string, string, string, string][]>('/data/openings.json', api);
  const bookMap = useMemo(() => new Map((book ?? []).map((o) => [o[3], `${o[0]} ${o[1]}`])), [book]);

  const load = useCallback((pgn: string, hdr?: Record<string, string>) => {
    const c = new Chess();
    try { c.loadPgn(pgn.trim()); } catch { throw new Error('That PGN could not be read. Check it is a single, complete game.'); }
    const h = c.getHeaders() as Record<string, string>;
    const root = mkRoot(h.FEN || START_FEN);
    let n = root;
    for (const san of c.history()) { const next = addMove(n, san); if (!next) break; n = next; }
    rootRef.current = root; setHeaders({ ...h, ...hdr }); setReview(null); setCursor(root.children.length ? mainline(root).pop()! : root);
  }, []);
  const loadFen = useCallback((fen: string) => {
    try { new Chess(fen); } catch { throw new Error('That FEN is not a legal position.'); }
    rootRef.current = mkRoot(fen); setHeaders({}); setReview(null); setCursor(rootRef.current);
  }, []);

  // Initial content: a stored game (?game=), a hand-off from another page (?import=1) or a position (?fen=).
  useEffect(() => {
    const gameId = params.get('game'), fen = params.get('fen');
    try {
      if (params.get('import')) { const pgn = sessionStorage.getItem(ANALYSIS_HANDOFF); if (pgn) load(pgn); }
      else if (fen) loadFen(fen);
    } catch (e) { toast.error((e as Error).message); }
    if (gameId) api<{ state: GameState }>(`/api/games/${gameId}`).then(({ state: g }) => {
      load(g.moves.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(' ') || '*', { White: g.white?.name ?? 'White', Black: g.black?.name ?? 'Black', Result: g.result ?? '*', ...(g.white?.rating ? { WhiteElo: String(g.white.rating) } : {}), ...(g.black?.rating ? { BlackElo: String(g.black.rating) } : {}) });
    }).catch((e: Error) => toast.error(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chess = useMemo(() => new Chess(cursor.fen), [cursor]);
  const turn = chess.turn();
  const gameOver = chess.isGameOver();

  // Live engine analysis of the current position.
  useEffect(() => {
    setLines([]);
    const e = engineOn && progress === null ? engine() : null;
    if (!e || gameOver) { engine()?.cancel(); return; }
    let live = true;
    e.ready.then(() => live && setEngineName(e.name)).catch(() => {});
    e.search(cursor.fen, { depth: 22, multipv: 3, onInfo: (l) => live && setLines([...l]) }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, engineOn, progress === null]);

  const move = (mv: BoardMove | string) => {
    const n = addMove(cursor, mv);
    if (n) { playMove(n.san); setCursor(n); bump((v) => v + 1); }
  };
  const undo = () => {
    if (!cursor.parent) return;
    const p = cursor.parent;
    p.children = p.children.filter((c) => c !== cursor);
    setCursor(p); bump((v) => v + 1);
  };

  const full = useMemo(() => { const path = pathTo(cursor); let n = cursor; while (n.children[0]) { n = n.children[0]; path.push(n); } return path; }, [cursor]); // eslint-disable-line react-hooks/exhaustive-deps
  const idx = full.indexOf(cursor);
  const opening = useMemo(() => { for (let n: Node | null = cursor; n; n = n.parent) { const o = bookMap.get(epd(n.fen)); if (o) return o; } return null; }, [cursor, bookMap]);

  async function runReview() {
    const nodes = mainline(rootRef.current);
    if (nodes.length < 2) return toast.info('Add some moves first — there is nothing to review yet.');
    let e: ChessEngine;
    try { e = reviewEngine.current ??= createEngine(); await e.ready; } catch { return toast.error('The engine could not be started.'); }
    setProgress(0); setReview(null);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i], c = new Chess(n.fen), t = c.turn();
      if (c.isCheckmate()) n.cp = t === 'w' ? -10000 : 10000;
      else if (c.isGameOver()) n.cp = 0;
      else { let r = await e.search(n.fen, { depth: 13 }); if (!r.lines[0]) r = await e.search(n.fen, { depth: 13 }); /* one retry if the search was interrupted */ if (r.lines[0]) { n.cp = lineToWhiteCp(r.lines[0], t); n.best = r.bestmove ?? undefined; } }
      setProgress((i + 1) / nodes.length);
    }
    const counts: Review['counts'] = { w: {}, b: {} };
    const acc: Record<Color, number[]> = { w: [], b: [] };
    for (let i = 1; i < nodes.length; i++) {
      const p = nodes[i - 1], n = nodes[i];
      if (p.cp === undefined || n.cp === undefined) continue;
      const mover: Color = n.ply % 2 === 1 ? 'w' : 'b', sign = mover === 'w' ? 1 : -1;
      const before = winChance(sign * p.cp), after = winChance(sign * n.cp), loss = Math.max(0, before - after);
      acc[mover].push(Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669)));
      n.glyph = loss >= 30 ? 'blunder' : loss >= 20 ? 'mistake' : loss >= 10 ? 'inaccuracy'
        : n.uci === p.best ? (isSacrifice(p, n) && after >= 45 && before <= 92 ? 'brilliant' : 'best') : undefined;
      if (n.glyph) counts[mover][n.glyph] = (counts[mover][n.glyph] ?? 0) + 1;
    }
    const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0);
    setReview({ accuracy: { w: avg(acc.w), b: avg(acc.b) }, counts });
    setProgress(null);
  }
  useEffect(() => () => reviewEngine.current?.destroy(), []);

  const pgn = () => buildPgn(full.slice(1).map((n) => n.san), { ...headers, ...(opening ? { ECO: opening.slice(0, 3), Opening: opening.slice(4) } : {}) }, rootRef.current.fen);
  const copyText = async (t: string, what: string) => { try { await navigator.clipboard.writeText(t); toast.success(`${what} copied to the clipboard.`); } catch { toast.error('Copy failed. Your browser blocked clipboard access.'); } };
  const download = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([pgn()], { type: 'application/x-chess-pgn' })); a.download = 'tabiya-analysis.pgn'; a.click(); URL.revokeObjectURL(a.href); };

  const top = lines[0];
  const evalWhite = gameOver ? (chess.isCheckmate() ? (turn === 'w' ? 0 : 100) : 50) : top ? winChance(lineToWhiteCp(top, turn)) : cursor.cp !== undefined ? winChance(cursor.cp) : 50;
  const evalLabel = gameOver ? (chess.isCheckmate() ? '#' : '½') : top ? formatEval(top, turn) : cursor.cp !== undefined ? `${cursor.cp > 0 ? '+' : ''}${(cursor.cp / 100).toFixed(1)}` : '0.0';
  const arrows: Arrow[] = engineOn && top?.pv[0] ? [{ from: top.pv[0].slice(0, 2), to: top.pv[0].slice(2, 4) }] : [];
  const pvSan = (l: EngineLine) => { const c = new Chess(cursor.fen); const out: string[] = []; for (const u of l.pv.slice(0, 9)) { try { out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san); } catch { break; } } return out; };
  const main = mainline(rootRef.current);
  const g = cursor.glyph ? GLYPH[cursor.glyph] : null;

  return (
    <div ref={wrap} className={cx(fs.active && 'h-full overflow-auto bg-bg p-6')}>
      {!fs.active && <PageHeader title="Analysis" sub={headers.White && headers.Black ? `${headers.White}${headers.WhiteElo ? ` (${headers.WhiteElo})` : ''} vs ${headers.Black}${headers.BlackElo ? ` (${headers.BlackElo})` : ''}${headers.Result && headers.Result !== '*' ? ` · ${headers.Result}` : ''}` : 'Explore any position with Stockfish, review your games and keep variations side by side.'} />}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="mx-auto flex w-full gap-2" style={{ maxWidth: 'min(100%, calc(100dvh - 11rem))' }}>
          <EvalBar white={evalWhite} label={evalLabel} orientation={orientation} />
          <div className="min-w-0 flex-1"><Board fen={cursor.fen} orientation={orientation} movable="both" onMove={move} lastMove={cursor.parent ? [cursor.from, cursor.to] : null} arrows={arrows} /></div>
        </div>

        <div className="space-y-3">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <Cpu className="size-4 text-mute" />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{engineName}</p><p className="text-xs text-mute">{engineOn ? (gameOver ? 'Game over' : top ? `Depth ${top.depth}` : 'Starting…') : 'Engine off'}</p></div>
              <span className="tnum font-mono text-xl font-semibold">{engineOn || cursor.cp !== undefined ? evalLabel : '–'}</span>
              <Toggle checked={engineOn} onChange={setEngineOn} label="Engine analysis" />
            </div>
            <ErrorNote>{engineError}</ErrorNote>
            {engineOn && !gameOver && (
              <div className="min-h-[5.25rem] divide-y divide-line/60">
                {lines.map((l) => { const sans = pvSan(l); return (
                  <button key={l.multipv} onClick={() => l.pv[0] && move({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), promotion: l.pv[0][4] })} className="flex w-full items-baseline gap-3 px-4 py-1.5 text-left hover:bg-raised" title="Play this move">
                    <span className={cx('tnum w-12 shrink-0 rounded px-1 text-center font-mono text-xs font-semibold', lineToWhiteCp(l, turn) >= 0 ? 'bg-[#f1efe9] text-[#222]' : 'bg-[#2a2a2c] text-[#eee]')}>{formatEval(l, turn)}</span>
                    <span className="truncate font-mono text-[13px]"><span className="font-semibold">{sans[0]}</span> <span className="text-mute">{sans.slice(1).join(' ')}</span></span>
                  </button>
                ); })}
              </div>
            )}
            {(opening || g) && <p className="border-t border-line px-4 py-2 text-xs text-mute">{g && <span className={cx('mr-2 font-semibold', g.cls)}>{g.sym} {g.label}{cursor.parent?.best && cursor.glyph !== 'best' && cursor.glyph !== 'brilliant' ? ` — best was ${(() => { try { return new Chess(cursor.parent!.fen).move({ from: cursor.parent!.best!.slice(0, 2), to: cursor.parent!.best!.slice(2, 4), promotion: cursor.parent!.best![4] }).san; } catch { return '?'; } })()}` : ''}</span>}{opening}</p>}
          </Card>

          <Card className="overflow-hidden">
            <div className="max-h-64 min-h-28 overflow-y-auto"><TreeView root={rootRef.current} cursor={cursor} onSelect={setCursor} /></div>
            <NavButtons ply={idx} max={full.length - 1} onSelect={(i) => setCursor(full[Math.max(0, Math.min(full.length - 1, i))])} onFlip={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} />
            <div className="grid grid-cols-4 gap-1 border-t border-line p-1.5">
              <Button size="sm" variant="ghost" onClick={undo} disabled={!cursor.parent} title="Delete this move and everything after it"><Trash2 className="size-4" /> Undo</Button>
              <Button size="sm" variant="ghost" onClick={() => { setImportError(null); setImportOpen(true); }}><FileUp className="size-4" /> Import</Button>
              <Button size="sm" variant="ghost" onClick={download} disabled={full.length < 2}><Download className="size-4" /> PGN</Button>
              <Button size="sm" variant="ghost" onClick={fs.toggle}>{fs.active ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />} Full</Button>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div><p className="font-semibold">Game review</p><p className="text-xs text-mute">Stockfish checks every move of the main line.</p></div>
              <Button variant="primary" size="sm" onClick={runReview} loading={progress !== null} disabled={main.length < 2}><Sparkles className="size-4" /> {review ? 'Re-run' : 'Review'}</Button>
            </div>
            {progress !== null && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} /></div>}
            {review && (
              <div className="mt-4 space-y-3">
                <EvalGraph nodes={main} cursor={cursor} onSelect={setCursor} />
                <table className="w-full text-sm">
                  <thead><tr className="text-xs text-mute"><th className="py-1 text-left font-medium">{headers.White ?? 'White'}</th><th /><th className="py-1 text-right font-medium">{headers.Black ?? 'Black'}</th></tr></thead>
                  <tbody>
                    <tr className="border-t border-line"><td className="tnum py-1.5 font-mono text-lg font-semibold">{review.accuracy.w}%</td><td className="text-center text-mute">Accuracy</td><td className="tnum text-right font-mono text-lg font-semibold">{review.accuracy.b}%</td></tr>
                    {(['brilliant', 'best', 'inaccuracy', 'mistake', 'blunder'] as const).map((k) => (
                      <tr key={k} className="border-t border-line/60"><td className="tnum py-1 font-mono">{review.counts.w[k] ?? 0}</td><td className={cx('text-center', GLYPH[k].cls)}>{GLYPH[k].sym} {GLYPH[k].label}</td><td className="tnum text-right font-mono">{review.counts.b[k] ?? 0}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => copyText(cursor.fen, 'FEN')}><ClipboardCopy className="size-4" /> Copy FEN</Button>
            <Button size="sm" variant="ghost" onClick={() => copyText(pgn(), 'PGN')} disabled={full.length < 2}><ClipboardCopy className="size-4" /> Copy PGN</Button>
          </div>
        </div>
      </div>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Import a game or position" wide>
        <p className="mb-2 text-sm text-mute">Paste a PGN, or a FEN to set up a position.</p>
        <textarea value={pgnText} onChange={(e) => setPgnText(e.target.value)} rows={9} spellCheck={false} placeholder={'[Event "…"]\n\n1. e4 e5 2. Nf3 Nc6 …'} aria-label="PGN or FEN" className="w-full rounded-lg border border-line bg-bg p-3 font-mono text-xs focus:border-accent focus:outline-none" />
        <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-sm text-accent hover:underline"><FileUp className="size-4" /> Choose a .pgn file
          <input type="file" accept=".pgn,text/plain" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPgnText(await f.text()); }} />
        </label>
        <div className="mt-3"><ErrorNote>{importError}</ErrorNote></div>
        <Button variant="primary" className="mt-4 w-full" disabled={!pgnText.trim()} onClick={() => {
          const t = pgnText.trim();
          try { if (/^[rnbqkpRNBQKP1-8/]+ [wb] /.test(t) && !t.includes('\n')) loadFen(t); else load(t); setImportOpen(false); setPgnText(''); }
          catch (e) { setImportError((e as Error).message); }
        }}>Load</Button>
      </Modal>
    </div>
  );
}

export default function AnalysisPage() { return <Suspense><Analysis /></Suspense>; }
