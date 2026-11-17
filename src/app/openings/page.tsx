'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import useSWRImmutable from 'swr/immutable';
import { Chess } from 'chess.js';
import { ChevronLeft, Microscope, RotateCcw, Search } from 'lucide-react';
import { Board, type BoardMove } from '@/components/board';
import { Button, Card, cx, Empty, PageHeader, Skeleton } from '@/components/ui';
import { api } from '@/lib/client';
import { replay, START_FEN } from '@/lib/chess/util';
import { playMove } from '@/lib/sound';
import { useT } from '@/lib/i18n';

type Row = [eco: string, name: string, sans: string, epd: string];
type Stat = { san: string; white: number; draws: number; black: number };
const POPULAR = ['Italian Game', 'Ruy Lopez', 'Sicilian Defense', 'French Defense', 'Caro-Kann Defense', "Queen's Gambit", "King's Indian Defense", 'London System', 'English Opening', 'Slav Defense', 'Scandinavian Defense', 'Nimzo-Indian Defense'];

function Bar({ s }: { s?: Stat }) {
  const tr = useT();
  const n = s ? s.white + s.draws + s.black : 0;
  if (!s || !n) return <span className="text-xs text-mute">{tr("no games yet")}</span>;
  const pct = (v: number) => `${(v / n) * 100}%`;
  return (
    <span className="flex items-center gap-2" title={`${tr('White')} ${s.white} · ${tr('Draw')} ${s.draws} · ${tr('Black')} ${s.black}`}>
      <span className="flex h-3 w-28 overflow-hidden rounded-sm text-[0]"><span className="bg-[#f1efe9]" style={{ width: pct(s.white) }} /><span className="bg-[#8b9099]" style={{ width: pct(s.draws) }} /><span className="bg-[#2a2a2c]" style={{ width: pct(s.black) }} /></span>
      <span className="tnum font-mono text-xs text-mute">{n}</span>
    </span>
  );
}

export default function OpeningsPage() {
  const tr = useT();
  const { data: book, error } = useSWRImmutable<Row[]>('/data/openings.json', api);
  const [path, setPath] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const prefix = path.join(' ');
  const { data: stats } = useSWR<{ moves: Stat[] }>(`/api/openings/stats?moves=${encodeURIComponent(prefix)}`, api, { keepPreviousData: true });
  const steps = useMemo(() => replay(path), [path]);
  const fen = steps.length ? steps[steps.length - 1].fen : START_FEN;
  const last = steps.length ? ([steps[steps.length - 1].from, steps[steps.length - 1].to] as [string, string]) : null;

  const { current, next } = useMemo(() => {
    if (!book) return { current: null as Row | null, next: [] as { san: string; name: string | null; eco: string | null; lines: number }[] };
    let current: Row | null = null;
    const map = new Map<string, { san: string; name: string | null; eco: string | null; lines: number }>();
    const lead = prefix ? prefix + ' ' : '';
    for (const r of book) {
      // deepest named line that the current sequence has passed through
      if ((r[2] === prefix || prefix.startsWith(r[2] + ' ')) && (!current || r[2].length > current[2].length)) current = r;
      if (!r[2].startsWith(lead) || r[2] === prefix) continue;
      const san = r[2].slice(lead.length).split(' ')[0];
      const e = map.get(san) ?? { san, name: null, eco: null, lines: 0 };
      e.lines++;
      if (r[2] === lead + san) { e.name = r[1]; e.eco = r[0]; }
      map.set(san, e);
    }
    return { current, next: [...map.values()].sort((a, b) => b.lines - a.lines) };
  }, [book, prefix]);

  const statMap = useMemo(() => new Map((stats?.moves ?? []).map((s) => [s.san, s])), [stats]);
  const offBook = (stats?.moves ?? []).filter((s) => s.san && !next.some((n) => n.san === s.san));
  const results = useMemo(() => { const t = q.trim().toLowerCase(); return t.length < 2 || !book ? [] : book.filter((r) => r[1].toLowerCase().includes(t) || r[0].toLowerCase() === t).slice(0, 40); }, [q, book]);
  const popular = useMemo(() => (book ? POPULAR.map((n) => book.find((r) => r[1] === n)).filter(Boolean) as Row[] : []), [book]);

  const push = (san: string) => { try { const c = new Chess(fen); const m = c.move(san); playMove(m.san); setPath([...path, m.san]); } catch { /* not legal here */ } };
  const onMove = (m: BoardMove) => { try { const mv = new Chess(fen).move(m); playMove(mv.san); setPath([...path, mv.san]); } catch {} };
  const numbered = path.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(' ');

  if (error) return <Empty title={tr("The opening book could not be loaded")}>{(error as Error).message}</Empty>;
  return (
    <div>
      <PageHeader title={tr("Openings")} sub={tr("Step through 3,800 named lines by ECO code. Result bars show games played on Tabiya from each position.")} />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="mx-auto w-full" style={{ maxWidth: 'min(100%, calc(100dvh - 12rem))' }}>
          <Board fen={fen} movable="both" onMove={onMove} lastMove={last} />
        </div>
        <div className="space-y-3">
          <Card className="p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mute">{current ? current[0] : tr('Start')}</p>
            <h2 className="font-display text-2xl leading-tight">{current ? current[1] : tr('Starting position')}</h2>
            <p className="mt-1 min-h-5 font-mono text-[13px] text-mute">{numbered || tr('Choose a first move below or play one on the board.')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setPath(path.slice(0, -1))} disabled={!path.length}><ChevronLeft className="size-4" /> {tr("Back")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setPath([])} disabled={!path.length}><RotateCcw className="size-4" /> {tr("Reset")}</Button>
              <Button href={`/analysis?fen=${encodeURIComponent(fen)}`} size="sm" variant="ghost"><Microscope className="size-4" /> {tr("Analyse")}</Button>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="grid grid-cols-[4rem_1fr_auto] gap-x-3 border-b border-line px-4 py-2 text-xs uppercase tracking-wider text-mute"><span>{tr("Move")}</span><span>{tr("Opening")}</span><span>{tr("Tabiya games")}</span></div>
            {!book ? <div className="space-y-2 p-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div>
              : next.length + offBook.length === 0 ? <p className="p-4 text-sm text-mute">{tr("End of the book for this line. Keep playing on the board, or take it to analysis.")}</p>
              : <div className="max-h-[22rem] overflow-y-auto">
                {next.map((n) => (
                  <button key={n.san} onClick={() => push(n.san)} className="grid w-full grid-cols-[4rem_1fr_auto] items-center gap-x-3 border-b border-line/50 px-4 py-2 text-start text-sm last:border-0 hover:bg-raised">
                    <span className="font-mono font-semibold">{n.san}</span>
                    <span className="min-w-0 truncate">{n.name ? <>{n.name} <span className="font-mono text-xs text-mute">{n.eco}</span></> : <span className="text-mute">{tr(n.lines > 1 ? '{n} named lines follow' : '{n} named line follows', { n: n.lines })}</span>}</span>
                    <Bar s={statMap.get(n.san)} />
                  </button>
                ))}
                {offBook.map((s) => (
                  <button key={s.san} onClick={() => push(s.san)} className="grid w-full grid-cols-[4rem_1fr_auto] items-center gap-x-3 border-b border-line/50 px-4 py-2 text-start text-sm last:border-0 hover:bg-raised">
                    <span className="font-mono font-semibold">{s.san}</span><span className="text-mute">{tr("Played here, not a named line")}</span><Bar s={s} />
                  </button>
                ))}
              </div>}
          </Card>

          <Card className="p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search by name or ECO code (e.g. Najdorf, B90)")} aria-label={tr("Search openings")} className="h-10 w-full rounded-lg border border-line bg-bg ps-9 pe-3 text-sm focus:border-accent focus:outline-none" />
            </div>
            {q.trim().length >= 2 ? (
              results.length === 0 ? <p className="mt-3 text-sm text-mute">No opening matches “{q.trim()}”.</p> : (
                <ul className="mt-2 max-h-56 overflow-y-auto">{results.map((r) => (
                  <li key={r[3] + r[1]}><button onClick={() => { setPath(r[2].split(' ')); setQ(''); }} className="flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-start text-sm hover:bg-raised"><span className="w-9 shrink-0 font-mono text-xs text-mute">{r[0]}</span><span className="truncate">{r[1]}</span></button></li>
                ))}</ul>
              )
            ) : (
              <>
                <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-mute">{tr("Popular openings")}</p>
                <div className="flex flex-wrap gap-1.5">{popular.map((r) => <button key={r[1]} onClick={() => setPath(r[2].split(' '))} className={cx('rounded-full border px-3 py-1 text-[13px] transition-colors', current?.[1] === r[1] ? 'border-accent bg-accent/10' : 'border-line hover:border-accent/60')}>{r[1]}</button>)}</div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
