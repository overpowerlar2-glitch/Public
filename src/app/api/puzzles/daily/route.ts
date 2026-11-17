import { ok, route } from '@/lib/api';
import { dailyPuzzle } from '@/lib/puzzles';
export const dynamic = 'force-dynamic';
export const GET = route(async () => ok(await dailyPuzzle()));
