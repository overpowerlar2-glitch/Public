// Checks the private-site mode. Start the server with ALLOWED_EMAIL_DOMAINS set and no SMTP_URL
// (so confirmation links are printed to its log), then: node scripts/e2e-private.mjs <base url> <server log file> <domain>
import fs from 'node:fs';
import { io } from 'socket.io-client';
const [base = 'http://localhost:3000', logFile = '/tmp/prod.log', domain = 'totersapp.com'] = process.argv.slice(2);
const tag = Date.now().toString(36).slice(-5);
let failed = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) failed++; };
const post = (path, body, cookie) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (res) => res.headers.getSetCookie().map((c) => c.split(';')[0]).filter((c) => c.startsWith('tabiya_sid=') && c.length > 12).join('; ');
const linkFor = async (email) => { for (let i = 0; i < 30; i++) { const m = [...fs.readFileSync(logFile, 'utf8').matchAll(new RegExp(`To: ${email.replace('.', '\\.')}[\\s\\S]*?verify\\?token=([\\w-]+)`, 'g'))].pop(); if (m) return m[1]; await new Promise((r) => setTimeout(r, 200)); } return null; };
const socketOk = (cookie) => new Promise((resolve) => {
  const s = io(base, { path: '/ws', transports: ['websocket'], extraHeaders: cookie ? { cookie } : {}, forceNew: true, reconnection: false });
  s.on('hello', () => { s.disconnect(); resolve(true); });
  s.on('connect_error', () => { s.disconnect(); resolve(false); });
});

const outsider = await post('/api/auth/register', { username: `out_${tag}`, email: `out_${tag}@gmail.com`, password: 'correct-horse-9' });
check('other domains cannot register', outsider.status === 403, (await outsider.json()).error);
const lookalike = await post('/api/auth/register', { username: `fake_${tag}`, email: `fake_${tag}@${domain}.evil.com`, password: 'correct-horse-9' });
check('look-alike domains rejected', lookalike.status === 403);

const email = `emp_${tag}@${domain}`;
const reg = await post('/api/auth/register', { username: `emp_${tag}`, email, password: 'correct-horse-9' });
const regBody = await reg.json();
check('employee address registers, but gets no session yet', reg.status === 201 && regBody.verify === true && !cookieOf(reg));
const early = await post('/api/auth/login', { login: email, password: 'correct-horse-9' });
check('sign-in refused until the email is confirmed', early.status === 403, (await early.json()).error);

const token = await linkFor(email);
check('confirmation link issued', !!token);
const bad = await post('/api/auth/verify', { token: 'x'.repeat(40) });
check('forged confirmation token rejected', bad.status === 400);
const ver = await post('/api/auth/verify', { token });
const cookie = cookieOf(ver);
check('confirming the email signs the employee in', ver.status === 200 && !!cookie);
const reuse = await post('/api/auth/verify', { token });
check('confirmation link works only once', reuse.status === 400);
const login = await post('/api/auth/login', { login: email, password: 'correct-horse-9' });
check('employee can sign in afterwards', login.status === 200 && !!cookieOf(login));

check('anonymous API calls refused', (await fetch(base + '/api/puzzles/next')).status === 401);
check('signed-in API calls allowed', (await fetch(base + '/api/puzzles/next', { headers: { cookie } })).status === 200);
const page = await fetch(base + '/play', { redirect: 'manual' });
check('anonymous page visit redirected to sign-in', page.status >= 300 && page.status < 400 && (page.headers.get('location') || '').includes('/login'), page.headers.get('location'));
check('signed-in page visit allowed', (await fetch(base + '/play', { headers: { cookie }, redirect: 'manual' })).status === 200);
check('guests cannot open a real-time connection', (await socketOk('tabiya_guest=guesttoken12345')) === false);
check('employees can', (await socketOk(cookie)) === true);
const me = await (await fetch(base + '/api/me')).json();
check('site reports its allowed domain', JSON.stringify(me.domains) === JSON.stringify([domain]));
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll private-mode checks passed');
process.exit(failed ? 1 : 0);
