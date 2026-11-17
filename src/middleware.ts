import { NextResponse, type NextRequest } from 'next/server';

// Private site: pages need a session cookie; anyone without one is sent to sign in.
// (The cookie is fully checked by the API and the game server; this only keeps outsiders off the pages.)
const OPEN = ['/login', '/register', '/forgot', '/reset', '/verify'];

export function middleware(req: NextRequest) {
  if (!(process.env.ALLOWED_EMAIL_DOMAINS || '').trim()) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (OPEN.includes(pathname) || req.cookies.get('tabiya_sid')) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login'; url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

// Pages only: API routes, static files, the engine, pieces, sounds and data are excluded.
export const config = { matcher: ['/((?!api|_next|engine|pieces|sounds|data|favicon).*)'], runtime: 'nodejs' };
