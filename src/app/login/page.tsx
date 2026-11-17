'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { Button, Field, Input, toast } from '@/components/ui';
import { api, refreshMe, useMe } from '@/lib/client';
import { resetSocket } from '@/lib/socket';
import { useT } from '@/lib/i18n';

function Login() {
  const tr = useT();
  const next = useSearchParams().get('next');
  const { domains } = useMe();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);
  async function resend() {
    if (!login.includes('@')) return toast.info(tr('Enter your email address above, then press resend.'));
    setResending(true);
    try { await api('/api/auth/resend', { method: 'POST', body: { email: login } }); toast.success(tr('A new confirmation link is on its way.')); }
    catch (e) { toast.error((e as Error).message); } finally { setResending(false); }
  }
  return (
    <AuthCard title={tr("Welcome back")} sub={domains.length ? tr('Private to {domains} accounts.', { domains: domains.map((d) => '@' + d).join(' · ') }) : undefined} submit={tr("Sign in")}
      onSubmit={async () => {
        setUnverified(false);
        try {
          const u = await api<{ username: string }>('/api/auth/login', { method: 'POST', body: { login, password } });
          await refreshMe(); resetSocket(); void u;
          // Full page load, not client-side navigation: links prefetched while signed out are cached as
          // redirects to this page, and the client router would keep following them.
          window.location.assign(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
        } catch (e) { const m = (e as Error).message; if (m.startsWith('Confirm your email') || m === tr('Confirm your email address first — check your inbox for the link we sent.')) setUnverified(true); throw e; }
      }}
      footer={<>{tr("New to Tabiya?")} <Link href="/register" className="font-medium text-accent hover:underline">{tr("Create an account")}</Link></>}>
      <Field label={tr("Username or email")}><Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus required /></Field>
      <Field label={tr("Password")}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
      <p className="-mt-1 text-end text-[13px]"><Link href="/forgot" className="text-mute hover:text-ink hover:underline">{tr("Forgot your password?")}</Link></p>
      {unverified && <Button type="button" size="sm" variant="ghost" className="w-full" loading={resending} onClick={resend}>{tr("Resend confirmation email")}</Button>}
    </AuthCard>
  );
}
export default function LoginPage() { return <Suspense><Login /></Suspense>; }
