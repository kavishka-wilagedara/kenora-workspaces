import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate, signToken } from '../middleware/auth.js';
import { User } from '../models/index.js';
import { HttpError, unauthorized } from '../utils/errors.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

router.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw unauthorized('Incorrect email or password.');
  }
  if (!user.active) {
    throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account has been deactivated. Please contact an administrator.');
  }
  res.json({ token: signToken(user), user: user.toJSON() });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user.toJSON() });
});

export default router;
