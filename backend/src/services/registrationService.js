import { Registration, Workshop } from '../models/index.js';
import { conflict, notFound } from '../utils/errors.js';

/**
 * THE CAPACITY RULE
 *
 * A seat is taken by a single atomic conditional update on the workshop document:
 * "increment activeCount only if activeCount < capacity". MongoDB applies single-document
 * updates atomically, so when N requests race for the last seat exactly one matches the
 * filter and the rest get null. No read-then-write gap exists to exploit, and it does not
 * need transactions or a replica set.
 */
async function reserveSeat(workshopId, now = new Date()) {
  return Workshop.findOneAndUpdate(
    {
      _id: workshopId,
      status: 'SCHEDULED',
      endsAt: { $gt: now },
      $expr: { $lt: ['$activeCount', '$capacity'] },
    },
    { $inc: { activeCount: 1 } },
    { new: true },
  );
}

/** Give a seat back. Guarded so the counter can never go negative. */
async function releaseSeat(workshopId) {
  await Workshop.updateOne({ _id: workshopId, activeCount: { $gt: 0 } }, { $inc: { activeCount: -1 } });
}

/** Work out *why* a reservation failed so staff get a useful message. */
async function explainReserveFailure(workshopId, now) {
  const ws = await Workshop.findById(workshopId).lean();
  if (!ws) throw notFound('Workshop not found.');
  if (ws.status !== 'SCHEDULED') {
    throw conflict('WORKSHOP_NOT_OPEN', `This workshop is ${ws.status.toLowerCase()} and is not taking registrations.`);
  }
  if (ws.endsAt <= now) throw conflict('WORKSHOP_ENDED', 'This workshop has already finished.');
  return ws; // it exists and is open, so it must be full
}

function alreadyRegistered(email, status) {
  return conflict(
    'ALREADY_REGISTERED',
    status === 'WAITLISTED'
      ? `${email} is already on the waitlist for this workshop.`
      : `${email} is already registered for this workshop.`,
  );
}

export async function registerAttendee({ workshopId, attendeeName, attendeeEmail, actorId, joinWaitlist = false }) {
  const email = attendeeEmail.trim().toLowerCase();
  const now = new Date();

  // Friendly early check. Not relied on for correctness: the partial unique indexes are.
  const existing = await Registration.findOne({
    workshop: workshopId,
    attendeeEmail: email,
    status: { $in: ['ACTIVE', 'WAITLISTED'] },
  }).lean();
  if (existing) throw alreadyRegistered(email, existing.status);

  const ws = await reserveSeat(workshopId, now);
  if (!ws) {
    const full = await explainReserveFailure(workshopId, now);
    if (joinWaitlist) return addToWaitlist({ workshopId, attendeeName, email, actorId });
    throw conflict('WORKSHOP_FULL', 'Sorry, this workshop just filled up.', {
      capacity: full.capacity,
      activeCount: full.activeCount,
    });
  }

  try {
    const registration = await Registration.create({
      workshop: workshopId,
      attendeeName,
      attendeeEmail: email,
      status: 'ACTIVE',
      registeredBy: actorId,
    });
    return { registration, waitlisted: false };
  } catch (err) {
    // Compensate: we hold a seat but failed to record who it is for, so give it back.
    await releaseSeat(workshopId);
    if (err?.code === 11000) throw alreadyRegistered(email, 'ACTIVE');
    throw err;
  }
}

async function addToWaitlist({ workshopId, attendeeName, email, actorId }) {
  let registration;
  try {
    registration = await Registration.create({
      workshop: workshopId,
      attendeeName,
      attendeeEmail: email,
      status: 'WAITLISTED',
      registeredBy: actorId,
    });
  } catch (err) {
    if (err?.code === 11000) throw alreadyRegistered(email, 'WAITLISTED');
    throw err;
  }
  // A seat may have been freed between our failed reservation and the insert above.
  const promoted = await promoteFromWaitlist(workshopId);
  const self = promoted.find((r) => r._id.equals(registration._id));
  return { registration: self ?? registration, waitlisted: !self };
}

/**
 * Move people from the waitlist into free seats, oldest first. Uses the same atomic
 * reserveSeat() so promotion can never exceed capacity, and a status-guarded update on
 * the waitlist entry so two concurrent promoters cannot promote the same person twice.
 */
export async function promoteFromWaitlist(workshopId) {
  const promoted = [];
  for (;;) {
    const next = await Registration.findOne({ workshop: workshopId, status: 'WAITLISTED' })
      .sort({ registeredAt: 1, _id: 1 })
      .lean();
    if (!next) break;

    const ws = await reserveSeat(workshopId);
    if (!ws) break;

    let reg;
    try {
      reg = await Registration.findOneAndUpdate(
        { _id: next._id, status: 'WAITLISTED' },
        { $set: { status: 'ACTIVE', promotedAt: new Date() } },
        { new: true },
      );
    } catch (err) {
      if (err?.code !== 11000) {
        await releaseSeat(workshopId);
        throw err;
      }
      // Same person already holds an active seat: drop the redundant waitlist entry.
      await Registration.updateOne(
        { _id: next._id, status: 'WAITLISTED' },
        { $set: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Already holds a seat' } },
      );
      reg = null;
    }

    if (!reg) {
      await releaseSeat(workshopId); // someone else promoted/cancelled this entry first
      continue;
    }
    promoted.push(reg);
  }
  return promoted;
}

/**
 * Cancel is atomic and idempotent: the status guard means only one of several concurrent
 * cancels matches, so a seat is freed at most once.
 */
export async function cancelRegistration({ registrationId, actorId, reason }) {
  const before = await Registration.findOneAndUpdate(
    { _id: registrationId, status: { $in: ['ACTIVE', 'WAITLISTED'] } },
    { $set: { status: 'CANCELLED', cancelledBy: actorId, cancelledAt: new Date(), cancelReason: reason || undefined } },
    { new: false }, // pre-image: we need to know whether it held a seat
  );

  if (!before) {
    const exists = await Registration.exists({ _id: registrationId });
    if (!exists) throw notFound('Registration not found.');
    throw conflict('ALREADY_CANCELLED', 'This registration has already been cancelled.');
  }

  let promoted = [];
  if (before.status === 'ACTIVE') {
    await releaseSeat(before.workshop);
    promoted = await promoteFromWaitlist(before.workshop);
  }

  const registration = await Registration.findById(registrationId);
  return { registration, promoted };
}

/**
 * Safety net: recompute activeCount from the registrations themselves. Covers the one
 * window the design cannot (process crash between reserving a seat and inserting the
 * registration, which leaves the count one too HIGH, i.e. it fails safe by under-booking).
 * Run at startup / via `npm run recount`, when no registrations are in flight.
 */
export async function recountActiveRegistrations() {
  const counts = await Registration.aggregate([
    { $match: { status: 'ACTIVE' } },
    { $group: { _id: '$workshop', n: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.n]));
  const workshops = await Workshop.find({}, { activeCount: 1 }).lean();

  const ops = [];
  for (const w of workshops) {
    const actual = byId.get(String(w._id)) ?? 0;
    if (actual !== w.activeCount) {
      ops.push({ updateOne: { filter: { _id: w._id }, update: { $set: { activeCount: actual } } } });
    }
  }
  if (ops.length) await Workshop.bulkWrite(ops);
  return { checked: workshops.length, fixed: ops.length };
}
