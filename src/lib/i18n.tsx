'use client';
// Interface language. English strings are the keys; AR holds the Arabic for each.
// The choice lives in a cookie so the server renders the right language and direction on the first paint.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AR } from './i18n-ar';

export type Lang = 'en' | 'ar';
export const LANG_COOKIE = 'tabiya_lang';
type Vars = Record<string, string | number>;

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
export function translate(lang: Lang, s: string, vars?: Vars) {
  return fill(lang === 'ar' ? (AR[s] ?? s) : s, vars);
}

/* Server messages arrive in English; a few contain a variable part. */
const PATTERNS: [RegExp, string][] = [
  [/^This site is only for (.+) addresses\.$/, 'This site is only for {0} addresses.'],
];
export function translateMessage(lang: Lang, msg: string) {
  if (lang !== 'ar') return msg;
  if (AR[msg]) return AR[msg];
  for (const [re, key] of PATTERNS) { const m = msg.match(re); if (m) return fill(AR[key] ?? key, Object.fromEntries(m.slice(1).map((v, i) => [i, v]))); }
  return msg;
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, set] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    try { localStorage.setItem(LANG_COOKIE, l); } catch { /* storage unavailable */ }
    document.documentElement.lang = l;
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    set(l);
  }, []);
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
export function useT() {
  const { lang } = useContext(Ctx);
  return useCallback((s: string, vars?: Vars) => translate(lang, s, vars), [lang]);
}
/** For code outside React rendering (event handlers, fetch helpers): reads the language from the page. */
export function currentLang(): Lang {
  return typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar' : 'en';
}
export const tx = (s: string, vars?: Vars) => translate(currentLang(), s, vars);
