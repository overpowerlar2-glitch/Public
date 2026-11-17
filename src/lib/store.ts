'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const BOARD_THEMES = [
  { id: 'walnut', name: 'Walnut' }, { id: 'maple', name: 'Maple' }, { id: 'rosewood', name: 'Rosewood' }, { id: 'marble', name: 'Marble' },
  { id: 'stone', name: 'Stone' }, { id: 'slate', name: 'Slate' }, { id: 'glacier', name: 'Glacier' }, { id: 'moss', name: 'Moss' },
  { id: 'emerald', name: 'Emerald' }, { id: 'sand', name: 'Sand' }, { id: 'coral', name: 'Coral' }, { id: 'candy', name: 'Candy' },
  { id: 'dusk', name: 'Dusk' }, { id: 'ink', name: 'Ink' }, { id: 'midnight', name: 'Midnight' }, { id: 'cyber', name: 'Cyber' },
] as const;
export const PIECE_SETS = [
  { id: 'tabiya', name: 'Tabiya', credit: 'Original' }, { id: 'royal', name: 'Royal', credit: 'Original' },
  { id: 'glass', name: 'Glass', credit: 'Original' }, { id: 'geo', name: 'Geo', credit: 'Original' },
  { id: 'chessnut', name: 'Chessnut', credit: 'Alexis Luengas · Apache 2.0' }, { id: 'fantasy', name: 'Fantasy', credit: 'Maurizio Monge · MIT' },
  { id: 'spatial', name: 'Spatial', credit: 'Maurizio Monge · MIT' }, { id: 'celtic', name: 'Celtic', credit: 'Maurizio Monge · MIT' },
  { id: 'firi', name: 'Firi', credit: 'James Faure · CC BY 4.0' }, { id: 'papercut', name: 'Papercut', credit: 'Nikolay Anzarov · CC BY 4.0' },
  { id: 'totoy', name: 'Totoy', credit: 'Kosal Sen · CC BY 4.0' }, { id: 'kiwen-suwi', name: 'Kiwen Suwi', credit: 'neverRare · CC BY 4.0' },
  { id: 'rhosgfx', name: 'Rhos', credit: 'RhosGFX · CC0' },
] as const;
export const ANIM_MS = { fast: 110, normal: 190, slow: 320 } as const;

export type Settings = {
  theme: 'dark' | 'light';
  board: (typeof BOARD_THEMES)[number]['id'];
  pieces: (typeof PIECE_SETS)[number]['id'];
  sound: boolean;
  volume: number; // 0..1
  animation: boolean;
  animSpeed: keyof typeof ANIM_MS;
  coords: boolean;
  legalDots: boolean;
  autoQueen: boolean;
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
};

export const SETTINGS_KEY = 'tabiya-settings';

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: 'dark', board: 'walnut', pieces: 'chessnut', sound: true, volume: 0.6, animation: true, animSpeed: 'normal', coords: true, legalDots: true, autoQueen: false,
      set: (patch) => set(patch),
    }),
    { name: SETTINGS_KEY },
  ),
);

/** Reflects appearance settings onto <html> so CSS variables switch instantly. */
export function applyAppearance(s: Pick<Settings, 'theme' | 'board' | 'animation'>) {
  const el = document.documentElement;
  el.dataset.theme = s.theme;
  el.dataset.board = s.board;
  el.dataset.anim = s.animation ? 'on' : 'off';
}
