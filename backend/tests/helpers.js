import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { AuditLog, Registration, User, Workshop } from '../src/models/index.js';

export const app = createApp({ logRequests: false });
export const api = () => request(app);

/** Spin up an isolated in-memory MongoDB for a test file and wipe it between tests. */
export function useTestDb() {
  let mongo;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([User, Workshop, Registration, AuditLog].map((m) => m.syncIndexes()));
  });
  beforeEach(async () => {
    await Promise.all([User, Workshop, Registration, AuditLog].map((m) => m.deleteMany({})));
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  });
}

export async function createUser(role, overrides = {}) {
  const email = overrides.email ?? `${role.toLowerCase()}-${new mongoose.Types.ObjectId()}@test.local`;
  const password = overrides.password ?? 'Password123!';
  const user = await User.create({
    name: overrides.name ?? `${role} user`,
    email,
    role,
    active: overrides.active ?? true,
    passwordHash: await bcrypt.hash(password, 4),
  });
  return { user, email, password };
}

/** Create a user and log in through the real endpoint; returns the Bearer header value. */
export async function loginAs(role, overrides) {
  const { user, email, password } = await createUser(role, overrides);
  const res = await api().post('/api/auth/login').send({ email, password }).expect(200);
  return { user, auth: `Bearer ${res.body.token}` };
}

export async function createWorkshop(overrides = {}) {
  const startsAt = new Date(Date.now() + 2 * 86400_000);
  return Workshop.create({
    code: `WS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Test workshop',
    instructor: 'Instructor',
    location: 'Northside Centre',
    startsAt,
    endsAt: new Date(startsAt.getTime() + 2 * 3600_000),
    capacity: 10,
    ...overrides,
  });
}
