'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { Card, Field, Input } from '@/components/ui';
import { api } from '@/lib/client';
import { useT } from '@/lib/i18n';

export default function ForgotPage() {
  const tr = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  if (sent) return (
    <div className="mx-auto max-w-sm py-12"><Card className="p-6">
      <h1 className="font-display text-3xl">{tr("Check your inbox")}</h1>
      <p className="mt-2 text-sm text-mute">{tr("If an account exists for {email}, a reset link is on its way. It expires in one hour.", { email })}</p>
      <Link href="/login" className="mt-5 inline-block text-sm font-medium text-accent hover:underline">{tr("Back to sign in")}</Link>
    </Card></div>
  );
  return (
    <AuthCard title={tr("Reset password")} sub={tr("Enter the email you signed up with and we'll send a reset link.")} submit={tr("Send reset link")}
      onSubmit={async () => { await api('/api/auth/forgot', { method: 'POST', body: { email } }); setSent(true); }}
      footer={<Link href="/login" className="hover:underline">{tr("Back to sign in")}</Link>}>
      <Field label={tr("Email")}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required /></Field>
    </AuthCard>
  );
}
