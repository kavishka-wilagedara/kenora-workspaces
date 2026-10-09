import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import RegisterForm from '../components/RegisterForm.jsx';
import { Alert, ConfirmDialog, Empty, ErrorMessage, Loading, Seats, StatusBadge } from '../components/ui.jsx';
import { fmtDateTime, fmtRange } from '../utils/dates.js';
import { can } from '../utils/roles.js';
import { useApi } from '../utils/useApi.js';

export default function WorkshopDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [tab, setTab] = useState('attendees');
  const [toCancel, setToCancel] = useState(null);
  const [flash, setFlash] = useState(null);

  const ws = useApi(() => api.getWorkshop(id).then((r) => r.workshop), [id]);
  const regs = useApi(() => api.listRegistrations(id, 'all').then((r) => r.items), [id]);
  const refresh = useCallback(() => Promise.all([ws.reload(), regs.reload()]), [ws, regs]);

  if (ws.loading && !ws.data) return <Loading />;
  if (ws.error && !ws.data) {
    return (
      <>
        <BackLink />
        <ErrorMessage error={ws.error} onRetry={ws.reload} />
      </>
    );
  }
  const w = ws.data;
  const all = regs.data ?? [];
  const active = all.filter((r) => r.status === 'ACTIVE');
  const waitlist = all.filter((r) => r.status === 'WAITLISTED');
  const history = [...all].sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));

  async function doCancel(reason) {
    const res = await api.cancelRegistration(toCancel._id, reason);
    const promoted = res.promoted?.map((p) => p.attendeeName) ?? [];
    setFlash({
      kind: 'success',
      text:
        `${toCancel.status === 'WAITLISTED' ? 'Removed' : 'Cancelled'} ${toCancel.attendeeName}.` +
        (promoted.length ? ` ${promoted.join(', ')} moved from the waitlist into the freed seat.` : ''),
    });
    await refresh();
  }

  const tabs = [
    ['attendees', `Attendees (${active.length})`],
    ['waitlist', `Waitlist (${waitlist.length})`],
    ['history', `History (${all.length})`],
  ];

  return (
    <>
      <BackLink />
      <div className="page-head">
        <div>
          <h1>
            {w.title} <StatusBadge status={w.status} />
          </h1>
          <p className="muted">
            {w.code} · {w.instructor} · {w.location}
          </p>
          <p>
            <strong>{fmtRange(w.startsAt, w.endsAt)}</strong>
          </p>
        </div>
        {can.manageWorkshops(user.role) && (
          <Link className="btn" to={`/workshops/${w._id}/edit`}>
            Edit workshop
          </Link>
        )}
      </div>

      <div className="detail-grid">
        <section className="card">
          <h2>Seats</h2>
          <Seats workshop={w} large />
          {w.waitlistCount > 0 && <p className="muted">{w.waitlistCount} on the waitlist</p>}
          {w.description && <p className="description">{w.description}</p>}
        </section>

        <section className="card">
          <h2>Register an attendee</h2>
          <RegisterForm
            workshop={w}
            onDone={(msg) => {
              setFlash(msg);
              return refresh();
            }}
            onSeatChange={refresh}
          />
        </section>
      </div>

      <Alert kind={flash?.kind} onClose={() => setFlash(null)}>
        {flash?.text}
      </Alert>

      <section className="card">
        <div className="tabs" role="tablist">
          {tabs.map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={`tab ${tab === key ? 'on' : ''}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        <ErrorMessage error={regs.error} onRetry={regs.reload} />
        {regs.loading && !regs.data ? (
          <Loading />
        ) : tab === 'attendees' ? (
          <AttendeeTable rows={active} empty="Nobody is registered yet." onCancel={setToCancel} actionLabel="Cancel" />
        ) : tab === 'waitlist' ? (
          <AttendeeTable rows={waitlist} empty="Nobody is on the waitlist." onCancel={setToCancel} actionLabel="Remove" showPosition />
        ) : (
          <HistoryTable rows={history} />
        )}
      </section>

      <ConfirmDialog
        open={!!toCancel}
        title={toCancel?.status === 'WAITLISTED' ? 'Remove from waitlist?' : 'Cancel registration?'}
        message={
          toCancel &&
          (toCancel.status === 'WAITLISTED'
            ? `${toCancel.attendeeName} (${toCancel.attendeeEmail}) will be taken off the waitlist.`
            : `${toCancel.attendeeName} (${toCancel.attendeeEmail}) will lose their seat and it will be freed for someone else. The record stays in the history.`)
        }
        confirmLabel={toCancel?.status === 'WAITLISTED' ? 'Remove' : 'Cancel registration'}
        danger
        askReason
        onConfirm={doCancel}
        onClose={() => setToCancel(null)}
      />
    </>
  );
}

function BackLink() {
  return (
    <p>
      <Link to="/workshops">← All workshops</Link>
    </p>
  );
}

function AttendeeTable({ rows, empty, onCancel, actionLabel, showPosition }) {
  if (!rows.length) return <Empty title={empty} />;
  return (
    <table className="table">
      <thead>
        <tr>
          {showPosition && <th>#</th>}
          <th>Name</th>
          <th>Email</th>
          <th>Added</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r._id}>
            {showPosition && <td data-label="Position">{i + 1}</td>}
            <td data-label="Name">{r.attendeeName}</td>
            <td data-label="Email">{r.attendeeEmail}</td>
            <td data-label="Added">
              {fmtDateTime(r.promotedAt ?? r.registeredAt)}
              <div className="muted">
                by {r.registeredBy?.name ?? 'unknown'}
                {r.promotedAt && ' · from waitlist'}
              </div>
            </td>
            <td className="right">
              <button type="button" className="btn btn-small btn-danger-outline" onClick={() => onCancel(r)}>
                {actionLabel}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HistoryTable({ rows }) {
  if (!rows.length) return <Empty title="No registrations yet." />;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Attendee</th>
          <th>Status</th>
          <th>Registered</th>
          <th>Cancelled</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r._id}>
            <td data-label="Attendee">
              {r.attendeeName}
              <div className="muted">{r.attendeeEmail}</div>
            </td>
            <td data-label="Status">
              <StatusBadge status={r.status} />
            </td>
            <td data-label="Registered">
              {fmtDateTime(r.registeredAt)}
              <div className="muted">by {r.registeredBy?.name ?? '—'}</div>
              {r.promotedAt && <div className="muted">Got a seat from waitlist {fmtDateTime(r.promotedAt)}</div>}
            </td>
            <td data-label="Cancelled">
              {r.cancelledAt ? (
                <>
                  {fmtDateTime(r.cancelledAt)}
                  <div className="muted">by {r.cancelledBy?.name ?? 'system'}</div>
                  {r.cancelReason && <div className="muted">“{r.cancelReason}”</div>}
                </>
              ) : (
                <span className="muted">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
