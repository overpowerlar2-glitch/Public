import { useMemo } from 'react';
import { useNav } from './nav-store';

export function useRouter() {
  const go = useNav((s) => s.go);
  return useMemo(() => ({ push: go, replace: go, back: () => history.back() }), [go]);
}
export const usePathname = () => useNav((s) => s.path);
export function useSearchParams() { const q = useNav((s) => s.search); return useMemo(() => new URLSearchParams(q), [q]); }
export const useParams = () => ({});
