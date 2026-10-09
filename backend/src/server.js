import { createApp } from './app.js';
import { config } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { seedDatabase } from './seed.js';
import { recountActiveRegistrations } from './services/registrationService.js';

async function main() {
  await connectDb(config.mongoUri);
  if (config.mongoUri === 'memory') await seedDatabase({ log: true });

  // Safety net for the (crash-only) case where a seat counter drifted.
  const { checked, fixed } = await recountActiveRegistrations();
  if (fixed) console.warn(`Recount corrected activeCount on ${fixed} of ${checked} workshops`);

  const server = createApp().listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`);
  });

  const shutdown = async () => {
    server.close();
    await disconnectDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
