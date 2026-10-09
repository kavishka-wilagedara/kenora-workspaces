import { describe, expect, it } from 'vitest';
import { api, createUser, createWorkshop, loginAs, useTestDb } from './helpers.js';

useTestDb();

const workshopBody = () => ({
  code: 'NEW-1',
  title: 'New',
  instructor: 'Someone',
  location: 'Riverside Centre',
  startsAt: new Date(Date.now() + 86400_000).toISOString(),
  endsAt: new Date(Date.now() + 90000_000).toISOString(),
  capacity: 5,
});

describe('authentication', () => {
  it('rejects requests without a token with 401', async () => {
    const res = await api().get('/api/workshops').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a bad token with 401', async () => {
    await api().get('/api/workshops').set('Authorization', 'Bearer nope').expect(401);
  });

  it('rejects wrong password and never returns the password hash', async () => {
    const { email, password } = await createUser('STAFF');
    await api().post('/api/auth/login').send({ email, password: 'wrong' }).expect(401);
    const res = await api().post('/api/auth/login').send({ email, password }).expect(200);
    expect(res.body.user.passwordHash).toBeUndefined();
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${res.body.token}`).expect(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.user.passwordHash).toBeUndefined();
  });

  it('a deactivated user is locked out immediately, even with a valid token', async () => {
    const admin = await loginAs('ADMIN');
    const staff = await loginAs('STAFF');
    await api().get('/api/workshops').set('Authorization', staff.auth).expect(200);
    await api().patch(`/api/users/${staff.user._id}`).set('Authorization', admin.auth).send({ active: false }).expect(200);
    await api().get('/api/workshops').set('Authorization', staff.auth).expect(401);
  });
});

describe('permission matrix is enforced by the backend', () => {
  it('STAFF gets 403 creating or editing workshops', async () => {
    const { auth } = await loginAs('STAFF');
    await api().post('/api/workshops').set('Authorization', auth).send(workshopBody()).expect(403);
    const ws = await createWorkshop();
    await api().patch(`/api/workshops/${ws._id}`).set('Authorization', auth).send({ title: 'x' }).expect(403);
  });

  it('MANAGER can create and edit workshops', async () => {
    const { auth } = await loginAs('MANAGER');
    const res = await api().post('/api/workshops').set('Authorization', auth).send(workshopBody()).expect(201);
    expect(res.body.workshop.seatsAvailable).toBe(5);
    await api().patch(`/api/workshops/${res.body.workshop._id}`).set('Authorization', auth).send({ title: 'Edited' }).expect(200);
  });

  it('ADMIN gets 403 on workshops and registrations', async () => {
    const { auth } = await loginAs('ADMIN');
    const ws = await createWorkshop();
    await api().get('/api/workshops').set('Authorization', auth).expect(403);
    await api().post('/api/workshops').set('Authorization', auth).send(workshopBody()).expect(403);
    await api().get(`/api/workshops/${ws._id}/registrations`).set('Authorization', auth).expect(403);
    await api()
      .post(`/api/workshops/${ws._id}/registrations`)
      .set('Authorization', auth)
      .send({ attendeeName: 'A', attendeeEmail: 'a@x.com' })
      .expect(403);
    await api().get('/api/registrations/history').set('Authorization', auth).expect(403);
  });

  it('MANAGER and STAFF get 403 on /users', async () => {
    for (const role of ['MANAGER', 'STAFF']) {
      const { auth } = await loginAs(role);
      await api().get('/api/users').set('Authorization', auth).expect(403);
      await api()
        .post('/api/users')
        .set('Authorization', auth)
        .send({ name: 'X', email: 'x@x.com', role: 'ADMIN', password: 'Password1!' })
        .expect(403);
    }
  });

  it('STAFF and MANAGER can register and cancel attendees', async () => {
    const ws = await createWorkshop();
    for (const role of ['MANAGER', 'STAFF']) {
      const { auth } = await loginAs(role);
      const reg = await api()
        .post(`/api/workshops/${ws._id}/registrations`)
        .set('Authorization', auth)
        .send({ attendeeName: role, attendeeEmail: `${role}@x.com` })
        .expect(201);
      await api().post(`/api/registrations/${reg.body.registration._id}/cancel`).set('Authorization', auth).expect(200);
    }
  });
});

describe('user management (ADMIN)', () => {
  it('creates users, changes roles, and writes audit entries', async () => {
    const { auth } = await loginAs('ADMIN');
    const created = await api()
      .post('/api/users')
      .set('Authorization', auth)
      .send({ name: 'New Staff', email: 'New@Example.com', role: 'STAFF', password: 'Password1!' })
      .expect(201);
    expect(created.body.user.email).toBe('new@example.com');
    expect(created.body.user.passwordHash).toBeUndefined();

    await api()
      .post('/api/users')
      .set('Authorization', auth)
      .send({ name: 'Dup', email: 'new@example.com', role: 'STAFF', password: 'Password1!' })
      .expect(409);

    await api().patch(`/api/users/${created.body.user._id}`).set('Authorization', auth).send({ role: 'MANAGER' }).expect(200);

    const audit = await api().get('/api/audit').set('Authorization', auth).expect(200);
    expect(audit.body.items.map((a) => a.action)).toEqual(['ROLE_CHANGED', 'USER_CREATED']);
  });

  it('an admin cannot demote or deactivate themselves', async () => {
    const { auth, user } = await loginAs('ADMIN');
    await api().patch(`/api/users/${user._id}`).set('Authorization', auth).send({ role: 'STAFF' }).expect(400);
    await api().patch(`/api/users/${user._id}`).set('Authorization', auth).send({ active: false }).expect(400);
  });
});
