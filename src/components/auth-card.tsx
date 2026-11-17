'use client';
import { useState, type ReactNode } from 'react';
import { Button, Card, ErrorNote } from './ui';
import { Logo } from './shell';

export function AuthCard({ title, sub, submit, onSubmit, children, footer }: { title: string; sub?: string; submit: string; onSubmit: () => Promise<void>; children: ReactNode; footer?: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-sm py-6 sm:py-12">
      <div className="mb-6 text-center lg:hidden"><Logo /></div>
      <Card className="p-6">
        <h1 className="font-display text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-mute">{sub}</p>}
        <form className="mt-5 space-y-4" noValidate onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(null); try { await onSubmit(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>
          {children}
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" variant="primary" className="w-full" loading={busy}>{submit}</Button>
        </form>
      </Card>
      {footer && <div className="mt-4 text-center text-sm text-mute">{footer}</div>}
    </div>
  );
}
