'use client';
import Link from 'next/link';
import { useT } from '@/lib/i18n';
export default function NotFound() {
  const tr = useT();
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="font-display text-7xl text-accent">404</p>
      <h1 className="mt-3 font-display text-3xl">{tr("This square is empty")}</h1>
      <p className="mt-2 text-sm text-mute">{tr("The page you were looking for does not exist or has moved.")}</p>
      <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-lg bg-accent px-5 text-sm font-medium text-accent-ink">{tr("Back to the board")}</Link>
    </div>
  );
}
