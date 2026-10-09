import { describe, expect, it } from 'vitest';
import { Registration, Workshop } from '../src/models/index.js';
import { recountActiveRegistrations } from '../src/services/registrationService.js';
import { api, createWorkshop, loginAs, useTestDb } from './helpers.js';

useTestDb();

const register = (auth, wsId, i, extra = {}) =>
  api()
    .post(`/api/workshops/${wsId}/registrations`)
    .set('Authorization', auth)
    .send({ attendeeName: `Person ${i}`, attendeeEmail: `person${i}@example.com`, ...extra });

describe('capacity rule under concurrency', () => {
  it('50 simultaneous registrations for 20 seats: exactly 20 succeed', async () => {
    const { auth } = await loginAs('STAFF');
    const ws = await createWorkshop({ capacity: 20 });

    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => register(auth, ws._id, i)));
    const statuses = results.map((r) => r.status);

    expect(statuses.filter((s) => s === 201)).toHaveLength(20);
    expect(statuses.filter((s) => s === 409)).toHaveLength(30);
    for (const r of results.filter((x) => x.status === 409)) expect(r.body.error.code).toBe('WORKSHOP_FULL');

    const fresh = await Workshop.findById(ws._id);
    expect(fresh.activeCount).toBe(20);
    expect(await Registration.countDocuments({ workshop: ws._id, status: 'ACTIVE' })).toBe(20);
  });

  it('several staff racing for the last seat: only one gets it', async () => {
    const staff = await Promise.all([loginAs('STAFF'), loginAs('STAFF'), loginAs('MANAGER')]);
    const ws = await createWorkshop({ capacity: 1 });
    const results = await Promise.all(staff.map((s, i) => register(s.auth, ws._id, i)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await Workshop.findById(ws._id)).activeCount).toBe(1);
  });

  it('the same email submitted concurrently gets only one seat, and no seat leaks', async () => {
    const { auth } = await loginAs('STAFF');
    const ws = await createWorkshop({ capacity: 10 });
    const results = await Promise.all(Array.from({ length: 10 }, () => register(auth, ws._id, 'same')));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9);
    expect((await Workshop.findById(ws._id)).activeCount).toBe(1);
    expect(await Registration.countDocuments({ workshop: ws._id, status: 'ACTIVE' })).toBe(1);
  });

  it('parallel double-cancel frees only one seat', async () => {
    const { auth } = await loginAs('STAFF');
    const ws = await createWorkshop({ capacity: 5 });
    await register(auth, ws._id, 1).expect(201);
    const reg = await register(auth, ws._id, 2).expect(201);

    const cancels = await Promise.all(
      Array.from({ length: 5 }, () =>
        api().post(`/api/registrations/${reg.body.registration._id}/cancel`).set('Authorization', auth).send({}),
      ),
    );
    expect(cancels.filter((r) => r.status === 200)).toHaveLength(1);
    expect(cancels.filter((r) => r.status === 409)).toHaveLength(4);
    expect((await Workshop.findById(ws._id)).activeCount).toBe(1);
  });
});

describe('registration lifecycle and history', () => {
  it('cancelling frees the seat, keeps the record, and records who/when/why', async () => {
    const { auth, user } = await loginAs('STAFF');
    const ws = await createWorkshop({ capacity: 1 });
    const reg = await register(auth, ws._id, 1).expect(201);
    expect(reg.body.workshop.seatsAvailable).toBe(0);
    await register(auth, ws._id, 2).expect(409);

    const cancel = await api()
      .post(`/api/registrations/${reg.body.registration._id}/cancel`)
      .set('Authorization', auth)
      .send({ reason: 'Ill' })
      .expect(200);
    expect(cancel.body.workshop.seatsAvailable).toBe(1);
    expect(cancel.body.registration.cancelledBy).toBe(String(user._id));

    await register(auth, ws._id, 2).expect(201);
    const all = await api().get(`/api/workshops/${ws._id}/registrations?status=all`).set('Authorization', auth).expect(200);
    expect(all.body.items).toHaveLength(2);
    const cancelled = all.body.items.find((r) => r.status === 'CANCELLED');
    expect(cancelled.cancelledBy.name).toBe('STAFF user');
    expect(cancelled.cancelReason).toBe('Ill');
    expect(cancelled.registeredBy.name).toBe('STAFF user');

    const history = await api().get('/api/registrations/history?email=person1').set('Authorization', auth).expect(200);
    expect(history.body.items).toHaveLength(1);
    expect(history.body.items[0].workshop.code).toBe(ws.code);
  });

  it('a person can re-register after cancelling, but not hold two active seats', async () => {
    const { auth } = await loginAs('STAFF');
    const ws = await createWorkshop({ capacity: 5 });
    const reg = await register(auth, ws._id, 1).expect(201);
    const dup = await register(auth, ws._id, 1).expect(409);
    expect(dup.body.error.code).toBe('ALREADY_REGISTERED');
    await api().post(`/api/registrations/${reg.body.registration._id}/cancel`).set('Authorization', auth).expect(200);
    await register(auth, ws._id, 1).expect(201);
    expect((await Workshop.findById(ws._id)).activeCount).toBe(1);
  });

  it('refuses registrations for cancelled or finished workshops', async () => {
    const { auth } = await loginAs('STAFF');
    const cancelled = await createWorkshop({ status: 'CANCELLED' });
    expect((await register(auth, cancelled._id, 1).expect(409)).body.error.code).toBe('WORKSHOP_NOT_OPEN');
    const past = await createWorkshop({ startsAt: new Date(Date.now() - 7200_000), endsAt: new Date(Date.now() - 3600_000) });
    expect((await register(auth, past._id, 1).expect(409)).body.error.code).toBe('WORKSHOP_ENDED');
  });

  it('validates input and unknown ids', async () => {
    const { auth } = await loginAs('STAFF');
    const ws = await createWorkshop();
    const bad = await api()
      .post(`/api/workshops/${ws._id}/registrations`)
      .set('Authorization', auth)
      .send({ attendeeName: '', attendeeEmail: 'not-an-email' })
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    await register(auth, '0123456789abcdef01234567', 1).expect(404);
    await register(auth, 'nope', 1).expect(400);
  });
});

describe('workshop capacity edits', () => {
  it('capacity cannot be lowered below the active registrations', async () => {
    const staff = await loginAs('STAFF');
    const manager = await loginAs('MANAGER');
    const ws = await createWorkshop({ capacity: 5 });
    for (let i = 0; i < 3; i++) await register(staff.auth, ws._id, i).expect(201);

    const res = await api().patch(`/api/workshops/${ws._id}`).set('Authorization', manager.auth).send({ capacity: 2 }).expect(409);
    expect(res.body.error.code).toBe('CAPACITY_BELOW_REGISTRATIONS');
    expect((await Workshop.findById(ws._id)).capacity).toBe(5);

    await api().patch(`/api/workshops/${ws._id}`).set('Authorization', manager.auth).send({ capacity: 3 }).expect(200);
    await register(staff.auth, ws._id, 9).expect(409);
  });

  it('lowering capacity while registrations race never leaves the workshop overbooked', async () => {
    const staff = await loginAs('STAFF');
    const manager = await loginAs('MANAGER');
    const ws = await createWorkshop({ capacity: 10 });
    await Promise.all([
      ...Array.from({ length: 10 }, (_, i) => register(staff.auth, ws._id, i)),
      api().patch(`/api/workshops/${ws._id}`).set('Authorization', manager.auth).send({ capacity: 4 }),
    ]);
    const fresh = await Workshop.findById(ws._id);
    const active = await Registration.countDocuments({ workshop: ws._id, status: 'ACTIVE' });
    expect(active).toBe(fresh.activeCount);
    expect(active).toBeLessThanOrEqual(fresh.capacity);
  });

  it('records workshop edits in the audit log with before/after values', async () => {
    const manager = await loginAs('MANAGER');
    const ws = await createWorkshop({ capacity: 5, title: 'Old' });
    await api().patch(`/api/workshops/${ws._id}`).set('Authorization', manager.auth).send({ title: 'New', capacity: 8 }).expect(200);
    const audit = await api().get('/api/audit').set('Authorization', manager.auth).expect(200);
    expect(audit.body.items[0].action).toBe('WORKSHOP_UPDATED');
    expect(audit.body.items[0].changes).toEqual({ title: { from: 'Old', to: 'New' }, capacity: { from: 5, to: 8 } });
  });
});

describe('finding workshops', () => {
  it('filters by date range, status and seats available', async () => {
    const { auth } = await loginAs('STAFF');
    const day = 86400_000;
    const mk = (d, o) =>
      createWorkshop({ startsAt: new Date(Date.now() + d * day), endsAt: new Date(Date.now() + d * day + 3600_000), ...o });
    const soonOpen = await mk(1, { capacity: 5 });
    const soonFull = await mk(2, { capacity: 1 });
    await register(auth, soonFull._id, 1).expect(201);
    await mk(3, { status: 'CANCELLED' });
    await mk(20, {});

    const from = new Date().toISOString();
    const to = new Date(Date.now() + 7 * day).toISOString();
    const res = await api()
      .get('/api/workshops')
      .query({ from, to, status: 'SCHEDULED', hasSeats: 'true' })
      .set('Authorization', auth)
      .expect(200);
    expect(res.body.items.map((w) => w.code)).toEqual([soonOpen.code]);
    expect(res.body.items[0].seatsAvailable).toBe(5);

    const all = await api().get('/api/workshops').set('Authorization', auth).expect(200);
    expect(all.body.total).toBe(4);

    const search = await api().get('/api/workshops').query({ q: soonFull.code.toLowerCase() }).set('Authorization', auth).expect(200);
    expect(search.body.items).toHaveLength(1);
  });
});

describe('waitlist (bonus)', () => {
  it('queues attendees when full and promotes the next in line on cancellation', async () => {
    const { auth } = await loginAs('STAFF');
    const ws = await createWorkshop({ capacity: 1 });
    const first = await register(auth, ws._id, 1).expect(201);
    const w1 = await register(auth, ws._id, 2, { joinWaitlist: true }).expect(201);
    expect(w1.body.waitlisted).toBe(true);
    await register(auth, ws._id, 3, { joinWaitlist: true }).expect(201);

    const cancel = await api().post(`/api/registrations/${first.body.registration._id}/cancel`).set('Authorization', auth).expect(200);
    expect(cancel.body.promoted.map((r) => r.attendeeEmail)).toEqual(['person2@example.com']);
    expect(cancel.body.workshop.activeCount).toBe(1);
    expect(await Registration.countDocuments({ workshop: ws._id, status: 'WAITLISTED' })).toBe(1);
  });

  it('a person cannot join the same waitlist twice, or the waitlist while holding a seat', async () => {
    const { auth } = await loginAs('STAFF');
    const ws = await createWorkshop({ capacity: 1 });
    await register(auth, ws._id, 1).expect(201);
    await register(auth, ws._id, 1, { joinWaitlist: true }).expect(409);
    await register(auth, ws._id, 2, { joinWaitlist: true }).expect(201);
    const again = await register(auth, ws._id, 2, { joinWaitlist: true }).expect(409);
    expect(again.body.error.message).toMatch(/waitlist/);
  });

  it('concurrent cancellations never promote past capacity', async () => {
    const { auth } = await loginAs('STAFF');
    const ws = await createWorkshop({ capacity: 3 });
    const active = [];
    for (let i = 0; i < 3; i++) active.push((await register(auth, ws._id, i).expect(201)).body.registration._id);
    for (let i = 10; i < 20; i++) await register(auth, ws._id, i, { joinWaitlist: true }).expect(201);

    await Promise.all(active.map((id) => api().post(`/api/registrations/${id}/cancel`).set('Authorization', auth)));
    const fresh = await Workshop.findById(ws._id);
    expect(fresh.activeCount).toBe(3);
    expect(await Registration.countDocuments({ workshop: ws._id, status: 'ACTIVE' })).toBe(3);
    expect(await Registration.countDocuments({ workshop: ws._id, status: 'WAITLISTED' })).toBe(7);
  });
});

describe('recount safety net', () => {
  it('repairs a drifted activeCount', async () => {
    const { auth } = await loginAs('STAFF');
    const ws = await createWorkshop({ capacity: 5 });
    await register(auth, ws._id, 1).expect(201);
    await Workshop.updateOne({ _id: ws._id }, { $set: { activeCount: 4 } }); // simulate a crash leak
    const result = await recountActiveRegistrations();
    expect(result.fixed).toBe(1);
    expect((await Workshop.findById(ws._id)).activeCount).toBe(1);
  });
});
