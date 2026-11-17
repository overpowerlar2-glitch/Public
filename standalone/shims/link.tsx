import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { toHash, useNav } from './nav-store';

export default function Link({ href, children, onClick, ...p }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  const go = useNav((s) => s.go);
  return <a {...p} href={`#${toHash(href.split('?')[0])}`} onClick={(e) => { onClick?.(e); e.preventDefault(); go(href); }}>{children}</a>;
}
