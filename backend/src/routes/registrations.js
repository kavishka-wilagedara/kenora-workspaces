import { Router } from 'express';
import { z } from 'zod';
import { REGISTRATION_STATUSES, ROLES } from '../constants.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { Registration, Workshop } from '../models/index.js';
import { cancelRegistration } from '../services/registrationService.js';
import { cleanQuery, escapeRegex, objectId, parseId } from '../utils/validation.js';
import { withSeats } from './workshops.js';

const router = Router();
router.use(authenticate, authorize(ROLES.MANAGER, ROLES.STAFF));

const historySchema = z.object({
  email: z.string().trim().max(200).optional(),
  workshop: objectId.optional(),
  status: z.enum(REGISTRATION_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// Full registration history, cancellations, with who did what and when.
router.get('/history', async (req, res) => {
  const user = historySchema.parse(cleanQuery(req.query));
  const filter = {};
  if (user.email) filter.attendeeEmail = new RegExp(escapeRegex(user.email.toLowerCase()), 'i');
  if (user.workshop) filter.workshop = user.workshop;
  if (user.status) filter.status = user.status;
  if (user.from || user.to) {
    // In same window can be register or cancell
    const range = {};
    if (user.from) range.$gte = user.from;
    if (user.to) range.$lte = user.to;
    filter.$or = [{ registeredAt: range }, { cancelledAt: range }];
  }

  const [items, total] = await Promise.all([
    Registration.find(filter)
      .sort({ registeredAt: -1, _id: -1 })
      .skip((user.page - 1) * user.limit)
      .limit(user.limit)
      .populate('workshop', 'code title startsAt location')
      .populate('registeredBy cancelledBy', 'name email')
      .lean(),
    Registration.countDocuments(filter),
  ]);
  res.json({ items, total, page: user.page, limit: user.limit });
});

const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() }).default({});

router.post('/:id/cancel', async (req, res) => {
  const registrationId = parseId(req.params.id);
  const { reason } = cancelSchema.parse(req.body ?? {});
  const { registration, promoted } = await cancelRegistration({ registrationId, actorId: req.user._id, reason });
  const workshop = await Workshop.findById(registration.workshop).lean();
  res.json({ registration, promoted, workshop: workshop && withSeats(workshop) });
});

export default router;
