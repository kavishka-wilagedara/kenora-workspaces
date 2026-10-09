import { Router } from 'express';
import { z } from 'zod';
import { LOCATIONS, REGISTRATION_STATUSES, ROLES, WORKSHOP_STATUSES } from '../constants.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { Registration, Workshop } from '../models/index.js';
import { diff, recordAudit } from '../services/audit.js';
import { promoteFromWaitlist, registerAttendee } from '../services/registrationService.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { cleanQuery, escapeRegex, parseId } from '../utils/validation.js';

const router = Router();
router.use(authenticate);

const canView = authorize(ROLES.MANAGER, ROLES.STAFF);
const canManage = authorize(ROLES.MANAGER);

const EDITABLE = [
  'code', 
  'title', 
  'instructor', 
  'location', 
  'startsAt', 
  'endsAt', 
  'capacity', 
  'status', 
  'description'
];

export function withSeats(w) {
  const obj = typeof w.toObject === 'function' ? w.toObject() : w;
  delete obj.__v;
  return { ...obj, seatsAvailable: Math.max(0, obj.capacity - obj.activeCount) };
}

const fields = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, 'Code must be 2-20 letters, numbers or dashes'),
  title: z.string().trim().min(1, 'Title is required').max(200),
  instructor: z.string().trim().min(1, 'Instructor is required').max(100),
  location: z.enum(LOCATIONS, { errorMap: () => ({ message: 'Choose one of the centres' }) }),
  startsAt: z.coerce.date({ errorMap: () => ({ message: 'Enter a valid start date and time' }) }),
  endsAt: z.coerce.date({ errorMap: () => ({ message: 'Enter a valid end date and time' }) }),
  capacity: z.coerce.number().int('Capacity must be a whole number').min(1, 'Capacity must be at least 1').max(1000),
  status: z.enum(WORKSHOP_STATUSES),
  description: z.string().trim().max(2000),
};

const createSchema = z
  .object({ ...fields, status: fields.status.default('SCHEDULED'), description: fields.description.optional() })
  .refine((w) => w.endsAt > w.startsAt, { message: 'End time must be after the start time', path: ['endsAt'] });

const updateSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const listSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(WORKSHOP_STATUSES).optional(),
  location: z.enum(LOCATIONS).optional(),
  hasSeats: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

router.get('/', canView, async (req, res) => {
  const q = listSchema.parse(cleanQuery(req.query));
  const filter = {};
  if (q.from || q.to) {
    filter.startsAt = {};
    if (q.from) filter.startsAt.$gte = q.from;
    if (q.to) filter.startsAt.$lte = q.to;
  }
  if (q.status) filter.status = q.status;
  if (q.location) filter.location = q.location;
  if (q.hasSeats === 'true') filter.$expr = { $lt: ['$activeCount', '$capacity'] };
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ code: rx }, { title: rx }, { instructor: rx }];
  }

  const [items, total] = await Promise.all([
    Workshop.find(filter)
      .sort({ startsAt: 1, _id: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Workshop.countDocuments(filter),
  ]);
  res.json({ items: items.map(withSeats), total, page: q.page, limit: q.limit });
});

router.get('/:id', canView, async (req, res) => {
  const id = parseId(req.params.id);
  const ws = await Workshop.findById(id).populate('createdBy updatedBy', 'name').lean();
  if (!ws) throw notFound('Workshop not found.');
  const waitlistCount = await Registration.countDocuments({ workshop: id, status: 'WAITLISTED' });
  res.json({ workshop: { ...withSeats(ws), waitlistCount } });
});

router.post('/', canManage, async (req, res) => {
  const data = createSchema.parse(req.body);
  if (await Workshop.exists({ code: data.code })) {
    throw conflict('DUPLICATE', `Workshop code ${data.code} is already in use.`);
  }
  const ws = await Workshop.create({ ...data, createdBy: req.user._id, updatedBy: req.user._id });
  await recordAudit({
    actor: req.user._id,
    action: 'WORKSHOP_CREATED',
    entityType: 'WORKSHOP',
    entityId: ws._id,
    entityLabel: ws.code,
    changes: Object.fromEntries(EDITABLE.map((f) => [f, ws[f]])),
  });
  res.status(201).json({ workshop: withSeats(ws) });
});

router.patch('/:id', canManage, async (req, res) => {
  const id = parseId(req.params.id);
  const body = updateSchema.parse(req.body);

  const before = await Workshop.findById(id).lean();
  if (!before) throw notFound('Workshop not found.');

  const startsAt = body.startsAt ?? before.startsAt;
  const endsAt = body.endsAt ?? before.endsAt;
  if (endsAt <= startsAt) {
    throw badRequest('End time must be after the start time', [
      { field: 'endsAt', message: 'End time must be after the start time' },
    ]);
  }

  if (body.code && body.code !== before.code && (await Workshop.exists({ code: body.code }))) {
    throw conflict('DUPLICATE', `Workshop code ${body.code} is already in use.`);
  }

  // Capacity nevr drop
  const filter = { _id: id };
  if (body.capacity !== undefined) filter.activeCount = { $lte: body.capacity };

  const ws = await Workshop.findOneAndUpdate(
    filter,
    { $set: { ...body, updatedBy: req.user._id } },
    { new: true, runValidators: true },
  );
  if (!ws) {
    const current = await Workshop.findById(id).lean();
    if (!current) throw notFound('Workshop not found.');
    throw conflict(
      'CAPACITY_BELOW_REGISTRATIONS',
      `Capacity cannot be lower than the ${current.activeCount} people already registered. Cancel registrations first.`,
      { activeCount: current.activeCount },
    );
  }

  const changes = diff(before, ws, EDITABLE);
  if (Object.keys(changes).length) {
    await recordAudit({
      actor: req.user._id,
      action: 'WORKSHOP_UPDATED',
      entityType: 'WORKSHOP',
      entityId: ws._id,
      entityLabel: ws.code,
      changes,
    });
  }

  // Waitlist user can booking
  if (changes.capacity || changes.status) await promoteFromWaitlist(id);
  const fresh = await Workshop.findById(id).lean();
  res.json({ workshop: withSeats(fresh) });
});

// Registrations for a workshop
const registerSchema = z.object({
  attendeeName: z.string().trim().min(1, 'Attendee name is required').max(100),
  attendeeEmail: z.string().trim().toLowerCase().email('Enter a valid email address'),
  joinWaitlist: z.boolean().optional(),
});

const listRegsSchema = z.object({
  status: z.enum([...REGISTRATION_STATUSES, 'all']).default('all'),
});

router.get('/:id/registrations', canView, async (req, res) => {
  const id = parseId(req.params.id);
  const { status } = listRegsSchema.parse(cleanQuery(req.query));
  if (!(await Workshop.exists({ _id: id }))) throw notFound('Workshop not found.');

  const filter = { workshop: id };
  if (status !== 'all') filter.status = status;
  const items = await Registration.find(filter)
    .sort({ registeredAt: 1, _id: 1 })
    .populate('registeredBy cancelledBy', 'name email')
    .lean();
  res.json({ items });
});

router.post('/:id/registrations', canView, async (req, res) => {
  const workshopId = parseId(req.params.id);
  const body = registerSchema.parse(req.body);
  const { registration, waitlisted } = await registerAttendee({
    workshopId,
    attendeeName: body.attendeeName,
    attendeeEmail: body.attendeeEmail,
    joinWaitlist: body.joinWaitlist,
    actorId: req.user._id,
  });
  const workshop = await Workshop.findById(workshopId).lean();
  res.status(201).json({ registration, waitlisted, workshop: withSeats(workshop) });
});

export default router;
