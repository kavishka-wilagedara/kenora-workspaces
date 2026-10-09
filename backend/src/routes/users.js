import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { ROLE_LIST, ROLES } from '../constants.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { User } from '../models/index.js';
import { diff, recordAudit } from '../services/audit.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { parseId } from '../utils/validation.js';

const router = Router();
router.use(authenticate, authorize(ROLES.ADMIN));

const password = z.string().min(8, 'Password must be at least 8 characters').max(100);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  role: z.enum(ROLE_LIST),
  password,
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    role: z.enum(ROLE_LIST).optional(),
    active: z.boolean().optional(),
    password: password.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

router.get('/', async (_req, res) => {
  const users = await User.find().sort({ name: 1 });
  res.json({ items: users });
});

router.post('/', async (req, res) => {
  const { password: pw, ...data } = createSchema.parse(req.body);
  if (await User.exists({ email: data.email })) {
    throw conflict('DUPLICATE', 'A user with this email already exists.');
  }
  const user = await User.create({ ...data, passwordHash: await bcrypt.hash(pw, config.bcryptRounds) });
  await recordAudit({
    actor: req.user._id,
    action: 'USER_CREATED',
    entityType: 'USER',
    entityId: user._id,
    entityLabel: user.email,
    changes: { name: user.name, email: user.email, role: user.role },
  });
  res.status(201).json({ user });
});

router.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const body = updateSchema.parse(req.body);

  // User cant deactivate and delete own role 
  if (req.user._id.equals(id)) {
    if (body.role && body.role !== ROLES.ADMIN) throw badRequest('You cannot change your own role.');
    if (body.active === false) throw badRequest('You cannot deactivate your own account.');
  }

  const before = await User.findById(id);
  if (!before) throw notFound('User not found.');

  const update = {};
  for (const user of ['name', 'role', 'active']) if (body[user] !== undefined) update[user] = body[user];
  if (body.password) update.passwordHash = await bcrypt.hash(body.password, config.bcryptRounds);

  const user = await User.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });

  const base = { actor: req.user._id, entityType: 'USER', entityId: user._id, entityLabel: user.email };
  const changes = diff(before, user, ['name', 'role', 'active']);
  if (changes.role) await recordAudit({ ...base, action: 'ROLE_CHANGED', changes: { role: changes.role } });
  if (changes.active) {
    await recordAudit({
      ...base,
      action: user.active ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
      changes: { active: changes.active },
    });
  }
  if (changes.name) await recordAudit({ ...base, action: 'USER_UPDATED', changes: { name: changes.name } });
  if (body.password) await recordAudit({ ...base, action: 'PASSWORD_RESET' });

  res.json({ user });
});

export default router;
