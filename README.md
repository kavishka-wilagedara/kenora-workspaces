# Workshop Registration Service

Staff app for a community training centre: schedule workshops, register attendees by phone or in person, and never overbook, even when several people at the front desk are booking the same workshop at the same moment.

- **Backend:** Node.js, Express 5, MongoDB (Mongoose), JWT, zod. Code is in `backend/`.
- **Frontend:** React 18, Vite, React Router. Code is in `frontend/`.
- **Design notes:** see [DESIGN.md](DESIGN.md) for stack choices, how over-registration is prevented, trade-offs and what was skipped.

## Quick start

Prerequisites: **Node.js 20+** and **MongoDB**, either through Docker or a local install. If you have neither, use option B, which needs no database at all.

### Option A: with MongoDB (Docker)

```bash
docker compose up -d              # starts MongoDB 7 on localhost:27017
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env   # optional, the defaults work
npm run setup                     # installs root, backend and frontend dependencies
npm run seed                      # wipes the DB and loads demo users and workshops
npm run dev                       # API on :4000 and web app on :5173
```

Then open **http://localhost:5173**.

If you have a local MongoDB instead of Docker, skip `docker compose` and set `MONGO_URI` in `backend/.env`.

### Option B: no database install (in-memory MongoDB)

```bash
npm run setup
npm run dev:memory
```

This downloads a MongoDB binary on first run (about 65 MB), starts it in memory and seeds it automatically. All data is lost when you stop the server.

### Running the halves separately

```bash
cd backend  && npm run dev        # http://localhost:4000/api
cd frontend && npm run dev        # http://localhost:5173 (proxies /api to :4000)
```

## Dev login credentials

These are created by the seed and are for local development only.

| Role                                         | Email               | Password    |
|----------------------------------------------|---------------------|-------------|
| Admin (staff accounts only)                  | admin@example.com   | Admin123!   |
| Manager (workshops, registrations)           | manager@example.com | Manager123! |
| Staff / front desk (registrations)           | staff@example.com   | Staff123!   |

Sample data contains 9 workshops across the 3 centres, all dated relative to today:

- one nearly full (POT-101, 1 seat left)
- one full with 2 people on the waitlist (FIT-110)
- one cancelled workshop (ART-130)
- one completed workshop in the past (COD-150)
- a cancelled registration on COD-201, so the history has a cancellation in it

## Tests

```bash
npm test              # or: cd backend && npm test
```

The tests use Vitest, supertest and mongodb-memory-server, so no running database is needed. They include:

- **Concurrency:** 50 simultaneous registrations for a 20-seat workshop. Exactly 20 return 201 and 30 return 409, with `activeCount === 20` and 20 ACTIVE rows in the DB.
- Several staff racing for the last seat, and the same email submitted 10 times at once (1 seat taken, no leaked counter).
- Parallel double-cancel frees only one seat.
- Capacity can't be lowered below the active registrations, including while registrations are racing.
- Permission matrix: STAFF gets 403 on `POST /workshops`, ADMIN gets 403 on workshops and registrations, MANAGER and STAFF get 403 on `/users`. Deactivated users are locked out immediately.
- Waitlist promotion (also under concurrent cancels), the audit log, filters, and the recount safety net.

To check that the concurrency test catches overbooking, I swapped in a naive read-then-write version. The test failed with 50 of 50 accepted.

## Environment variables

`backend/.env`:

| Variable         | Default                                | Notes                                            |
|------------------|----------------------------------------|--------------------------------------------------|
| `PORT`           | `4000`                                 |                                                  |
| `MONGO_URI`      | `mongodb://127.0.0.1:27017/workshops`  | `memory` = in-memory MongoDB, auto-seeded        |
| `JWT_SECRET`     | dev-only fallback                      | **Required** when `NODE_ENV=production`          |
| `JWT_EXPIRES_IN` | `8h`                                   | About one shift                                  |
| `CORS_ORIGIN`    | `http://localhost:5173`                | Only needed if the browser calls the API directly |

`frontend/.env`:

| Variable            | Default                 | Notes                                          |
|---------------------|-------------------------|------------------------------------------------|
| `VITE_PROXY_TARGET` | `http://localhost:4000` | Where the dev server forwards `/api`           |
| `VITE_API_URL`      | empty (same origin)     | For a production build hosted apart from the API |

## Other scripts

| Command                          | What it does                                                         |
|----------------------------------|----------------------------------------------------------------------|
| `npm run seed`                   | Reset the DB to demo data                                            |
| `npm --prefix backend run recount` | Recompute every workshop's seat counter from its registrations (safety net, see DESIGN.md) |
| `npm run build`                  | Production build of the frontend into `frontend/dist`                |

## API summary

All endpoints are under `/api`, take and return JSON, and need `Authorization: Bearer <token>` except login. Errors always look like `{ "error": { "code", "message", "details?" } }`. A missing or invalid token returns 401; the wrong role returns 403.

| Method | Path                                   | Roles          | Notes |
|--------|----------------------------------------|----------------|-------|
| POST   | `/auth/login`                          | public         | `{email, password}` → `{token, user}` |
| GET    | `/auth/me`                             | any            | Current user |
| GET    | `/users`                               | ADMIN          | List accounts |
| POST   | `/users`                               | ADMIN          | `{name, email, role, password}` |
| PATCH  | `/users/:id`                           | ADMIN          | Any of `{name, role, active, password}`. Can't demote or deactivate yourself |
| GET    | `/workshops`                           | MANAGER, STAFF | Filters: `from`, `to` (on start time), `status`, `location`, `hasSeats=true`, `q`, `page`, `limit`. Sorted by start time; each item includes `seatsAvailable` |
| GET    | `/workshops/:id`                       | MANAGER, STAFF | Includes `seatsAvailable` and `waitlistCount` |
| POST   | `/workshops`                           | MANAGER        | `{code, title, instructor, location, startsAt, endsAt, capacity, status?, description?}` |
| PATCH  | `/workshops/:id`                       | MANAGER        | Partial update. 409 `CAPACITY_BELOW_REGISTRATIONS` if capacity is lower than active registrations |
| GET    | `/workshops/:id/registrations`         | MANAGER, STAFF | `?status=ACTIVE\|CANCELLED\|WAITLISTED\|all`, with registeredBy and cancelledBy names |
| POST   | `/workshops/:id/registrations`         | MANAGER, STAFF | `{attendeeName, attendeeEmail, joinWaitlist?}`. 409 `WORKSHOP_FULL`, `ALREADY_REGISTERED`, `WORKSHOP_NOT_OPEN` or `WORKSHOP_ENDED` |
| POST   | `/registrations/:id/cancel`            | MANAGER, STAFF | `{reason?}`. Idempotent (409 `ALREADY_CANCELLED`). Returns anyone promoted from the waitlist |
| GET    | `/registrations/history`               | MANAGER, STAFF | `?email=&workshop=&status=&from=&to=&page=`. Full history including cancellations |
| GET    | `/audit`                               | ADMIN, MANAGER | Admin sees account changes; manager sees workshop changes |
