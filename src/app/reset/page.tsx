'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard } from '@/components/auth-card';
import { Empty, Field, Input, toast } from '@/components/ui';
import { api } from '@/lib/client';

function Reset() {
  const token = useSearchParams().get('token');
  const router = useRouter();
  const [password, setPassword] = useState('');
  if (!token) return <div className="mx-auto max-w-sm py-12"><Empty title="This reset link is incomplete"><Link href="/forgot" className="text-accent hover:underline">Request a new one</Link></Empty></div>;
  return (
    <AuthCard title="Choose a new password" submit="Update password"
      onSubmit={async () => { await api('/api/auth/reset', { method: 'POST', body: { token, password } }); toast.success('Password updated. Sign in with your new password.'); router.push('/login'); }}>
      <Field label="New password" hint="At least 8 characters."><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus required /></Field>
    </AuthCard>
  );
}
export default function ResetPage() { return <Suspense><Reset /></Suspense>; }
