import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { connectDb, disconnectDb } from './db.js';
import { AuditLog, Registration, User, Workshop } from './models/index.js';
import { recountActiveRegistrations } from './services/registrationService.js';

// Dev-only credentials (also listed in the README).
export const SEED_USERS = [
  { name: 'Ada Admin', email: 'admin@example.com', password: 'Admin123!', role: 'ADMIN' },
  { name: 'Morgan Manager', email: 'manager@example.com', password: 'Manager123!', role: 'MANAGER' },
  { name: 'Sam Staff', email: 'staff@example.com', password: 'Staff123!', role: 'STAFF' },
];

/** A date `days` from today at hh:mm local time. */
function at(days, hh, mm = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hh, mm, 0, 0);
  return d;
}

const hours = (d, h) => new Date(d.getTime() + h * 3600_000);

const PEOPLE = [
  'Alex Chen', 'Priya Patel', 'Jordan Smith', 'Maria Garcia', 'Liam O\'Brien', 'Fatima Khan',
  'Noah Williams', 'Sofia Rossi', 'Kenji Tanaka', 'Amara Okafor', 'Ella Johnson', 'Mateo Silva',
];
const person = (i) => {
  const name = PEOPLE[i % PEOPLE.length];
  return { attendeeName: name, attendeeEmail: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com` };
};

export async function seedDatabase({ log = false } = {}) {
  await Promise.all([User, Workshop, Registration, AuditLog].map((m) => m.deleteMany({})));

  const users = {};
  for (const u of SEED_USERS) {
    const passwordHash = await bcrypt.hash(u.password, config.bcryptRounds);
    users[u.role] = await User.create({ name: u.name, email: u.email, role: u.role, passwordHash });
  }
  const manager = users.MANAGER._id;
  const staff = users.STAFF._id;

  // Times are relative to "now" so the data always looks current. Booked counts are the
  // number of ACTIVE registrations to create.
  const plan = [
    { code: 'POT-101', title: 'Intro to Wheel Throwing', instructor: 'Hana Ito', location: 'Northside Centre', startsAt: at(1, 10), len: 2, capacity: 8, booked: 7, note: 'nearly full' },
    { code: 'COD-201', title: 'Python for Beginners', instructor: 'Dev Raman', location: 'Downtown Centre', startsAt: at(2, 18), len: 2, capacity: 20, booked: 5, cancelled: 1 },
    { code: 'FIT-110', title: 'Saturday Bootcamp', instructor: 'Chris Cole', location: 'Riverside Centre', startsAt: at(3, 9), len: 1, capacity: 6, booked: 6, waitlisted: 2, note: 'full' },
    { code: 'ART-130', title: 'Watercolour Landscapes', instructor: 'Lena Park', location: 'Northside Centre', startsAt: at(4, 14), len: 2, capacity: 10, booked: 0, status: 'CANCELLED' },
    { code: 'POT-102', title: 'Hand-building Basics', instructor: 'Hana Ito', location: 'Northside Centre', startsAt: at(5, 13), len: 2, capacity: 10, booked: 3 },
    { code: 'FIT-120', title: 'Yoga Flow', instructor: 'Asha Mehta', location: 'Riverside Centre', startsAt: at(6, 8), len: 1, capacity: 12, booked: 4 },
    { code: 'COD-210', title: 'Build Your First Website', instructor: 'Dev Raman', location: 'Downtown Centre', startsAt: at(8, 18), len: 3, capacity: 15, booked: 2 },
    { code: 'FIT-140', title: 'Pilates for Everyone', instructor: 'Asha Mehta', location: 'Riverside Centre', startsAt: at(10, 17), len: 1, capacity: 10, booked: 0 },
    { code: 'COD-150', title: 'Spreadsheet Skills', instructor: 'Tom Baker', location: 'Downtown Centre', startsAt: at(-3, 10), len: 2, capacity: 12, booked: 9, status: 'COMPLETED' },
  ];

  for (const p of plan) {
    const ws = await Workshop.create({
      code: p.code,
      title: p.title,
      instructor: p.instructor,
      location: p.location,
      startsAt: p.startsAt,
      endsAt: hours(p.startsAt, p.len),
      capacity: p.capacity,
      status: p.status ?? 'SCHEDULED',
      description: `${p.title} with ${p.instructor}. All materials provided.`,
      createdBy: manager,
      updatedBy: manager,
    });

    const regs = [];
    let i = 0;
    const base = new Date(Date.now() - 5 * 86400_000);
    const stamp = () => new Date(base.getTime() + i * 3600_000);
    for (let n = 0; n < p.booked; n++, i++) {
      regs.push({ ...person(i), workshop: ws._id, status: 'ACTIVE', registeredBy: i % 2 ? staff : manager, registeredAt: stamp() });
    }
    for (let n = 0; n < (p.cancelled ?? 0); n++, i++) {
      regs.push({
        ...person(i), workshop: ws._id, status: 'CANCELLED', registeredBy: staff, registeredAt: stamp(),
        cancelledBy: staff, cancelledAt: new Date(stamp().getTime() + 86400_000), cancelReason: 'Called to say they cannot make it',
      });
    }
    for (let n = 0; n < (p.waitlisted ?? 0); n++, i++) {
      regs.push({ ...person(i), workshop: ws._id, status: 'WAITLISTED', registeredBy: staff, registeredAt: stamp() });
    }
    if (regs.length) await Registration.insertMany(regs);
  }

  await recountActiveRegistrations();
  if (log) {
    console.log(`Seeded ${SEED_USERS.length} users and ${plan.length} workshops.`);
    for (const u of SEED_USERS) console.log(`  ${u.role.padEnd(8)} ${u.email} / ${u.password}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (config.mongoUri === 'memory') {
    console.log('MONGO_URI=memory seeds itself on startup; nothing to do.');
    process.exit(0);
  }
  await connectDb(config.mongoUri);
  await seedDatabase({ log: true });
  await disconnectDb();
}
