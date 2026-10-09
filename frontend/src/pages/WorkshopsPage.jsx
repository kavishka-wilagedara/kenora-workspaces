import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Empty, ErrorMessage, Loading, Seats, StatusBadge } from '../components/ui.jsx';
import { LOCATIONS } from '../utils/constants.js';
import { endOfDay, fmtDay, fmtTime, fromDateInput, RANGE_PRESETS, toDateInput } from '../utils/dates.js';
import { can } from '../utils/roles.js';
import { useApi } from '../utils/useApi.js';

// Default view answers
const DEFAULTS = { range: 'week', status: 'SCHEDULED', seats: '1', q: '', location: '', from: '', to: '' };

export default function WorkshopsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, params.get(k) ?? DEFAULTS[k]]));

  // Filters live in the URL
  const set = (patch) =>
    setParams(
      (prev) => {
        const sp = new URLSearchParams();
        for (const k of Object.keys(DEFAULTS)) {
          const v = k in patch ? patch[k] : (prev.get(k) ?? DEFAULTS[k]);
          if (v !== DEFAULTS[k]) sp.set(k, v);
        }
        return sp;
      },
      { replace: true },
    );

  // Debounce typing in the search box.
  const [search, setSearch] = useState(f.q);
  useEffect(() => {
    const t = setTimeout(() => search !== f.q && set({ q: search }), 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(() => {
    let from = null;
    let to = null;
    if (f.range === 'custom') {
      from = fromDateInput(f.from);
      to = f.to ? endOfDay(fromDateInput(f.to)) : null;
    } else {
      [from, to] = (RANGE_PRESETS[f.range] ?? RANGE_PRESETS.week).range();
    }
    return {
      from: from?.toISOString(),
      to: to?.toISOString(),
      status: f.status === 'any' ? '' : f.status,
      hasSeats: f.seats === '1' ? 'true' : '',
      location: f.location,
      q: f.q,
      limit: 100,
    };
  }, [f.range, f.from, f.to, f.status, f.seats, f.location, f.q]);

  const { data, error, loading, reload } = useApi(() => api.listWorkshops(query), [JSON.stringify(query)]);
  const isDefault = Object.keys(DEFAULTS).every((k) => f[k] === DEFAULTS[k]);

  return (
    <>
      <div className="page-head">
        <h1>Workshops</h1>
        {can.manageWorkshops(user.role) && (
          <Link className="btn btn-primary" to="/workshops/new">
            + New workshop
          </Link>
        )}
      </div>

      <section className="card filters" aria-label="Filters">
        <div className="chips" role="group" aria-label="Date range">
          {Object.entries(RANGE_PRESETS).map(([key, p]) => (
            <button key={key} type="button" className={`chip ${f.range === key ? 'on' : ''}`} aria-pressed={f.range === key} onClick={() => set({ range: key, from: '', to: '' })}>
              {p.label}
            </button>
          ))}
          <button
            type="button"
            className={`chip ${f.range === 'custom' ? 'on' : ''}`}
            aria-pressed={f.range === 'custom'}
            onClick={() => {
              const [a, b] = (RANGE_PRESETS[f.range] ?? RANGE_PRESETS.week).range();
              set({ range: 'custom', from: toDateInput(a ?? new Date()), to: toDateInput(b) });
            }}
          >
            Pick dates…
          </button>
        </div>

        <div className="filter-row">
          {f.range === 'custom' && (
            <>
              <label className="inline">
                From <input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} />
              </label>
              <label className="inline">
                To <input type="date" value={f.to} min={f.from} onChange={(e) => set({ to: e.target.value })} />
              </label>
            </>
          )}
          <label className="inline">
            Status
            <select value={f.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="SCHEDULED">Scheduled</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="any">Any status</option>
            </select>
          </label>
          <label className="inline">
            Centre
            <select value={f.location} onChange={(e) => set({ location: e.target.value })}>
              <option value="">All centres</option>
              {LOCATIONS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <label className="inline toggle">
            <input type="checkbox" checked={f.seats === '1'} onChange={(e) => set({ seats: e.target.checked ? '1' : '0' })} />
            Only with seats available
          </label>
          <input
            type="search"
            className="search"
            placeholder="Search code, title or instructor"
            aria-label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>

      <ErrorMessage error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : data && data.items.length === 0 ? (
        <Empty title="No workshops match these filters.">
          {!isDefault && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setSearch('');
                setParams({}, { replace: true });
              }}
            >
              Reset filters
            </button>
          )}
          {f.range !== 'all' && (
            <button type="button" className="btn btn-small" onClick={() => set({ range: 'all' })}>
              Show all dates
            </button>
          )}
        </Empty>
      ) : data ? (
        <>
          <p className="muted result-count" aria-live="polite">
            {data.total} workshop{data.total === 1 ? '' : 's'}
            {loading && ' · updating…'}
          </p>
          <table className="table workshops-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Workshop</th>
                <th>Centre</th>
                <th>Seats</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((w) => (
                <tr key={w._id} className="clickable" onClick={() => navigate(`/workshops/${w._id}`)}>
                  <td data-label="When">
                    <strong>{fmtDay(w.startsAt)}</strong>
                    <div className="muted">
                      {fmtTime(w.startsAt)} – {fmtTime(w.endsAt)}
                    </div>
                  </td>
                  <td data-label="Workshop">
                    <Link to={`/workshops/${w._id}`} onClick={(e) => e.stopPropagation()}>
                      {w.title}
                    </Link>
                    <div className="muted">
                      {w.code} · {w.instructor}
                    </div>
                  </td>
                  <td data-label="Centre">{w.location}</td>
                  <td data-label="Seats">
                    <Seats workshop={w} />
                  </td>
                  <td data-label="Status">
                    <StatusBadge status={w.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.total > data.items.length && (
            <p className="muted">Showing the first {data.items.length}. Narrow the filters to see the rest.</p>
          )}
        </>
      ) : null}
    </>
  );
}
