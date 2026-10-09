import mongoose from 'mongoose';
import { AuditLog, Registration, User, Workshop } from './models/index.js';

let memoryServer;

export async function connectDb(uri) {
  if (uri === 'memory') {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('workshops');
    console.log('Using in-memory MongoDB (data is lost on restart)');
  }
  await mongoose.connect(uri);
  // Make sure the unique / partial indexes exist before we accept traffic:
  // the duplicate-registration rule depends on them.
  await Promise.all([User, Workshop, Registration, AuditLog].map((m) => m.syncIndexes()));
  return uri;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
