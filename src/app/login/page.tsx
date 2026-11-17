'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { Button, Field, Input, toast } from '@/components/ui';
import { api, refreshMe, useMe } from '@/lib/client';
import { resetSocket } from '@/lib/socket';

function Login() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const { domains } = useMe();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);
  async function resend() {
    if (!login.includes('@')) return toast.info('Enter your email address above, then press resend.');
    setResending(true);
    try { await api('/api/auth/resend', { method: 'POST', body: { email: login } }); toast.success('A new confirmation link is on its way.'); }
    catch (e) { toast.error((e as Error).message); } finally { setResending(false); }
  }
  return (
    <AuthCard title="Welcome back" sub={domains.length ? `Private to ${domains.map((d) => '@' + d).join(' and ')} accounts.` : undefined} submit="Sign in"
      onSubmit={async () => {
        setUnverified(false);
        try {
          const u = await api<{ username: string }>('/api/auth/login', { method: 'POST', body: { login, password } });
          await refreshMe(); resetSocket(); toast.success(`Signed in as ${u.username}.`);
          router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
        } catch (e) { if ((e as Error).message.startsWith('Confirm your email')) setUnverified(true); throw e; }
      }}
      footer={<>New to Tabiya? <Link href="/register" className="font-medium text-accent hover:underline">Create an account</Link></>}>
      <Field label="Username or email"><Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoFocus required /></Field>
      <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></Field>
      <p className="-mt-1 text-right text-[13px]"><Link href="/forgot" className="text-mute hover:text-ink hover:underline">Forgot your password?</Link></p>
      {unverified && <Button type="button" size="sm" variant="ghost" className="w-full" loading={resending} onClick={resend}>Resend confirmation email</Button>}
    </AuthCard>
  );
}
export default function LoginPage() { return <Suspense><Login /></Suspense>; }
