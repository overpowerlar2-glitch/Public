'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Card, Spinner, toast } from '@/components/ui';
import { api, refreshMe } from '@/lib/client';
import { resetSocket } from '@/lib/socket';
import { useT } from '@/lib/i18n';

function Verify() {
  const tr = useT();
  const token = useSearchParams().get('token');
  const [error, setError] = useState<string | null>(token ? null : 'This confirmation link is incomplete.');
  const sent = useRef(false);
  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true; // the token is single-use: never post it twice
    api('/api/auth/verify', { method: 'POST', body: { token } })
      .then(async () => { await refreshMe(); resetSocket(); toast.success(tr('Email confirmed. Welcome to Tabiya!')); window.location.assign('/'); })
      .catch((e: Error) => setError(e.message));
  }, [token]);
  return (
    <div className="mx-auto max-w-sm py-12"><Card className="p-6">
      <h1 className="font-display text-3xl">{tr(error ? 'Link not valid' : 'Confirming…')}</h1>
      {error ? <p className="mt-2 text-sm text-mute">{tr(error ?? '')} <Link href="/login" className="text-accent hover:underline">{tr("Sign in")}</Link> {tr("to request a new one.")}</p> : <Spinner className="mt-4" />}
    </Card></div>
  );
}
export default function VerifyPage() { return <Suspense><Verify /></Suspense>; }
