import { create } from 'zustand';

// Hash names (only plain #name survives in the host frame) ↔ app paths.
const HASH: Record<string, string> = { '/': 'home', '/play/computer': 'computer', '/analysis': 'analysis', '/puzzles': 'puzzles', '/openings': 'openings', '/settings': 'preferences', '/online': 'online' };
const PATH = Object.fromEntries(Object.entries(HASH).map(([p, h]) => [h, p]));
export const toHash = (path: string) => HASH[path] ?? 'online';

type Nav = { path: string; search: string; n: number; go: (url: string) => void };
const initial = PATH[location.hash.slice(1)] ?? '/';
export const useNav = create<Nav>((set) => ({
  path: initial, search: '', n: 0,
  go: (url) => {
    const [p, q = ''] = url.split('?');
    const path = HASH[p] ? p : '/online';
    set((s) => ({ path, search: q, n: s.n + 1 }));
    if (location.hash.slice(1) !== toHash(path)) location.hash = toHash(path);
    window.scrollTo(0, 0);
  },
}));
window.addEventListener('hashchange', () => {
  const path = PATH[location.hash.slice(1)] ?? '/';
  if (path !== useNav.getState().path) useNav.setState((s) => ({ path, search: '', n: s.n + 1 }));
});
