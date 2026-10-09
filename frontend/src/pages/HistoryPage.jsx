import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Empty, ErrorMessage, Loading, StatusBadge } from '../components/ui.jsx';
import { endOfDay, fmtDateTime, fromDateInput } from '../utils/dates.js';
import { useApi } from '../utils/useApi.js';

export default function HistoryPage() {
  const [email, setEmail] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(email.trim()), 300);
    return () => clearTimeout(t);
  }, [email]);
  useEffect(() => setPage(1), [debounced, status, from, to]);

  const query = {
    email: debounced,
    status,
    from: from ? fromDateInput(from).toISOString() : '',
    to: to ? endOfDay(fromDateInput(to)).toISOString() : '',
    page,
    limit: 50,
  };
  const { data, error, loading, reload } = useApi(() => api.history(query), [JSON.stringify(query)]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <h1>Registration history</h1>
      <p className="muted">Every registration and cancellation, with who did it and when. Nothing is ever deleted.</p>
      <section className="card filters">
        <div className="filter-row">
          <input type="search" className="search" placeholder="Search by attendee email" aria-label="Attendee email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="inline">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any</option>
              <option value="ACTIVE">Booked</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="WAITLISTED">Waitlist</option>
            </select>
          </label>
          <label className="inline">
            Activity from <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="inline">
            to <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
        </div>
      </section>
      <ErrorMessage error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : data?.items.length === 0 ? (
        <Empty title="No registrations found." />
      ) : data ? (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Attendee</th>
                <th>Workshop</th>
                <th>Status</th>
                <th>Registered</th>
                <th>Cancelled</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r._id}>
                  <td data-label="Attendee">
                    {r.attendeeName}
                    <div className="muted">{r.attendeeEmail}</div>
                  </td>
                  <td data-label="Workshop">
                    {r.workshop ? (
                      <>
                        <Link to={`/workshops/${r.workshop._id}`}>{r.workshop.title}</Link>
                        <div className="muted">
                          {r.workshop.code} · {fmtDateTime(r.workshop.startsAt)}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td data-label="Status">
                    <StatusBadge status={r.status} />
                  </td>
                  <td data-label="Registered">
                    {fmtDateTime(r.registeredAt)}
                    <div className="muted">by {r.registeredBy?.name ?? '—'}</div>
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
          <Pager page={page} pages={pages} total={data.total} onPage={setPage} />
        </>
      ) : null}
    </>
  );
}

export function Pager({ page, pages, total, onPage }) {
  if (pages <= 1) return <p className="muted">{total} record{total === 1 ? '' : 's'}</p>;
  return (
    <div className="pager">
      <button type="button" className="btn btn-small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Newer
      </button>
      <span className="muted">
        Page {page} of {pages} · {total} records
      </span>
      <button type="button" className="btn btn-small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Older →
      </button>
    </div>
  );
}
