'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { Empty, Field, Input, toast } from '@/components/ui';
import { api } from '@/lib/client';
import { useT } from '@/lib/i18n';

function Reset() {
  const tr = useT();
  const token = useSearchParams().get('token');
  const router = useRouter();
  const [password, setPassword] = useState('');
  if (!token) return <div className="mx-auto max-w-sm py-12"><Empty title={tr("This reset link is incomplete")}><Link href="/forgot" className="text-accent hover:underline">{tr("Request a new one")}</Link></Empty></div>;
  return (
    <AuthCard title={tr("Choose a new password")} submit={tr("Update password")}
      onSubmit={async () => { await api('/api/auth/reset', { method: 'POST', body: { token, password } }); toast.success(tr('Password updated. Sign in with your new password.')); router.push('/login'); }}>
      <Field label={tr("New password")} hint={tr("At least 8 characters.")}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus required /></Field>
    </AuthCard>
  );
}
export default function ResetPage() { return <Suspense><Reset /></Suspense>; }
