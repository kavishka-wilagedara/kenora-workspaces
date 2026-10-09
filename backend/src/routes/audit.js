import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '../constants.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { AuditLog } from '../models/index.js';
import { cleanQuery } from '../utils/validation.js';

const router = Router();

// Admins see account changes; managers see workshop changes. Each sees the area they own.
const SCOPE = { [ROLES.ADMIN]: 'USER', [ROLES.MANAGER]: 'WORKSHOP' };

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

router.get('/', authenticate, authorize(ROLES.ADMIN, ROLES.MANAGER), async (req, res) => {
  const { page, limit } = querySchema.parse(cleanQuery(req.query));
  const filter = { entityType: SCOPE[req.user.role] };
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ at: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('actor', 'name email role')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit });
});

export default router;
