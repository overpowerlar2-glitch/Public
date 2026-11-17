'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { Field, Input } from '@/components/ui';
import { api, useMe } from '@/lib/client';
import { Card } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function RegisterPage() {
  const tr = useT();
  const { domains } = useMe();
  const [f, setF] = useState({ username: '', email: '', password: '' });
  const [sent, setSent] = useState(false);
  const on = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  if (sent) return (
    <div className="mx-auto max-w-sm py-12"><Card className="p-6">
      <h1 className="font-display text-3xl">{tr("Check your inbox")}</h1>
      <p className="mt-2 text-sm text-mute">{tr("We sent a confirmation link to {email}. Open it to activate your account. The link expires in 24 hours.", { email: f.email })}</p>
      <Link href="/login" className="mt-5 inline-block text-sm font-medium text-accent hover:underline">{tr("Back to sign in")}</Link>
    </Card></div>
  );
  const hint = domains.length ? tr('Use your {domains} work address.', { domains: domains.map((d) => '@' + d).join(' · ') }) : undefined;
  return (
    <AuthCard title={tr("Create your account")} sub={domains.length ? tr('Tabiya is private to {domains} accounts.', { domains: domains.map((d) => '@' + d).join(' · ') }) : tr('Free, with rated games, puzzle ratings and your full game history.')} submit={tr("Create account")}
      onSubmit={async () => {
        const r = await api<{ verify?: boolean }>('/api/auth/register', { method: 'POST', body: f });
        if (r.verify) return setSent(true);
        window.location.assign('/');
      }}
      footer={<>{tr("Already have an account?")} <Link href="/login" className="font-medium text-accent hover:underline">{tr("Sign in")}</Link></>}>
      <Field label={tr("Username")} hint={tr("3–20 characters. Letters, numbers, - and _.")}><Input value={f.username} onChange={on('username')} autoComplete="username" autoFocus required maxLength={20} /></Field>
      <Field label={tr("Email")} hint={hint}><Input type="email" value={f.email} onChange={on('email')} autoComplete="email" required /></Field>
      <Field label={tr("Password")} hint={tr("At least 8 characters.")}><Input type="password" value={f.password} onChange={on('password')} autoComplete="new-password" required /></Field>
    </AuthCard>
  );
}
