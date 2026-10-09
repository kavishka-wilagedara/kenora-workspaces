import { config } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { recountActiveRegistrations } from '../services/registrationService.js';

await connectDb(config.mongoUri);
const result = await recountActiveRegistrations();
console.log(`Checked ${result.checked} workshops, corrected ${result.fixed}.`);
await disconnectDb();
