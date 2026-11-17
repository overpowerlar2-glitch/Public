export const CATEGORIES = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence', 'puzzle'] as const;
export type Category = (typeof CATEGORIES)[number];
export const PLAY_CATEGORIES = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'] as const;

/** A time control. `initial`/`increment` in seconds; `days` for correspondence; all null = unlimited. */
export type TimeControl = { initial: number | null; increment: number; days: number | null };

export const PRESETS: { label: string; initial: number; increment: number; category: Category }[] = [
  { label: '1+0', initial: 60, increment: 0, category: 'bullet' },
  { label: '2+1', initial: 120, increment: 1, category: 'bullet' },
  { label: '3+0', initial: 180, increment: 0, category: 'blitz' },
  { label: '3+2', initial: 180, increment: 2, category: 'blitz' },
  { label: '5+0', initial: 300, increment: 0, category: 'blitz' },
  { label: '5+3', initial: 300, increment: 3, category: 'blitz' },
  { label: '10+0', initial: 600, increment: 0, category: 'rapid' },
  { label: '10+5', initial: 600, increment: 5, category: 'rapid' },
  { label: '15+10', initial: 900, increment: 10, category: 'rapid' },
  { label: '30+0', initial: 1800, increment: 0, category: 'classical' },
];

export function categoryOf(tc: TimeControl): Category {
  if (tc.days) return 'correspondence';
  if (tc.initial == null) return 'classical'; // unlimited games are always casual; grouped with classical
  const est = tc.initial + 40 * tc.increment;
  if (est < 180) return 'bullet';
  if (est < 480) return 'blitz';
  if (est < 1500) return 'rapid';
  return 'classical';
}

export function tcLabel(tc: TimeControl, tr: (s: string, v?: Record<string, string | number>) => string = (s, v) => s.replace('{n}', String(v?.n ?? ''))): string {
  if (tc.days) return tr(tc.days > 1 ? '{n} days/move' : '{n} day/move', { n: tc.days });
  if (tc.initial == null) return tr('Unlimited');
  const m = tc.initial / 60;
  return `${Number.isInteger(m) ? m : m.toFixed(1)}+${tc.increment}`;
}

export function validTc(tc: TimeControl): boolean {
  if (tc.days != null) return Number.isInteger(tc.days) && tc.days >= 1 && tc.days <= 14 && tc.initial == null;
  if (tc.initial == null) return true;
  return Number.isInteger(tc.initial) && tc.initial >= 15 && tc.initial <= 10800 && Number.isInteger(tc.increment) && tc.increment >= 0 && tc.increment <= 180;
}

export function formatClock(ms: number, days = false): string {
  if (ms < 0) ms = 0;
  if (days || ms >= 864e5) {
    const d = Math.floor(ms / 864e5), h = Math.floor((ms % 864e5) / 36e5);
    return d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor((ms % 36e5) / 6e4)}m`;
  }
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  if (ms < 10000) return `${m}:${pad(s)}.${Math.floor((ms % 1000) / 100)}`;
  return `${m}:${pad(s)}`;
}
