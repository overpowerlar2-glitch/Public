export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-12 w-64" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"><div className="skeleton aspect-square max-w-[640px]" /><div className="skeleton h-80" /></div>
    </div>
  );
}
