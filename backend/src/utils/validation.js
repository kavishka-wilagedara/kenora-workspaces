import { z } from 'zod';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export function cleanQuery(query) {
  return Object.fromEntries(Object.entries(query ?? {}).filter(([, v]) => v !== '' && v != null));
}

export function parseId(value) {
  return objectId.parse(value);
}

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
