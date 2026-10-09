# Workshop Registration Service

Staff app for a community training centre: schedule workshops, register attendees by phone or in person, and never overbook, even when several people at the front desk are booking the same workshop at the same moment.

- **Backend:** Node.js, Express 5, MongoDB (Mongoose), JWT, zod. Code is in `backend/`.
- **Frontend:** React 18, Vite, React Router. Code is in `frontend/`.

## Quick start

Prerequisites: **Node.js 20+** and **MongoDB**, either through Docker or a local install. If you have neither, use option B, which needs no database at all.

```bash
npm run setup
npm run dev:memory
```

This downloads a MongoDB binary on first run (about 65 MB), starts it in memory and seeds it automatically. All data is lost when you stop the server.

### Running the halves separately

```bash
cd backend  && npm run dev        # http://localhost:4000/api
cd frontend && npm run dev        # http://localhost:5173 
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


- **Concurrency:** 50 simultaneous registrations for a 20-seat workshop. Exactly 20 return 201 and 30 return 409, with `activeCount === 20` and 20 ACTIVE rows in the DB.
- Several staff racing for the last seat, and the same email submitted 10 times at once (1 seat taken, no leaked counter).
- Capacity can't be lowered below the active registrations, including while registrations are racing.
- Waitlist promotion (also under concurrent cancels), the audit log, filters, and the recount safety net.

## API summary

All endpoints are under `/api`, take and return JSON, and need `Authorization: Bearer <token>` except login. Errors always look like `{ "error": { "code", "message", "details?" } }`. A missing or invalid token returns 401; the wrong role returns 403.
# kenora-workspaces
