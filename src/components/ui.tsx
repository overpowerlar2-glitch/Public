'use client';
import { forwardRef, useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, X } from 'lucide-react';
import { create } from 'zustand';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; href?: string };
/** A button, or a link styled as one when `href` is given (so links are real anchors, not buttons nested in anchors). */
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, href, ...p }, ref) {
  const cls = cx(
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[background,transform,border-color,opacity] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 whitespace-nowrap',
    size === 'sm' && 'h-8 px-3 text-[13px]', size === 'md' && 'h-10 px-4 text-sm', size === 'lg' && 'h-12 px-6 text-[15px]',
    variant === 'primary' && 'bg-accent text-accent-ink hover:brightness-110',
    variant === 'secondary' && 'bg-raised text-ink border border-line hover:border-mute/60',
    variant === 'ghost' && 'text-mute hover:text-ink hover:bg-raised',
    variant === 'danger' && 'bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25',
    className,
  );
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return (
    <button ref={ref} disabled={disabled || loading} {...p} className={cls}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...p} className={cx('rounded-xl border border-line bg-surface shadow-card', className)}>{children}</div>;
}
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="mb-3 flex items-end justify-between gap-3"><h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-mute">{children}</h2>{action}</div>;
}
export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h1 className="font-display text-4xl leading-none sm:text-5xl">{title}</h1>{sub && <p className="mt-2 max-w-xl text-sm text-mute">{sub}</p>}</div>
      {children}
    </header>
  );
}

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('size-5 animate-spin text-mute', className)} aria-label="Loading" />;
export const Skeleton = ({ className }: { className?: string }) => <div className={cx('skeleton', className)} aria-hidden />;
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center"><p className="font-medium">{title}</p>{children && <div className="mt-1 text-sm text-mute">{children}</div>}</div>;
}
export function ErrorNote({ children }: { children: ReactNode }) {
  return children ? <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{children}</p> : null;
}

export function Avatar({ name, src, size = 36, online }: { name: string; src?: string | null; size?: number; online?: boolean }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {src
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt="" className="size-full rounded-full object-cover" />
        : <span className="flex size-full items-center justify-center rounded-full font-semibold text-white/90" style={{ background: `oklch(0.5 0.09 ${h})`, fontSize: size * 0.42 }}>{name.slice(0, 1).toUpperCase()}</span>}
      {online !== undefined && <span className={cx('absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface', online ? 'bg-good' : 'bg-mute/60')} title={online ? 'Online' : 'Offline'} />}
    </span>
  );
}
export const flag = (cc?: string | null) => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0))) : '');

export function Segmented<T extends string>({ value, onChange, options, size = 'md', label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: 'sm' | 'md'; label?: string }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-raised p-0.5">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx('relative rounded-md font-medium transition-colors whitespace-nowrap', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-[13px]', value === o.value ? 'text-ink' : 'text-mute hover:text-ink')}>
          {value === o.value && <motion.span layoutId={id} className="absolute inset-0 rounded-md bg-surface shadow-sm border border-line" transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line')}>
      <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx('h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm placeholder:text-mute/70 transition-colors focus:border-accent focus:outline-none', className)} />;
});
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[13px] font-medium">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-mute">{hint}</span>}</label>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div role="dialog" aria-modal aria-label={title} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }} transition={{ type: 'spring', duration: 0.35, bounce: 0.1 }}
            className={cx('max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 shadow-card sm:rounded-2xl sm:p-6', wide ? 'sm:max-w-xl' : 'sm:max-w-md')}>
            <div className="mb-4 flex items-center justify-between"><h2 className="font-display text-2xl">{title}</h2><button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-mute hover:bg-raised hover:text-ink"><X className="size-5" /></button></div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Toasts ── */
type Toast = { id: number; text: string; kind: 'info' | 'error' | 'success'; action?: { label: string; run: () => void } };
const useToasts = create<{ items: Toast[]; push: (t: Omit<Toast, 'id'>, ms?: number) => void; drop: (id: number) => void }>((set, get) => ({
  items: [],
  push: (t, ms = 5000) => { const id = Date.now() + Math.random(); set({ items: [...get().items.slice(-3), { ...t, id }] }); setTimeout(() => get().drop(id), ms); },
  drop: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
}));
export const toast = {
  info: (text: string, action?: Toast['action'], ms?: number) => useToasts.getState().push({ text, kind: 'info', action }, ms),
  error: (text: string) => useToasts.getState().push({ text, kind: 'error' }),
  success: (text: string) => useToasts.getState().push({ text, kind: 'success' }),
};
export function Toaster() {
  const { items, drop } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div key={t.id} layout initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            className={cx('pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border bg-surface px-4 py-3 text-sm shadow-card', t.kind === 'error' ? 'border-bad/40' : t.kind === 'success' ? 'border-good/40' : 'border-line')}>
            <span className={cx('size-2 shrink-0 rounded-full', t.kind === 'error' ? 'bg-bad' : t.kind === 'success' ? 'bg-good' : 'bg-accent')} />
            <span>{t.text}</span>
            {t.action && <Button size="sm" variant="primary" onClick={() => { t.action!.run(); drop(t.id); }}>{t.action.label}</Button>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
