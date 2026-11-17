'use client';
import { useT } from '@/lib/i18n';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const tr = useT();
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="font-display text-3xl">{tr("Something went wrong")}</h1>
      <p className="mt-2 text-sm text-mute">{error.message || 'An unexpected error occurred.'}</p>
      <button onClick={reset} className="mt-6 inline-flex h-10 items-center rounded-lg bg-accent px-5 text-sm font-medium text-accent-ink">{tr("Try again")}</button>
    </div>
  );
}
