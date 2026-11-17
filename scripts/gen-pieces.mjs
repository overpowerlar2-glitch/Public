// Generates Tabiya's original piece sets (public/pieces/<set>/<wK..bP>.svg).
// Each piece is a union of simple shapes. The outline is drawn by stroking the whole group
// first and filling it on top, so overlapping shapes merge into one clean silhouette.
import fs from 'node:fs';

/* ── Geometry: Staunton-inspired silhouettes on the standard 45×45 grid ── */
const base = '<rect x="9" y="36.5" width="27" height="4" rx="1.6"/><rect x="11.5" y="33.5" width="22" height="4" rx="1.4"/>';
const STAUNTON = {
  p: {
    body: `${base}<path d="M14.5 34 C15 28 17.5 24.5 20 22.5 L25 22.5 C27.5 24.5 30 28 30.5 34 Z"/><ellipse cx="22.5" cy="21.6" rx="6" ry="1.9"/><circle cx="22.5" cy="14.2" r="5.6"/>`,
    detail: '',
  },
  r: {
    body: `${base}<path d="M14 34 L15.4 16.5 L29.6 16.5 L31 34 Z"/><rect x="12" y="13" width="21" height="4.6" rx="1"/><rect x="12" y="6.5" width="5.2" height="8" rx="0.8"/><rect x="19.9" y="6.5" width="5.2" height="8" rx="0.8"/><rect x="27.8" y="6.5" width="5.2" height="8" rx="0.8"/>`,
    detail: '<path d="M15.2 18.6 H29.8 M14.4 31.4 H30.6"/>',
  },
  n: {
    body: `${base}<path d="M13 34 C13.6 29.6 16 26.4 19.6 24.2 C16.4 25.6 13.4 26.6 11 26.4 C8.8 26.2 7.2 24.6 6.8 22.8 C6.5 21.4 7 20.1 8.1 19.1 L14.6 12.4 C15.8 11 16.8 9.8 18 8.6 L19.7 4.6 L22.3 8.2 C27.8 8.8 31.6 11.6 33.6 16 C35.8 21 35.8 27.5 34.3 34 Z"/>`,
    detail: '<path d="M22.6 9.4 C27.4 11 30.6 14.4 31.8 19.6 M10.6 20.6 L12.6 18.8"/><circle cx="16.2" cy="14.6" r="1.25" class="dot"/><circle cx="9.4" cy="22.6" r="0.85" class="dot"/>',
  },
  b: {
    body: `${base}<path d="M15.5 34 C15.5 30 16.5 28 18.5 27 L26.5 27 C28.5 28 29.5 30 29.5 34 Z"/><ellipse cx="22.5" cy="27" rx="7.2" ry="2.2"/><path d="M16.2 26.4 C13.2 22 14.2 16 22.5 9.2 C30.8 16 31.8 22 28.8 26.4 Z"/><circle cx="22.5" cy="7.4" r="2.7"/>`,
    detail: '<path d="M19.8 15.4 L25.8 21.4"/>',
  },
  q: {
    body: `${base}<path d="M13.2 34 L10.4 15.5 L16.2 24.6 L16.8 12.8 L22.5 23.2 L28.2 12.8 L28.8 24.6 L34.6 15.5 L31.8 34 Z"/><circle cx="10.2" cy="13.6" r="2.4"/><circle cx="16.6" cy="10.9" r="2.4"/><circle cx="22.5" cy="8.6" r="2.5"/><circle cx="28.4" cy="10.9" r="2.4"/><circle cx="34.8" cy="13.6" r="2.4"/>`,
    detail: '<path d="M13.6 30.6 C19.5 29.2 25.5 29.2 31.4 30.6"/>',
  },
  k: {
    body: `${base}<path d="M14 34 L12.6 22.4 C12.4 18.6 16.4 15.6 22.5 15.6 C28.6 15.6 32.6 18.6 32.4 22.4 L31 34 Z"/><rect x="20.9" y="3.4" width="3.2" height="13" rx="0.8"/><rect x="17.6" y="6.4" width="9.8" height="3.2" rx="0.8"/>`,
    detail: '<path d="M13.4 30.6 C19.4 29 25.6 29 31.6 30.6 M13.2 23.4 C19.4 21.6 25.6 21.6 31.8 23.4"/>',
  },
};

/* ── Geometry: modern geometric silhouettes ── */
const gbase = '<rect x="10" y="35" width="25" height="5.5" rx="2.75"/>';
const GEO = {
  p: { body: `${gbase}<path d="M15 35.5 C15 29 18 25.5 22.5 25.5 C27 25.5 30 29 30 35.5 Z"/><circle cx="22.5" cy="17" r="6.2"/>`, detail: '' },
  r: { body: `${gbase}<rect x="14" y="16" width="17" height="20" rx="1.2"/><path d="M12 8 H17.4 V11.4 H20.1 V8 H24.9 V11.4 H27.6 V8 H33 V17.5 H12 Z"/>`, detail: '<path d="M14 22.5 H31"/>' },
  n: { body: `${gbase}<path d="M14 35.5 L15.5 27.5 L9 24.5 L8.5 18.5 L17 10.5 L19 5.5 L22 9.5 C30 9.5 34.5 15.5 34.5 23 L33 35.5 Z"/>`, detail: '<circle cx="17.2" cy="15.6" r="1.4" class="dot"/><path d="M22.6 12 L30 19.5"/>' },
  b: { body: `${gbase}<path d="M16.5 35.5 L17.5 29.5 L27.5 29.5 L28.5 35.5 Z"/><path d="M22.5 6.5 C28.5 12 31.5 17 31.5 22 C31.5 27 27.5 30 22.5 30 C17.5 30 13.5 27 13.5 22 C13.5 17 16.5 12 22.5 6.5 Z"/>`, detail: '<path d="M19 14.5 L26 21.5"/>' },
  q: { body: `${gbase}<path d="M13 35.5 L11 13 L17.5 21 L22.5 9 L27.5 21 L34 13 L32 35.5 Z"/><circle cx="11" cy="11.5" r="2.6"/><circle cx="22.5" cy="7" r="2.8"/><circle cx="34" cy="11.5" r="2.6"/>`, detail: '<path d="M13.6 29 H31.4"/>' },
  k: { body: `${gbase}<path d="M13.5 35.5 L12.5 21 C12.5 17.5 16.5 15 22.5 15 C28.5 15 32.5 17.5 32.5 21 L31.5 35.5 Z"/><path d="M21 3.5 H24 V7 H27.5 V10 H24 V15.5 H21 V10 H17.5 V7 H21 Z"/>`, detail: '<path d="M13 23.5 H32"/>' },
};

/* ── Styles: colours for each side ── */
const STYLES = {
  // Clean ivory and charcoal with soft vertical shading.
  tabiya: { geo: STAUNTON, w: ['#ffffff', '#e6dfd1', '#1b1b1d', '#1b1b1d'], b: ['#55555c', '#17171a', '#0b0b0c', '#d8d3c8'], sw: 3 },
  // Ivory and ebony with gold trim.
  royal: { geo: STAUNTON, w: ['#fffaf0', '#e9d9b6', '#5a4210', '#b8860b'], b: ['#3b2f2a', '#120d0b', '#0a0706', '#e2b13c'], sw: 3, gold: true },
  // Flat geometric pieces, bold outline.
  geo: { geo: GEO, w: ['#f7f4ee', '#f7f4ee', '#161618', '#161618'], b: ['#2b2c31', '#2b2c31', '#0c0c0d', '#f0ece4'], sw: 3.4 },
  // Glossy glass: frosted white and deep sapphire.
  glass: { geo: STAUNTON, w: ['#ffffff', '#cfe3f2', '#29455e', '#29455e'], b: ['#3d6fb0', '#0c1f3e', '#071429', '#bcd6f5'], sw: 3, gloss: true },
};

function svg(style, color, type) {
  const st = STYLES[style], [top, bottom, outline, detail] = st[color], g = st.geo[type];
  const id = `${style}${color}${type}`;
  // Glass: a soft highlight band down the left side, clipped to the silhouette.
  const gloss = st.gloss
    ? `<linearGradient id="h${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0.18" stop-color="#fff" stop-opacity="0"/><stop offset="0.3" stop-color="#fff" stop-opacity="${color === 'w' ? 0.9 : 0.42}"/><stop offset="0.44" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="c${id}">${g.body}</clipPath><rect width="45" height="45" fill="url(#h${id})" clip-path="url(#c${id})"/>`
    : '';
  const sheen = st.gold && color === 'b' ? `<clipPath id="c${id}">${g.body}</clipPath><rect x="0" y="33" width="45" height="1.4" fill="${detail}" opacity="0.9" clip-path="url(#c${id})"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45">
<defs><linearGradient id="g${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
<g stroke="${outline}" stroke-width="${st.sw}" stroke-linejoin="round" fill="${outline}">${g.body}</g>
<g fill="url(#g${id})">${g.body}</g>
${gloss}${sheen}
<g fill="none" stroke="${detail}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${g.detail.replace(/class="dot"/g, `fill="${detail}" stroke="none"`)}</g>
</svg>`;
}

for (const style of Object.keys(STYLES)) {
  const dir = `public/pieces/${style}`;
  fs.mkdirSync(dir, { recursive: true });
  for (const c of ['w', 'b']) for (const t of 'kqrbnp') fs.writeFileSync(`${dir}/${c}${t.toUpperCase()}.svg`, svg(style, c, t));
}
console.log('generated', Object.keys(STYLES).join(', '));
