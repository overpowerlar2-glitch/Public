'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Volume2 } from 'lucide-react';
import { Board } from '@/components/board';
import { Avatar, Button, Card, cx, ErrorNote, Field, flag, Input, PageHeader, Segmented, Toggle, toast } from '@/components/ui';
import { api, refreshMe, useMe } from '@/lib/client';
import { BOARD_THEMES, PIECE_SETS, useSettings } from '@/lib/store';
import { play, playMove } from '@/lib/sound';
import { Chess } from 'chess.js';
import { tx, useLang, useT } from '@/lib/i18n';

const CODES = 'AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP KE KG KH KM KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ OM PA PE PG PH PK PL PS PT PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS SV SY SZ TD TG TH TJ TL TM TN TO TR TT TW TZ UA UG US UY UZ VE VN YE ZA ZM ZW'.split(' ');

const PREVIEW = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4';
/** A small playable board so appearance and animation changes can be tried immediately. */
function PreviewBoard() {
  const tr = useT();
  const [fen, setFen] = useState(PREVIEW);
  const [last, setLast] = useState<[string, string] | null>(['g8', 'f6']);
  const [flip, setFlip] = useState(false);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full max-w-[300px]">
        <Board fen={fen} orientation={flip ? 'b' : 'w'} movable="both" lastMove={last} onMove={(m) => { try { const c = new Chess(fen); const mv = c.move(m); playMove(mv.san); setFen(c.fen()); setLast([mv.from, mv.to]); } catch {} }} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => setFlip((f) => !f)}>{tr("Flip")}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setFen(PREVIEW); setLast(['g8', 'f6']); }}>{tr("Reset")}</Button>
      </div>
    </div>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium">{title}</p>{hint && <p className="text-xs text-mute">{hint}</p>}</div>{children}</div>;
}

/** Downscales an uploaded picture to a 128px square JPEG so it can be stored inline. */
async function toAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(tx('Choose an image file.'));
  const bmp = await createImageBitmap(file).catch(() => { throw new Error(tx('That image could not be read.')); });
  const s = Math.min(bmp.width, bmp.height), c = document.createElement('canvas');
  c.width = c.height = 128;
  c.getContext('2d')!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 128, 128);
  return c.toDataURL('image/jpeg', 0.85);
}

export default function SettingsPage() {
  const tr = useT();
  const { lang, setLang } = useLang();
  const s = useSettings();
  const { me, loading } = useMe();
  const [names, setNames] = useState<Intl.DisplayNames | null>(null);
  const [form, setForm] = useState({ username: '', bio: '', country: '' });
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState<'profile' | 'password' | null>(null);
  const [err, setErr] = useState<{ profile?: string; password?: string }>({});
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => { try { setNames(new Intl.DisplayNames([lang], { type: 'region' })); } catch {} }, [lang]);
  useEffect(() => { if (me) setForm({ username: me.username, bio: me.bio, country: me.country }); }, [me]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setBusy('profile'); setErr({});
    try { await api('/api/me', { method: 'PATCH', body: { ...form, ...(avatar !== undefined ? { avatar } : {}) } }); await refreshMe(); setAvatar(undefined); toast.success(tr('Profile saved.')); }
    catch (x) { setErr({ profile: (x as Error).message }); } finally { setBusy(null); }
  }
  async function savePassword(e: React.FormEvent) {
    e.preventDefault(); setBusy('password'); setErr({});
    try { await api('/api/me/password', { method: 'POST', body: pw }); setPw({ current: '', next: '' }); toast.success(tr('Password changed.')); }
    catch (x) { setErr({ password: (x as Error).message }); } finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={tr("Settings")} sub={tr("Appearance and game preferences are saved on this device. Account details are saved to your profile.")} />

      <Card className="p-5">
        <h2 className="mb-1 font-display text-2xl">{tr("Appearance")}</h2>
        <div className="divide-y divide-line/60">
          <Row title={tr("Language")}><Segmented label={tr("Language")} value={lang} onChange={setLang} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} /></Row>
          <Row title={tr("Colour theme")}><Segmented label={tr("Colour theme")} value={s.theme} onChange={(theme) => s.set({ theme })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} /></Row>
          <div className="py-3">
            <p className="mb-2 text-sm font-medium">{tr("Board")}</p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8" role="radiogroup" aria-label={tr("Board theme")}>
              {BOARD_THEMES.map((b) => (
                <button key={b.id} role="radio" aria-checked={s.board === b.id} onClick={() => s.set({ board: b.id })} className={cx('rounded-lg border p-2 text-center text-xs font-medium transition-colors', s.board === b.id ? 'border-accent' : 'border-line hover:border-mute/60')}>
                  <span data-board={b.id} className="board-swatch mb-1.5 block aspect-[2/1] rounded" />{tr(b.name)}
                </button>
              ))}
            </div>
          </div>
          <div className="py-3">
            <p className="mb-2 text-sm font-medium">{tr("Pieces")}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" role="radiogroup" aria-label={tr("Piece style")}>
              {PIECE_SETS.map((p) => (
                <button key={p.id} role="radio" aria-checked={s.pieces === p.id} onClick={() => s.set({ pieces: p.id })} className={cx('rounded-lg border p-2 text-xs font-medium transition-colors', s.pieces === p.id ? 'border-accent' : 'border-line hover:border-mute/60')}>
                  <span className="board-swatch mb-1 flex justify-center rounded py-1" style={{ backgroundSize: '25% 100%' }}>{['wK', 'wN', 'bQ', 'bB'].map((x) => <span key={x} className="relative size-9 bg-contain" style={{ backgroundImage: `url(/pieces/${p.id}/${x}.svg)` }} />)}</span><span className="block">{p.name}</span><span className="block truncate text-[10px] font-normal text-mute">{tr(p.credit)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="py-3"><p className="mb-2 text-sm font-medium">{tr("Preview")} <span className="font-normal text-mute">{tr("— click a piece and move it to try the animation")}</span></p><PreviewBoard /></div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 font-display text-2xl">{tr("Game")}</h2>
        <div className="divide-y divide-line/60">
          <Row title={tr("Sounds")} hint={tr("Moves, captures, checks, game start and game end.")}><Toggle checked={s.sound} onChange={(sound) => s.set({ sound })} label={tr("Sounds")} /></Row>
          <Row title={tr("Volume")}>
            <span className="flex items-center gap-3"><input type="range" min={0} max={1} step={0.05} value={s.volume} disabled={!s.sound} onChange={(e) => s.set({ volume: +e.target.value })} aria-label={tr("Volume")} className="w-40 accent-[var(--accent)]" />
              <Button size="sm" variant="ghost" onClick={() => play('capture')} disabled={!s.sound}><Volume2 className="size-4" /> {tr("Test")}</Button></span>
          </Row>
          <Row title={tr("Piece animation")} hint={tr("Slides, captures, check and board flips.")}><Toggle checked={s.animation} onChange={(animation) => s.set({ animation })} label={tr("Piece animation")} /></Row>
          <Row title={tr("Animation speed")}><Segmented label={tr("Animation speed")} value={s.animSpeed ?? 'normal'} onChange={(animSpeed) => s.set({ animSpeed })} options={[{ value: 'fast', label: 'Fast' }, { value: 'normal', label: 'Normal' }, { value: 'slow', label: 'Slow' }]} /></Row>
          <Row title={tr("Legal move dots")} hint={tr("Show where the selected piece can go.")}><Toggle checked={s.legalDots} onChange={(legalDots) => s.set({ legalDots })} label={tr("Legal move dots")} /></Row>
          <Row title={tr("Board coordinates")}><Toggle checked={s.coords} onChange={(coords) => s.set({ coords })} label={tr("Board coordinates")} /></Row>
          <Row title={tr("Always promote to a queen")} hint={tr("Skip the promotion picker.")}><Toggle checked={s.autoQueen} onChange={(autoQueen) => s.set({ autoQueen })} label={tr("Always promote to a queen")} /></Row>
        </div>
      </Card>

      {loading ? <div className="skeleton h-64" /> : !me ? (
        <Card className="p-5"><h2 className="font-display text-2xl">{tr("Account")}</h2><p className="mt-1 text-sm text-mute">{tr("You are playing as a guest.")} <Link href="/register" className="text-accent hover:underline">{tr("Create an account")}</Link> {tr("or")} <Link href="/login" className="text-accent hover:underline">{tr("sign in")}</Link> {tr("to set up a profile.")}</p></Card>
      ) : (
        <>
          <Card className="p-5">
            <h2 className="mb-4 font-display text-2xl">{tr("Profile")}</h2>
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar name={form.username || me.username} src={avatar === undefined ? me.avatar : avatar} size={72} />
                <div className="space-x-2">
                  <input ref={file} type="file" accept="image/*" className="sr-only" aria-label={tr("Profile picture")} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { try { setAvatar(await toAvatar(f)); } catch (x) { toast.error((x as Error).message); } } }} />
                  <Button type="button" size="sm" onClick={() => file.current?.click()}>{tr("Upload picture")}</Button>
                  {(avatar ?? me.avatar) && <Button type="button" size="sm" variant="ghost" onClick={() => setAvatar(null)}>{tr("Remove")}</Button>}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={tr("Username")}><Input value={form.username} maxLength={20} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
                <Field label={tr("Country")}>
                  <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm focus:border-accent focus:outline-none">
                    <option value="">{tr("Not set")}</option>
                    {CODES.map((c) => <option key={c} value={c}>{flag(c)} {names?.of(c) ?? c}</option>)}
                  </select>
                </Field>
              </div>
              <Field label={tr("Bio")} hint={`${form.bio.length}/400`}><textarea value={form.bio} maxLength={400} rows={3} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="w-full rounded-lg border border-line bg-bg p-3 text-sm focus:border-accent focus:outline-none" /></Field>
              <p className="text-xs text-mute">{tr("Email: {email}", { email: me.email })}</p>
              <ErrorNote>{err.profile}</ErrorNote>
              <Button type="submit" variant="primary" loading={busy === 'profile'}>{tr("Save profile")}</Button>
            </form>
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 font-display text-2xl">{tr("Password")}</h2>
            <form onSubmit={savePassword} className="max-w-sm space-y-4">
              <Field label={tr("Current password")}><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
              <Field label={tr("New password")} hint={tr("At least 8 characters.")}><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
              <ErrorNote>{err.password}</ErrorNote>
              <Button type="submit" loading={busy === 'password'}>{tr("Change password")}</Button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}
