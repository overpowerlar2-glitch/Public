'use client';
import { useState } from 'react';
import Link from 'next/link';
import { AuthCard } from '@/components/auth-card';
import { Card, Field, Input } from '@/components/ui';
import { api } from '@/lib/client';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  if (sent) return (
    <div className="mx-auto max-w-sm py-12"><Card className="p-6">
      <h1 className="font-display text-3xl">Check your inbox</h1>
      <p className="mt-2 text-sm text-mute">If an account exists for <span className="text-ink">{email}</span>, a reset link is on its way. It expires in one hour.</p>
      <Link href="/login" className="mt-5 inline-block text-sm font-medium text-accent hover:underline">Back to sign in</Link>
    </Card></div>
  );
  return (
    <AuthCard title="Reset password" sub="Enter the email you signed up with and we'll send a reset link." submit="Send reset link"
      onSubmit={async () => { await api('/api/auth/forgot', { method: 'POST', body: { email } }); setSent(true); }}
      footer={<Link href="/login" className="hover:underline">Back to sign in</Link>}>
      <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required /></Field>
    </AuthCard>
  );
}
