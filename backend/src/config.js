import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET || 'secret-key',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS) || 10,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
