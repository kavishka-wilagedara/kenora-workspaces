import { useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Alert, ConfirmDialog, Empty, ErrorMessage, Field, Loading, Modal } from '../components/ui.jsx';
import { ROLE_LABELS } from '../utils/roles.js';
import { useApi } from '../utils/useApi.js';

const ROLE_HELP = {
  ADMIN: 'Manages staff accounts only',
  MANAGER: 'Schedules workshops and registers attendees',
  STAFF: 'Registers and cancels attendees',
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const { data, error, loading, reload } = useApi(() => api.listUsers().then((r) => r.items), []);
  const [creating, setCreating] = useState(false);
  const [resetting, setResetting] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [flash, setFlash] = useState(null);
  // Errors surface inside the confirm dialog that triggered the update.
  async function update(u, body, message) {
    await api.updateUser(u._id, body);
    setFlash(message);
    await reload();
  }

  return (
    <>
      <div className="page-head">
        <h1>Staff accounts</h1>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          + Add staff member
        </button>
      </div>
      <Alert kind="success" onClose={() => setFlash(null)}>
        {flash}
      </Alert>
      <ErrorMessage error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : data?.length === 0 ? (
        <Empty title="No accounts yet." />
      ) : data ? (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {data.map((u) => {
              const self = u._id === me._id;
              return (
                <tr key={u._id} className={u.active ? '' : 'inactive'}>
                  <td data-label="Name">
                    {u.name} {self && <span className="muted">(you)</span>}
                  </td>
                  <td data-label="Email">{u.email}</td>
                  <td data-label="Role">
                    <select
                      aria-label={`Role for ${u.name}`}
                      value={u.role}
                      disabled={self}
                      title={self ? 'You cannot change your own role' : ROLE_HELP[u.role]}
                      onChange={(e) => {
                        // Capture now: the controlled select snaps back to u.role until confirmed.
                        const role = e.target.value;
                        setConfirm({
                          title: 'Change role?',
                          message: `${u.name} will become ${ROLE_LABELS[role]} (${ROLE_HELP[role].toLowerCase()}). This takes effect immediately.`,
                          label: 'Change role',
                          run: () => update(u, { role }, `${u.name} is now ${ROLE_LABELS[role]}.`),
                        });
                      }}
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="Status">
                    <span className={`badge ${u.active ? 'badge-green' : 'badge-grey'}`}>{u.active ? 'Active' : 'Deactivated'}</span>
                  </td>
                  <td className="right nowrap">
                    <button type="button" className="btn btn-small" onClick={() => setResetting(u)}>
                      Reset password
                    </button>{' '}
                    {!self && (
                      <button
                        type="button"
                        className={`btn btn-small ${u.active ? 'btn-danger-outline' : ''}`}
                        onClick={() =>
                          setConfirm({
                            title: u.active ? 'Deactivate account?' : 'Reactivate account?',
                            message: u.active
                              ? `${u.name} will be signed out and won’t be able to sign in. Their past actions stay in the history.`
                              : `${u.name} will be able to sign in again.`,
                            label: u.active ? 'Deactivate' : 'Reactivate',
                            danger: u.active,
                            run: () => update(u, { active: !u.active }, `${u.name} has been ${u.active ? 'deactivated' : 'reactivated'}.`),
                          })
                        }
                      >
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      <CreateUserModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(u) => {
          setFlash(`Account created for ${u.name}. Share the temporary password with them in person.`);
          reload();
        }}
      />
      <ResetPasswordModal
        user={resetting}
        onClose={() => setResetting(null)}
        onDone={(u) => {
          setFlash(`Password reset for ${u.name}.`);
        }}
      />
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.label}
        danger={confirm?.danger}
        onConfirm={() => confirm.run()}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}

function CreateUserModal({ open, onClose, onCreated }) {
  const blank = { name: '', email: '', role: 'STAFF', password: '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const fe = error?.fieldErrors?.() ?? {};

  function close() {
    setForm(blank);
    setError(null);
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.createUser(form);
      onCreated(user);
      close();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Add staff member" onClose={close}>
      <form onSubmit={submit}>
        {error && !Object.keys(fe).length && <ErrorMessage error={error} />}
        <Field label="Full name" error={fe.name}>
          {(id) => <input id={id} required value={form.name} onChange={set('name')} />}
        </Field>
        <Field label="Email" error={fe.email}>
          {(id) => <input id={id} type="email" required value={form.email} onChange={set('email')} />}
        </Field>
        <Field label="Role" hint={ROLE_HELP[form.role]}>
          {(id) => (
            <select id={id} value={form.role} onChange={set('role')}>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Temporary password" error={fe.password} hint="At least 8 characters">
          {(id) => <input id={id} type="text" required minLength={8} value={form.password} onChange={set('password')} autoComplete="new-password" />}
        </Field>
        <div className="actions">
          <button type="button" className="btn" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function close() {
    setPassword('');
    setError(null);
    onClose();
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.updateUser(user._id, { password });
      onDone(user);
      close();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!user} title={`Reset password for ${user?.name ?? ''}`} onClose={close}>
      <form onSubmit={submit}>
        <ErrorMessage error={error} />
        <Field label="New temporary password" hint="At least 8 characters">
          {(id) => <input id={id} type="text" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />}
        </Field>
        <div className="actions">
          <button type="button" className="btn" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Set password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
