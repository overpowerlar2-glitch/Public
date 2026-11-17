// Builds the browser-only edition into standalone/dist (index.html + app.js + app.css + assets).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import esbuild from 'esbuild';
const out = 'standalone/dist';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Absolute asset URLs become relative so the page works from any folder.
// Absolute asset URLs become relative so the page works from any folder. In the single-file
// build (window.__EMBED present) pieces and the engine come from data embedded in the page instead.
const relativeAssets = { name: 'relative-assets', setup(b) {
  b.onLoad({ filter: /src[\\/].*\.tsx?$/ }, (a) => ({
    contents: fs.readFileSync(a.path, 'utf8')
      .replace(/`url\(\/pieces\/(.+?)\.svg\)`/g, '(window.__EMBED ? window.__EMBED.piece(`$1`) : `url(pieces/$1.svg)`)')
      .replaceAll('return ENGINE_URLS[i];', 'return window.__EMBED ? window.__EMBED.engine(i) : ENGINE_URLS[i];')
      .replaceAll("'/engine/", "'engine/"),
    loader: a.path.endsWith('x') ? 'tsx' : 'ts',
  }));
} };
await esbuild.build({
  entryPoints: ['standalone/main.tsx'], bundle: true, minify: true, format: 'iife', target: 'es2022', outfile: `${out}/app.js`,
  jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, logOverride: { 'module-level-directive': 'silent' },
  alias: { 'next/link': './standalone/shims/link.tsx', 'next/navigation': './standalone/shims/navigation.ts', '@/lib/engine-factory': './standalone/shims/engine-factory.ts', '@': './src' }, plugins: [relativeAssets],
});

// CSS: the app stylesheet with fonts served by Google Fonts instead of bundled files.
const css = fs.readFileSync('src/app/globals.css', 'utf8').replace(/@import '@fontsource[^;]+;\n/g, '').replace("'Geist Variable'", "'Geist'").replace("'Geist Mono Variable'", "'Geist Mono'");
fs.writeFileSync('standalone/app.css', css);
execSync(`npx @tailwindcss/cli -i standalone/app.css -o ${out}/app.css --minify`, { stdio: 'inherit' });
fs.rmSync('standalone/app.css');

for (const d of ['pieces', 'engine', 'sounds']) fs.cpSync(path.join('public', d), path.join(out, d), { recursive: true });
fs.mkdirSync(`${out}/data`);
fs.copyFileSync('public/data/openings.json', `${out}/data/openings.json`);
fs.copyFileSync('data/puzzles.json', `${out}/data/puzzles.json`);
fs.writeFileSync(`${out}/index.html`, `<!DOCTYPE html>
<html lang="en" data-theme="dark" data-board="walnut">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tabiya — chess in your browser</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="app.css">
<script>try{var s=JSON.parse(localStorage.getItem('tabiya-settings')||'{}').state||{};var d=document.documentElement;d.dataset.theme=s.theme||'dark';d.dataset.board=s.board||'walnut';d.dataset.anim=s.animation===false?'off':'on'}catch(e){}</script>
</head>
<body><div id="root"></div><script src="app.js"></script></body>
</html>
`);

// ── Single self-contained file: everything inlined, opens straight from disk ──
const b64 = (f) => fs.readFileSync(f).toString('base64');
const dirMap = (dir, ext, sub = '') => Object.fromEntries(fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? Object.entries(dirMap(path.join(dir, e.name), ext, sub + e.name + '/')) : e.name.endsWith(ext) ? [[sub + e.name.slice(0, -ext.length), b64(path.join(dir, e.name))]] : []));
const safeJson = (v) => JSON.stringify(v).replaceAll('</', '<\\/');
const embed = `<script>
(function(){
  var PIECES=${safeJson(dirMap('public/pieces', '.svg'))}, SOUNDS=${safeJson(dirMap('public/sounds', '.wav'))};
  var bytes=function(s){var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
  var text=function(id){return document.getElementById(id).textContent}, urls=[];
  window.__EMBED={
    piece:function(k){return 'url("data:image/svg+xml;base64,'+PIECES[k]+'")'},
    sound:function(n){return SOUNDS[n]?bytes(SOUNDS[n]).buffer:null},
    json:function(n){return JSON.parse(text('d-'+n))},
    // Build 0: the WASM engine, with its WASM bytes inside the worker script itself and every fetch answered
    // from them (no URL fragment, no cross-context blob fetch: both fail in some viewers). Build 1: plain-JS engine.
    engine:function(i){if(!urls[i]){var parts=i===0?["${process.env.TEST_BREAK_WASM ? 'self.WebAssembly=undefined;' : ''}var __w=atob('"+text('sf-wasm')+"'),__b=new Uint8Array(__w.length);for(var i=0;i<__w.length;i++)__b[i]=__w.charCodeAt(i);__w=null;self.fetch=function(){return Promise.resolve(new Response(__b,{headers:{'content-type':'application/wasm'}}))};",bytes(text('sf-js'))]:[bytes(text('sf-asm'))];urls[i]=URL.createObjectURL(new Blob(parts,{type:'text/javascript'}))}return urls[i]}
  };
})();
</script>`;
const page = fs.readFileSync(`${out}/index.html`, 'utf8')
  .replace('<link rel="stylesheet" href="app.css">', () => `<style>${fs.readFileSync(`${out}/app.css`, 'utf8')}</style>`)
  .replace('<script src="app.js"></script>', () => [
    `<script type="application/json" id="d-openings">${safeJson(JSON.parse(fs.readFileSync('public/data/openings.json', 'utf8')))}</script>`,
    `<script type="application/json" id="d-puzzles">${safeJson(JSON.parse(fs.readFileSync('data/puzzles.json', 'utf8')))}</script>`,
    `<script type="text/plain" id="sf-js">${b64('public/engine/stockfish-19-lite-single.js')}</script>`,
    `<script type="text/plain" id="sf-wasm">${b64('public/engine/stockfish-19-lite-single.wasm')}</script>`,
    `<script type="text/plain" id="sf-asm">${b64('public/engine/stockfish-19-asm.js')}</script>`,
    embed,
    `<script>${fs.readFileSync(`${out}/app.js`, 'utf8').replaceAll('</script', '<\\/script')}</script>`,
  ].join('\n'));
fs.mkdirSync('standalone/single', { recursive: true });
fs.writeFileSync('standalone/single/tabiya.html', page);
console.log('built', out, 'and standalone/single/tabiya.html', (page.length / 1e6).toFixed(1) + ' MB');
