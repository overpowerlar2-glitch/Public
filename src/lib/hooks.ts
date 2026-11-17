'use client';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ChessEngine } from './engine';
import { createEngine } from './engine-factory';

export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const h = () => setActive(document.fullscreenElement === ref.current && !!ref.current);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, [ref]);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else ref.current?.requestFullscreen?.().catch(() => {});
  }, [ref]);
  return { active, toggle };
}

/** Lazily creates one Stockfish worker for the lifetime of the component. */
export function useEngine() {
  const ref = useRef<ChessEngine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const get = useCallback(() => {
    if (!ref.current && typeof Worker !== 'undefined') {
      try { ref.current = createEngine(); ref.current.ready.catch((e: Error) => setError(e.message)); }
      catch { queueMicrotask(() => setError('Your browser could not start the chess engine.')); }
    }
    return ref.current;
  }, []);
  useEffect(() => () => { ref.current?.destroy(); ref.current = null; }, []);
  return { get, error };
}

export const ANALYSIS_HANDOFF = 'tabiya-analysis-pgn';
