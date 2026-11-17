// The browser-only edition has no server, so the engine is always the built-in WASM Stockfish.
import { Engine, type ChessEngine } from '@/lib/engine';
export const createEngine = (): ChessEngine => new Engine();
