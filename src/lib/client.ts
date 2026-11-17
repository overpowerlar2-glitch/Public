'use client';
import useSWR, { mutate } from 'swr';

export async function api<T = unknown>(path: string, init?: Omit<RequestInit, 'body'> & { body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init, credentials: 'same-origin',
      headers: init?.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch { throw new Error('Could not reach the server. Check your connection and try again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status}).`);
  return data as T;
}

export type Me = {
  id: number; username: string; email: string; role: string; status: string; avatar: string | null; country: string; bio: string;
  ratings: Record<string, { rating: number; games: number }>;
};
export function useMe() {
  const { data, isLoading } = useSWR<{ user: Me | null; domains?: string[] }>('/api/me', api, { revalidateOnFocus: false });
  const domains = data?.domains ?? [];
  return { me: data?.user ?? null, loading: isLoading, ready: !!data, domains, restricted: domains.length > 0 };
}
export const refreshMe = () => mutate('/api/me');
