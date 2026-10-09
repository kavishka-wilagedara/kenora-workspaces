import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Empty, ErrorMessage, Loading } from '../components/ui.jsx';
import { fmtDateTime } from '../utils/dates.js';
import { ROLE_LABELS } from '../utils/roles.js';
import { useApi } from '../utils/useApi.js';
import { Pager } from './HistoryPage.jsx';

const ACTION_LABELS = {
  USER_CREATED: 'Account created',
  ROLE_CHANGED: 'Role changed',
  USER_DEACTIVATED: 'Account deactivated',
  USER_REACTIVATED: 'Account reactivated',
  USER_UPDATED: 'Account updated',
  PASSWORD_RESET: 'Password reset',
  WORKSHOP_CREATED: 'Workshop created',
  WORKSHOP_UPDATED: 'Workshop edited',
};

const FIELD_LABELS = { startsAt: 'Starts', endsAt: 'Ends', activeCount: 'Booked' };

function fmtValue(field, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'role') return ROLE_LABELS[v] ?? v;
  if (field === 'active') return v ? 'Active' : 'Deactivated';
  if (field === 'startsAt' || field === 'endsAt') return fmtDateTime(v);
  return String(v);
}

function Changes({ action, changes }) {
  if (!changes) return <span className="muted">—</span>;
  const created = action.endsWith('_CREATED');
  return (
    <ul className="changes">
      {Object.entries(changes).map(([field, c]) => {
        const label = FIELD_LABELS[field] ?? field[0].toUpperCase() + field.slice(1);
        return (
          <li key={field}>
            <span className="muted">{label}:</span>{' '}
            {created ? (
              fmtValue(field, c)
            ) : (
              <>
                <s>{fmtValue(field, c.from)}</s> → {fmtValue(field, c.to)}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function AuditPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi(() => api.audit({ page, limit: 50 }), [page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <>
      <h1>Change log</h1>
      <p className="muted">
        {user.role === 'ADMIN' ? 'Changes to staff accounts and roles.' : 'Workshops created and edited.'} Who did what, and when.
      </p>
      <ErrorMessage error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : data?.items.length === 0 ? (
        <Empty title="No changes recorded yet." />
      ) : data ? (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a._id}>
                  <td data-label="When" className="nowrap">
                    {fmtDateTime(a.at)}
                  </td>
                  <td data-label="Who">{a.actor?.name ?? 'system'}</td>
                  <td data-label="What">
                    <strong>{ACTION_LABELS[a.action] ?? a.action}</strong>
                    <div className="muted">{a.entityLabel}</div>
                  </td>
                  <td data-label="Details">
                    <Changes action={a.action} changes={a.changes} />
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
