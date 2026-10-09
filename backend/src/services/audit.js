import { AuditLog } from '../models/index.js';

const toComparable = (v) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

/** Field-level diff: { field: { from, to } } for the fields that actually changed. */
export function diff(before, after, fields) {
  const changes = {};
  for (const f of fields) {
    if (toComparable(before?.[f]) !== toComparable(after?.[f])) {
      changes[f] = { from: before?.[f] ?? null, to: after?.[f] ?? null };
    }
  }
  return changes;
}

/** Audit writes are best-effort: a logging failure must never fail the user's action. */
export async function recordAudit({ actor, action, entityType, entityId, entityLabel, changes }) {
  try {
    await AuditLog.create({ actor, action, entityType, entityId, entityLabel, changes });
  } catch (err) {
    console.error('Failed to write audit log', err);
  }
}
