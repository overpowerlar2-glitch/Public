'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, Spinner, toast } from '@/components/ui';
import { api, refreshMe } from '@/lib/client';
import { resetSocket } from '@/lib/socket';

function Verify() {
  const token = useSearchParams().get('token');
  const router = useRouter();
  const [error, setError] = useState<string | null>(token ? null : 'This confirmation link is incomplete.');
  const sent = useRef(false);
  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true; // the token is single-use: never post it twice
    api('/api/auth/verify', { method: 'POST', body: { token } })
      .then(async () => { await refreshMe(); resetSocket(); toast.success('Email confirmed. Welcome to Tabiya!'); router.replace('/'); })
      .catch((e: Error) => setError(e.message));
  }, [token, router]);
  return (
    <div className="mx-auto max-w-sm py-12"><Card className="p-6">
      <h1 className="font-display text-3xl">{error ? 'Link not valid' : 'Confirming…'}</h1>
      {error ? <p className="mt-2 text-sm text-mute">{error} <Link href="/login" className="text-accent hover:underline">Sign in</Link> to request a new one.</p> : <Spinner className="mt-4" />}
    </Card></div>
  );
}
export default function VerifyPage() { return <Suspense><Verify /></Suspense>; }
