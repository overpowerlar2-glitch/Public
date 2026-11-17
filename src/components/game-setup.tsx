'use client';
import { useState } from 'react';
import { Field, Input, Segmented } from './ui';
import { tcLabel, type TimeControl } from '@/lib/chess/time';

const MINUTES = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 15, 20, 30, 45, 60, 90, 120, 180];
const INCREMENTS = [0, 1, 2, 3, 5, 10, 15, 20, 30, 45, 60];
const DAYS = [1, 2, 3, 5, 7, 10, 14];
type Mode = 'clock' | 'days' | 'unlimited';

/** Custom time-control picker: real-time (minutes + increment), correspondence (days per move) or unlimited. */
export function useTimeControl() {
  const [mode, setMode] = useState<Mode>('clock');
  const [mi, setMi] = useState(5);
  const [ii, setIi] = useState(0);
  const [di, setDi] = useState(2);
  const tc: TimeControl = mode === 'clock' ? { initial: MINUTES[mi] * 60, increment: INCREMENTS[ii], days: null } : mode === 'days' ? { initial: null, increment: 0, days: DAYS[di] } : { initial: null, increment: 0, days: null };
  const slider = (label: string, value: number, max: number, on: (n: number) => void, text: string) => (
    <label className="block">
      <span className="mb-1 flex justify-between text-[13px]"><span className="font-medium">{label}</span><span className="tnum font-mono text-accent">{text}</span></span>
      <input type="range" min={0} max={max} value={value} onChange={(e) => on(+e.target.value)} className="w-full accent-[var(--accent)]" />
    </label>
  );
  const ui = (
    <div className="space-y-4">
      <Segmented label="Game type" value={mode} onChange={setMode} options={[{ value: 'clock', label: 'Real-time' }, { value: 'days', label: 'Correspondence' }, { value: 'unlimited', label: 'Unlimited' }]} />
      {mode === 'clock' && <>{slider('Minutes per side', mi, MINUTES.length - 1, setMi, String(MINUTES[mi]))}{slider('Increment in seconds', ii, INCREMENTS.length - 1, setIi, String(INCREMENTS[ii]))}</>}
      {mode === 'days' && slider('Days per move', di, DAYS.length - 1, setDi, String(DAYS[di]))}
      {mode === 'unlimited' && <p className="text-sm text-mute">No clock. Unlimited games are always casual.</p>}
      <p className="text-sm text-mute">Time control: <span className="font-mono text-ink">{tcLabel(tc)}</span></p>
    </div>
  );
  return { tc, ui, mode };
}

export function InviteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <Field label="Challenge a player (optional)" hint="Leave empty to get a link you can send to anyone."><Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Username" maxLength={20} /></Field>;
}
