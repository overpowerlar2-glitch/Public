import type { TimeControl, Category } from './chess/time';

export type Color = 'w' | 'b';

export type PlayerInfo = {
  key: string;
  userId: number | null;
  name: string;
  guest: boolean;
  rating: number | null;
  avatar: string | null;
  country: string;
  online: boolean;
};

export type GameState = {
  id: string;
  status: 'waiting' | 'active' | 'finished' | 'aborted';
  tc: TimeControl;
  category: Category;
  rated: boolean;
  white: PlayerInfo | null;
  black: PlayerInfo | null;
  moves: string[]; // SAN
  fen: string;
  clock: { w: number; b: number; running: Color | null } | null; // ms remaining, as of `at`
  at: number; // server timestamp when this snapshot was taken
  result: '1-0' | '0-1' | '1/2-1/2' | null;
  reason: string | null;
  drawOffer: Color | null;
  ratingDiff: { w: number; b: number } | null;
  eco: string | null;
  opening: string | null;
  spectators: number;
  createdAt: number;
};

export type ChatMessage = { from: string; color: Color | null; text: string; at: number; system?: boolean };

export type LiveGameSummary = {
  id: string; white: string; black: string; whiteRating: number | null; blackRating: number | null;
  tc: TimeControl; category: Category; rated: boolean; fen: string; lastMove: string | null; plies: number;
};

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string; finished?: boolean };

export const REASONS: Record<string, string> = {
  checkmate: 'Checkmate', resign: 'Resignation', timeout: 'Time out', stalemate: 'Stalemate',
  agreement: 'Draw by agreement', repetition: 'Threefold repetition', insufficient: 'Insufficient material',
  fifty: 'Fifty-move rule', abandoned: 'Opponent left the game', aborted: 'Game aborted',
  'timeout-insufficient': 'Time out vs insufficient material',
};
