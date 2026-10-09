# Design notes

**Stack.** I used Node + Express 5 + MongoDB/Mongoose for the API and React + Vite for the UI. That gives one language across the stack, and it is the stack I know best. Express 5 forwards errors from async handlers, so all errors go through one handler that returns a single shape: `{error:{code,message,details}}`. Validation errors map to 400 and duplicate keys to 409. zod validates every request body and query string. Mongo's atomic single-document updates are enough to enforce the capacity rule without transactions (see below). Auth uses JWT Bearer tokens, which are stateless and simple. Passwords are hashed with bcrypt (the pure-JS `bcryptjs`, so there is no native build step).

**Data model.** There are four collections:

- **User:** role and `active` flag.
- **Workshop:** the spreadsheet fields plus `location` (an enum of the 3 centres), `endsAt`, `description`, `createdBy`/`updatedBy` and a denormalised `activeCount`.
- **Registration:** never deleted. Its status is `ACTIVE`, `CANCELLED` or `WAITLISTED`, and it records `registeredBy/At`, `cancelledBy/At/Reason` and `promotedAt`.
- **AuditLog:** actor, action, entity and a before/after diff.

**Access control.** The rules follow the brief's matrix exactly. Every route is behind `authenticate`, which verifies the JWT and then reloads the user from the DB. Because of that reload, a role change or deactivation takes effect on the very next request, not when the token expires. Each route also has `authorize(...roles)`. A missing or bad token gets 401 and the wrong role gets 403. **Admins deliberately have no access to workshops or registrations**, because the matrix says "No". An admin cannot demote or deactivate themselves, so the system can't be locked out. The UI hides what a role can't do, but the backend is the source of truth, and tests cover every "No" cell.

**How over-registration is prevented**

1. **Atomic conditional increment.** A seat is taken with a single update: `findOneAndUpdate({_id, status:'SCHEDULED', endsAt>now, $expr: activeCount < capacity}, {$inc:{activeCount:1}})`. MongoDB applies single-document updates atomically, so if 50 requests race for the last seat, exactly one matches and the rest get `null`, which becomes 409 "Sorry, this workshop just filled up". There is no read-then-write gap.
2. **Compensation.** The registration document is inserted after the seat is reserved. If that insert fails (for example a duplicate email), the seat is released with a guarded `$inc: -1`.
3. **Partial unique index** on `{workshop, attendeeEmail}` where `status = ACTIVE` (and a second one for `WAITLISTED`). The same person can't hold two seats, even when the requests are simultaneous, but they can re-register after cancelling.
4. **Status-guarded cancel.** `findOneAndUpdate({_id, status:'ACTIVE'} → CANCELLED)` matches only once, so a double-click or two staff cancelling together frees exactly one seat.
5. **Capacity edits** use the same idea. The filter `{activeCount: {$lte: newCapacity}}` sits in the same atomic update, so a manager can't shrink a workshop below the seats taken, even while registrations are racing (409 otherwise).
6. **Safety net.** If the process crashes between steps 1 and 2, the counter ends up one too *high*. That fails safe: it can under-book but never over-book. `recountActiveRegistrations()` rebuilds every counter from the registrations at startup and via `npm run recount`.

*Why not transactions?* They need a replica set, and the conditional update already guarantees the invariant on a standalone server. Wrapping steps 1 and 2 in a session would only close the crash window, which the recount already covers. It would be a small change if wanted. The 50-requests-for-20-seats test proves the guarantee, and it fails (50 of 50 accepted) if you swap in a naive read-then-write.

**Trade-offs.**
- *Denormalised counter vs counting rows:* a counter makes the atomic check and the "has seats" filter cheap and indexable. Counting rows on every request would need a lock or a transaction to be race-free. The cost is keeping the counter in sync, which items 2 and 6 handle.
- *Token in localStorage:* simple and survives a refresh, but an XSS bug could read it. An httpOnly cookie plus CSRF protection would be safer.
- *No refresh tokens:* an 8-hour expiry is about one shift, and any 401 sends the user back to the login screen.
- *Auto-promotion from the waitlist:* when a seat frees, the oldest waitlisted person gets it immediately, using the same atomic reserve. There is no "offer and wait for acceptance" step, because attendees have no accounts or notifications.

**Assumptions.**
- Admin is an IT/office role, not front desk.
- An attendee is identified by email per workshop.
- You can't register for a workshop that is cancelled, completed or already over. Cancelling a workshop keeps its registrations.
- Times are stored in UTC and shown in the browser's local time; all 3 centres share one timezone.
- Workshop codes are unique and stored in upper case.

**Bonus done.**
- Audit log: account create, role change, (de)activation and password reset, plus workshop create and edit with field diffs. Admins see account events and managers see workshop events.
- Waitlist.
- In-memory dev mode so it runs without Docker.

**Skipped / next.**
- Login rate limiting and lockout; helmet/CSP headers.
- Users changing their own password; forcing a change of the temporary password on first sign-in.
- Email confirmations and waitlist notifications.
- Paging on the workshop list: it shows the first 100 and says so, while history and audit pages do page.
- Optimistic locking for two managers editing the same workshop at once. Edits send only changed fields, which limits the damage.
- Frontend unit tests: the UI was checked end to end with a Playwright script for each role, but that script is not committed.
- CI and a live deployment.
