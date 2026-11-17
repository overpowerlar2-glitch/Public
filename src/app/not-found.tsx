import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <p className="font-display text-7xl text-accent">404</p>
      <h1 className="mt-3 font-display text-3xl">This square is empty</h1>
      <p className="mt-2 text-sm text-mute">The page you were looking for does not exist or has moved.</p>
      <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-lg bg-accent px-5 text-sm font-medium text-accent-ink">Back to the board</Link>
    </div>
  );
}
