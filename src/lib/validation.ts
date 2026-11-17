import { z } from 'zod';
export const username = z.string().trim().regex(/^[A-Za-z0-9_-]{3,20}$/, 'Usernames are 3–20 characters: letters, numbers, - and _.');
export const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);
export const password = z.string().min(8, 'Passwords need at least 8 characters.').max(200);
