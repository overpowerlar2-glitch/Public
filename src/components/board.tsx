'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Square } from 'chess.js';
import { ANIM_MS, useSettings } from '@/lib/store';
import type { Color } from '@/lib/types';

export type BoardMove = { from: string; to: string; promotion?: string };
export type Arrow = { from: string; to: string; color?: string };

// Right-click drawings: plain = green, Shift/Ctrl = red, Alt = blue, Shift+Alt = yellow (the usual convention).
const DRAW = { green: '#15781b', red: '#b3261e', blue: '#1f5fbf', yellow: '#e09100' };
const drawColor = (e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }) => ((e.shiftKey || e.ctrlKey) && e.altKey ? DRAW.yellow : e.shiftKey || e.ctrlKey ? DRAW.red : e.altKey || e.metaKey ? DRAW.blue : DRAW.green);

type Props = {
  fen: string;
  orientation?: Color;
  /** Which side the user may move. Only the side to move can ever move. */
  movable?: Color | 'both' | null;
  onMove?: (m: BoardMove) => void;
  lastMove?: [string, string] | null;
  arrows?: Arrow[];
  hint?: string | null;
  wrong?: string | null;
  blindfold?: boolean;
  /** Suppress coordinates/interaction chrome for thumbnails. */
  mini?: boolean;
  label?: string;
};

const FILES = 'abcdefgh';

export function Board({ fen, orientation = 'w', movable = null, onMove, lastMove, arrows, hint, wrong, blindfold, mini, label }: Props) {
  const { pieces: set, coords, legalDots, autoQueen, animation: animOn, animSpeed } = useSettings();
  const animation = animOn && !blindfold;
  const animMs = ANIM_MS[animSpeed] ?? ANIM_MS.normal;
  const ref = useRef<HTMLDivElement>(null);
  const chess = useMemo(() => { try { return new Chess(fen); } catch { return new Chess(); } }, [fen]);
  const turn = chess.turn();
  const canMove = !!onMove && (movable === 'both' || movable === turn) && !chess.isGameOver();

  const [selected, setSelected] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  // Arrows and circles the player draws with the right mouse button to plan moves. from === to is a circle.
  const [shapes, setShapes] = useState<Required<Arrow>[]>([]);
  const [drawing, setDrawing] = useState<Required<Arrow> | null>(null);
  const drag = useRef<{ from: string; el: HTMLElement; moved: boolean; wasSelected: boolean; x: number; y: number } | null>(null);
  const skipAnim = useRef<string | null>(null); // move (from+to) that was dragged: it should not slide

  useEffect(() => { setSelected(null); setPromo(null); }, [fen]);

  // view coordinates (0..7 from the top-left corner as displayed)
  const xy = useCallback((sq: string) => {
    const f = FILES.indexOf(sq[0]), r = +sq[1] - 1;
    return orientation === 'w' ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
  }, [orientation]);
  const squareAt = useCallback((cx: number, cy: number): string | null => {
    const b = ref.current?.getBoundingClientRect();
    if (!b) return null;
    const x = Math.floor(((cx - b.left) / b.width) * 8), y = Math.floor(((cy - b.top) / b.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return orientation === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1);
  }, [orientation]);

  const dests = useMemo(() => {
    if (!selected || !canMove) return new Map<string, boolean>();
    const m = new Map<string, boolean>();
    for (const mv of chess.moves({ square: selected as Square, verbose: true })) m.set(mv.to, !!mv.captured);
    return m;
  }, [selected, chess, canMove]);

  const commit = useCallback((from: string, to: string, dragged: boolean) => {
    const piece = chess.get(from as Square);
    const isPromo = piece?.type === 'p' && (to[1] === '8' || to[1] === '1');
    skipAnim.current = dragged ? from + to : null;
    setSelected(null);
    if (isPromo && !autoQueen) return setPromo({ from, to });
    onMove?.({ from, to, promotion: isPromo ? 'q' : undefined });
  }, [chess, onMove, autoQueen]);

  const pieceEl = (sq: string) => ref.current?.querySelector<HTMLElement>(`[data-sq="${sq}"]`) ?? null;

  function onPointerDown(e: React.PointerEvent) {
    if (e.button === 2 && !mini) {
      const at = squareAt(e.clientX, e.clientY);
      if (at) { setDrawing({ from: at, to: at, color: drawColor(e) }); ref.current?.setPointerCapture(e.pointerId); }
      return;
    }
    if (e.button === 0 && shapes.length) setShapes([]); // any left click clears the drawings
    if (!canMove || e.button > 0 || promo) return;
    const sq = squareAt(e.clientX, e.clientY);
    if (!sq) return;
    if (selected && dests.has(sq)) return commit(selected, sq, false);
    const p = chess.get(sq as Square);
    if (!p || p.color !== turn) return setSelected(null);
    const el = pieceEl(sq);
    if (!el) return;
    drag.current = { from: sq, el, moved: false, wasSelected: selected === sq, x: e.clientX, y: e.clientY };
    setSelected(sq);
    ref.current?.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (drawing) { const at = squareAt(e.clientX, e.clientY); if (at && at !== drawing.to) setDrawing({ ...drawing, to: at }); return; }
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    d.moved = true;
    const b = ref.current!.getBoundingClientRect();
    const size = b.width / 8;
    d.el.classList.add('dragging');
    d.el.style.translate = `${e.clientX - b.left - size / 2}px ${e.clientY - b.top - size / 2}px`;
    const over = squareAt(e.clientX, e.clientY);
    setHover(over && dests.has(over) ? over : null);
  }
  function onPointerUp(e: React.PointerEvent) {
    if (drawing) {
      // Drawing the same shape again removes it; a different colour replaces it.
      const shape = { ...drawing, to: squareAt(e.clientX, e.clientY) ?? drawing.to }; // read the release square from the event, not from possibly stale state
      const same = (x: Arrow) => x.from === shape.from && x.to === shape.to;
      setShapes((list) => (list.some((x) => same(x) && x.color === shape.color) ? list.filter((x) => !same(x)) : [...list.filter((x) => !same(x)), shape]));
      setDrawing(null);
      return;
    }
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setHover(null);
    const restore = () => { d.el.classList.remove('dragging'); const p = xy(d.from); d.el.style.translate = `${p.x * 100}% ${p.y * 100}%`; };
    if (!d.moved) { if (d.wasSelected) setSelected(null); return; }
    const to = squareAt(e.clientX, e.clientY);
    if (to && to !== d.from && chess.moves({ square: d.from as Square, verbose: true }).some((m) => m.to === to)) {
      // Put the element back where React expects it; the re-render with the new position happens before paint.
      restore();
      commit(d.from, to, true);
    } else restore();
  }

  /* ── Animation ──
     The board compares the position it showed last with the new one and animates the difference, so every change
     moves naturally: played moves, castling, takebacks, stepping through a game, loading a line. Pieces that left
     a square slide to the nearest square where the same piece appeared; pieces with no match fade out (captures)
     or pop in (promotions). */
  const shown = useRef<string | null>(null);
  const motion = useMemo(() => {
    // Positions use the CSS `translate` property, leaving `transform`, `scale` and `rotate` free for animation
    // (so a bounce or a shudder happens around the piece's own centre).
    const slides = new Map<string, { dx: number; dy: number }>();
    const ghosts: { sq: string; color: string; type: string }[] = [];
    const pops = new Set<string>();
    const prev = shown.current;
    if (!animation || !prev || prev === fen) return { slides, ghosts, pops };
    let before: Chess;
    try { before = new Chess(prev); } catch { return { slides, ghosts, pops }; }
    type P = { sq: string; color: string; type: string };
    const list = (c: Chess) => c.board().flat().filter(Boolean).map((p) => ({ sq: p!.square, color: p!.color, type: p!.type }));
    const was = list(before), now = list(chess);
    const same = (x: P, y?: P) => !!y && x.color === y.color && x.type === y.type;
    const appeared = now.filter((p) => !same(p, was.find((w) => w.sq === p.sq)));
    const vanished = was.filter((p) => !same(p, now.find((n) => n.sq === p.sq)));
    if (appeared.length > 6) return { slides, ghosts, pops }; // a different game or position: just show it
    const dist = (a: string, b: string) => Math.hypot(FILES.indexOf(a[0]) - FILES.indexOf(b[0]), +a[1] - +b[1]);
    const pairs = appeared.flatMap((a) => vanished.filter((v) => same(a, v)).map((v) => ({ a, v, d: dist(a.sq, v.sq) }))).sort((x, y) => x.d - y.d);
    const usedA = new Set<string>(), usedV = new Set<string>();
    for (const { a, v } of pairs) {
      if (usedA.has(a.sq) || usedV.has(v.sq)) continue;
      usedA.add(a.sq); usedV.add(v.sq);
      if (skipAnim.current === v.sq + a.sq) continue; // dropped there by hand: already in place
      const p = xy(v.sq), q = xy(a.sq);
      slides.set(a.sq, { dx: p.x - q.x, dy: p.y - q.y });
    }
    for (const a of appeared) if (!usedA.has(a.sq)) pops.add(a.sq);
    for (const v of vanished) if (!usedV.has(v.sq)) ghosts.push(v);
    return { slides, ghosts, pops };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, animation]);
  useEffect(() => { shown.current = fen; skipAnim.current = null; }, [fen]);

  // Flipping the board glides every piece to its mirrored square.
  const lastOrientation = useRef(orientation);
  const [flipping, setFlipping] = useState(false);
  const justFlipped = lastOrientation.current !== orientation;
  useEffect(() => {
    if (lastOrientation.current === orientation) return;
    lastOrientation.current = orientation;
    setFlipping(true);
    const t = setTimeout(() => setFlipping(false), animMs * 2.2 + 60);
    return () => clearTimeout(t);
  }, [orientation, animMs]);

  const checkSq = useMemo(() => {
    if (!chess.inCheck()) return null;
    for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === turn) return p.square;
    return null;
  }, [chess, turn]);

  const cell = (sq: string, cls: string, key: string) => {
    const p = xy(sq);
    return <div key={key} className={`cell ${cls}`} style={{ translate: `${p.x * 100}% ${p.y * 100}%` }} />;
  };
  const img = (color: string, type: string) => `url(/pieces/${set}/${color}${type.toUpperCase()}.svg)`;

  return (
    <div
      ref={ref}
      className={`board ${canMove ? 'can-move' : ''} ${animation && (flipping || justFlipped) ? 'flipping' : ''}`}
      style={{ '--anim-ms': `${animMs}ms` } as React.CSSProperties}
      role="img"
      aria-label={label ?? `Chess board, ${turn === 'w' ? 'White' : 'Black'} to move`}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {lastMove && cell(lastMove[0], 'hl-last', 'lf')}
      {lastMove && cell(lastMove[1], 'hl-last', 'lt')}
      {selected && cell(selected, 'hl-sel', 'sel')}
      {checkSq && cell(checkSq, 'hl-check', `chk${fen}`)}
      {hint && cell(hint, 'hl-hint', 'hint')}
      {wrong && cell(wrong, 'hl-wrong', 'wrong')}
      {hover && cell(hover, 'hover-target', 'hover')}

      {coords && !mini && FILES.split('').map((f, i) => {
        const file = orientation === 'w' ? f : FILES[7 - i];
        const rank = orientation === 'w' ? 8 - i : i + 1;
        return (
          <span key={f}>
            <span className={`coord ${i % 2 ? 'l' : 'd'}`} style={{ left: `calc(${i * 12.5}% + 3px)`, bottom: 2 }}>{file}</span>
            <span className={`coord ${i % 2 ? 'l' : 'd'}`} style={{ top: `calc(${i * 12.5}% + 3px)`, right: 3 }}>{rank}</span>
          </span>
        );
      })}

      {/* Captured pieces linger until the capturer lands, then shrink away with a small burst. */}
      {!blindfold && motion.ghosts.map((g) => {
        const pos = xy(g.sq);
        return (
          <span key={`g${g.sq}${fen}`}>
            <div className="cell piece ghost" style={{ translate: `${pos.x * 100}% ${pos.y * 100}%`, backgroundImage: img(g.color, g.type) }} />
            <div className="cell burst" style={{ translate: `${pos.x * 100}% ${pos.y * 100}%` }} />
          </span>
        );
      })}

      {!blindfold && chess.board().flat().map((p) => {
        if (!p) return null;
        const pos = xy(p.square), s = motion.slides.get(p.square), pop = motion.pops.has(p.square);
        const checked = p.square === checkSq && animation;
        return (
          <div
            key={`${p.square}${p.color}${p.type}${s || pop || checked ? fen : ''}`}
            data-sq={p.square}
            className={`cell piece ${s ? 'slide' : ''} ${pop ? 'pop' : ''} ${checked ? 'checked' : ''} ${p.square === selected && !drag.current?.moved ? 'lifted' : ''}`}
            style={{ translate: `${pos.x * 100}% ${pos.y * 100}%`, backgroundImage: img(p.color, p.type), ...(s ? ({ '--dx': `${s.dx * 100}%`, '--dy': `${s.dy * 100}%` } as React.CSSProperties) : {}) }}
          />
        );
      })}

      {legalDots && [...dests].map(([sq, capture]) => cell(sq, capture ? 'ring' : 'dot', `d${selected}${sq}`))}

      {(() => {
        const user = drawing ? [...shapes, drawing] : shapes;
        if (!arrows?.length && !user.length) return null;
        const line = (a: Arrow, key: string, width: number, opacity: number) => {
          const p = xy(a.from), q = xy(a.to);
          const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
          return <line key={key} x1={p.x + 0.5} y1={p.y + 0.5} x2={q.x + 0.5 - (dx / len) * 0.3} y2={q.y + 0.5 - (dy / len) * 0.3} stroke={a.color ?? 'var(--info)'} strokeWidth={width} strokeLinecap="round" opacity={opacity} markerEnd="url(#ah)" />;
        };
        return (
          <svg viewBox="0 0 8 8" className="absolute inset-0 w-full h-full pointer-events-none z-[3]">
            <defs>
              <marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="context-stroke" /></marker>
            </defs>
            {arrows?.map((a, i) => line(a, `e${i}`, i === 0 ? 0.17 : 0.11, i === 0 ? 0.85 : 0.5))}
            {user.map((a, i) => {
              if (a.from !== a.to) return line(a, `u${i}`, 0.17, 0.78);
              const p = xy(a.from);
              return <circle key={`u${i}`} cx={p.x + 0.5} cy={p.y + 0.5} r={0.44} fill="none" stroke={a.color} strokeWidth={0.075} opacity={0.85} />;
            })}
          </svg>
        );
      })()}

      {promo && (() => {
        const p = xy(promo.to);
        const top = p.y === 0;
        return (
          <>
            <div className="absolute inset-0 z-[9] bg-black/35" onPointerDown={(e) => { e.stopPropagation(); setPromo(null); }} />
            <div className="promo" style={{ left: `${p.x * 12.5}%`, [top ? 'top' : 'bottom']: 0 }} role="dialog" aria-label="Choose promotion piece" onPointerDown={(e) => e.stopPropagation()}>
              {(top ? ['q', 'n', 'r', 'b'] : ['b', 'r', 'n', 'q']).map((t) => (
                <button key={t} aria-label={{ q: 'Queen', n: 'Knight', r: 'Rook', b: 'Bishop' }[t]} style={{ backgroundImage: img(turn, t) }}
                  onClick={() => { const m = promo; setPromo(null); onMove?.({ ...m, promotion: t }); }} />
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}
