'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react';
import { formatClock } from '@/lib/chess/time';
import { material } from '@/lib/chess/util';
import { useSettings } from '@/lib/store';
import { Avatar, cx, flag } from './ui';

export const GLYPH: Record<string, { sym: string; cls: string; label: string }> = {
  brilliant: { sym: '!!', cls: 'text-info', label: 'Brilliant' },
  best: { sym: '★', cls: 'text-good', label: 'Best move' },
  inaccuracy: { sym: '?!', cls: 'text-warn', label: 'Inaccuracy' },
  mistake: { sym: '?', cls: 'text-[#e08a3c]', label: 'Mistake' },
  blunder: { sym: '??', cls: 'text-bad', label: 'Blunder' },
};

export function MoveList({ sans, ply, onSelect, glyphs, className, startPly = 0 }: { sans: string[]; ply: number; onSelect: (ply: number) => void; glyphs?: (string | undefined)[]; className?: string; startPly?: number }) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => { active.current?.scrollIntoView({ block: 'nearest' }); }, [ply, sans.length]);
  if (!sans.length) return <div className={cx('flex items-center justify-center p-6 text-sm text-mute', className)}>No moves yet.</div>;
  const rows: { no: number; w?: number; b?: number }[] = [];
  sans.forEach((_, i) => {
    const abs = i + startPly;
    const r = Math.floor(abs / 2);
    rows[r] ??= { no: r + 1 };
    if (abs % 2 === 0) rows[r].w = i; else rows[r].b = i;
  });
  const cell = (i?: number) => {
    if (i === undefined) return <span />;
    const g = glyphs?.[i] ? GLYPH[glyphs[i]!] : null;
    return (
      <button ref={ply === i + 1 ? active : undefined} onClick={() => onSelect(i + 1)} aria-current={ply === i + 1}
        className={cx('rounded px-2 py-1 text-left font-mono text-[13px] transition-colors', ply === i + 1 ? 'bg-accent/20 text-ink font-semibold' : 'hover:bg-raised')}>
        {sans[i]}{g && <span className={cx('ml-1 font-sans text-xs font-bold', g.cls)} title={g.label}>{g.sym}</span>}
      </button>
    );
  };
  return (
    <div className={cx('overflow-y-auto', className)} role="list" aria-label="Moves">
      <div className="grid grid-cols-[2.6rem_1fr_1fr] gap-x-1 gap-y-0.5 p-2">
        {rows.filter(Boolean).map((r) => (
          <div key={r.no} className="contents" role="listitem">
            <span className="tnum py-1 pr-1 text-right font-mono text-xs leading-[1.6] text-mute">{r.no}.</span>{cell(r.w)}{cell(r.b)}
          </div>
        ))}
      </div>
    </div>
  );
}

export function NavButtons({ ply, max, onSelect, onFlip }: { ply: number; max: number; onSelect: (p: number) => void; onFlip?: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); onSelect(Math.max(0, ply - 1)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onSelect(Math.min(max, ply + 1)); }
      else if (e.key === 'ArrowUp' || e.key === 'Home') { e.preventDefault(); onSelect(0); }
      else if (e.key === 'ArrowDown' || e.key === 'End') { e.preventDefault(); onSelect(max); }
      else if (e.key === 'f' && onFlip) onFlip();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [ply, max, onSelect, onFlip]);
  const b = 'flex h-9 flex-1 items-center justify-center rounded-md text-mute hover:bg-raised hover:text-ink disabled:opacity-30';
  return (
    <div className="flex gap-1 border-t border-line p-1.5">
      <button className={b} onClick={() => onSelect(0)} disabled={ply === 0} aria-label="First move"><ChevronFirst className="size-5" /></button>
      <button className={b} onClick={() => onSelect(ply - 1)} disabled={ply === 0} aria-label="Previous move"><ChevronLeft className="size-5" /></button>
      <button className={b} onClick={() => onSelect(ply + 1)} disabled={ply >= max} aria-label="Next move"><ChevronRight className="size-5" /></button>
      <button className={b} onClick={() => onSelect(max)} disabled={ply >= max} aria-label="Last move"><ChevronLast className="size-5" /></button>
      {onFlip && <button className={b} onClick={onFlip} aria-label="Flip board"><RefreshCcw className="size-4" /></button>}
    </div>
  );
}

export function Captured({ fen, color }: { fen: string; color: 'w' | 'b' }) {
  const set = useSettings((s) => s.pieces);
  const m = material(fen);
  const list = color === 'w' ? m.byWhite : m.byBlack;
  const lead = color === 'w' ? m.balance : -m.balance;
  const victim = color === 'w' ? 'b' : 'w';
  return (
    <span className="flex h-5 items-center" aria-label={`Captured by ${color === 'w' ? 'White' : 'Black'}: ${list.length} pieces`}>
      {list.map((t, i) => <span key={i} className={cx('inline-block size-[18px] bg-contain', i > 0 && list[i - 1] === t ? '-ml-2.5' : i > 0 && 'ml-0.5')} style={{ backgroundImage: `url(/pieces/${set}/${victim}${t.toUpperCase()}.svg)` }} />)}
      {lead > 0 && <span className="tnum ml-1.5 text-xs font-medium text-mute">+{lead}</span>}
    </span>
  );
}

export function PlayerBar({ name, rating, diff, avatar, country, online, href, fen, color, clockMs, running, days, thinking, sub }: {
  name: string; rating?: number | null; diff?: number | null; avatar?: string | null; country?: string; online?: boolean; href?: string;
  fen: string; color: 'w' | 'b'; clockMs?: number | null; running?: boolean; days?: boolean; thinking?: boolean; sub?: string;
}) {
  const low = clockMs != null && !days && clockMs < 20000;
  const title = (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate text-[15px] font-semibold">{name}</span>
      {rating != null && <span className="tnum text-sm text-mute">{rating}</span>}
      {diff != null && <span className={cx('tnum text-sm font-medium', diff > 0 ? 'text-good' : diff < 0 ? 'text-bad' : 'text-mute')}>{diff > 0 ? '+' : ''}{diff}</span>}
      {country && <span className="text-sm">{flag(country)}</span>}
      {sub && <span className="truncate text-xs text-mute">{sub}</span>}
    </span>
  );
  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar name={name} src={avatar} size={34} online={online} />
      <div className="min-w-0 flex-1">
        {href ? <Link href={href} className="hover:underline">{title}</Link> : title}
        <Captured fen={fen} color={color} />
      </div>
      {thinking && <span className="flex gap-1" aria-label="Thinking">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-mute" style={{ animationDelay: `${i * 120}ms` }} />)}</span>}
      {clockMs != null && (
        <div role="timer" aria-label={`${name} clock`} className={cx('tnum rounded-lg px-3 py-1.5 font-mono text-xl font-semibold transition-colors sm:text-2xl',
          running ? (low ? 'bg-bad text-white' : 'bg-ink text-bg') : 'bg-raised text-mute', low && !running && 'text-bad')}>
          {formatClock(clockMs, days)}
        </div>
      )}
    </div>
  );
}

/** Vertical evaluation bar. `white` is White's win chance, 0–100. */
export function EvalBar({ white, label, orientation }: { white: number; label: string; orientation: 'w' | 'b' }) {
  const whiteAhead = white >= 50;
  return (
    <div className="relative w-5 shrink-0 overflow-hidden rounded-md bg-[#2a2a2c] sm:w-6" role="meter" aria-label="Engine evaluation" aria-valuenow={Math.round(white)} aria-valuemin={0} aria-valuemax={100} aria-valuetext={label}>
      <div className={cx('absolute inset-x-0 bg-[#f1efe9] transition-[height] duration-500 ease-out', orientation === 'w' ? 'bottom-0' : 'top-0')} style={{ height: `${white}%` }} />
      <span className={cx('absolute inset-x-0 text-center font-mono text-[9px] font-bold sm:text-[10px]', whiteAhead ? 'text-[#222]' : 'text-[#eee]', (whiteAhead ? orientation === 'w' : orientation === 'b') ? 'bottom-1' : 'top-1')}>{label.replace('+', '')}</span>
    </div>
  );
}
