'use client';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** One shared connection per tab. Cookies identify the player, so reconnect after sign-in/out. */
export function getSocket(): Socket {
  if (!socket) socket = io({ path: '/ws', transports: ['websocket', 'polling'], reconnectionDelay: 500, reconnectionDelayMax: 4000 });
  return socket;
}
export function resetSocket() {
  if (socket) { socket.disconnect(); socket.connect(); }
}
export function emitAck<T>(event: string, payload?: unknown, timeout = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    const cb = (err: Error | null, res: T) => (err ? reject(new Error('The server did not respond. Check your connection.')) : resolve(res));
    if (payload === undefined) s.timeout(timeout).emit(event, cb); else s.timeout(timeout).emit(event, payload, cb);
  });
}
