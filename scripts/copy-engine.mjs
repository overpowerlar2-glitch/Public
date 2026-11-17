// Copies the Stockfish WASM engine (GPL-3.0, served as a separate worker file) into public/engine.
import fs from 'node:fs';
import path from 'node:path';
const src = path.join('node_modules', 'stockfish', 'bin');
const dst = path.join('public', 'engine');
if (fs.existsSync(src)) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src).filter((f) => f.includes('lite-single') || f.endsWith('-asm.js'))) fs.copyFileSync(path.join(src, f), path.join(dst, f));
}
