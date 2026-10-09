import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { HttpError } from '../utils/errors.js';

function send(res, status, code, message, details) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  res.status(status).json({ error });
}

export function notFoundHandler(req, res) {
  send(res, 404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`);
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) return send(res, err.status, err.code, err.message, err.details);

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({ 
      field: issue.path.join('.'), 
      message: issue.message 
    }));
    const first = details[0];
    const message = first 
      ? `${first.field ? `${first.field}: ` : ''}${first.message}` 
      : 'Invalid input';
    return send(res, 400, 'VALIDATION_ERROR', message, details);
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((err) => ({ 
      field: err.path, 
      message: err.message 
    }));
    return send(res, 400, 'VALIDATION_ERROR', details[0]?.message || 'Invalid input', details);
  }

  if (err instanceof mongoose.Error.CastError) {
    return send(res, 400, 'INVALID_ID', `Invalid value for ${err.path}`);
  }

  console.error(err);
  return send(res, 500, 'INTERNAL', 'Something went wrong. Please try again.');
}
