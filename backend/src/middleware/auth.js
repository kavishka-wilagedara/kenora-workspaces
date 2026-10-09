import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/index.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export function signToken(user) {
  return jwt.sign({ 
      sub: String(user._id), 
      role: user.role 
    }, 
    config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    }
  );
}

// Verifies the Bearer token and loads the user 
export async function authenticate(req, _res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw unauthorized('Your account is not active. Please sign in again.');

  req.user = user;
  next();
}

// Allow only the listed roles
export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}
