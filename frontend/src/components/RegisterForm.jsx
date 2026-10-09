import { useState } from 'react';
import { api } from '../api/client.js';
import { Alert, ErrorMessage, Field } from './ui.jsx';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate({ attendeeName, attendeeEmail }) {
  const errors = {};
  if (!attendeeName.trim()) errors.attendeeName = 'Enter the attendee’s name';
  if (!attendeeEmail.trim()) errors.attendeeEmail = 'Enter an email address';
  else if (!EMAIL_RE.test(attendeeEmail.trim())) errors.attendeeEmail = 'That doesn’t look like an email address';
  return errors;
}

export default function RegisterForm({ workshop, onDone, onSeatChange }) {
  const [form, setForm] = useState({ attendeeName: '', attendeeEmail: '' });
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fullNow, setFullNow] = useState(false); // server said full while we were typing

  const ended = new Date(workshop.endsAt) <= new Date();
  if (workshop.status !== 'SCHEDULED' || ended) {
    return (
      <p className="muted">
        This workshop is {ended && workshop.status === 'SCHEDULED' ? 'over' : workshop.status.toLowerCase()} and is not taking registrations.
      </p>
    );
  }

  const isFull = workshop.seatsAvailable === 0;
  const errors = validate(form);
  const show = (k) => (touched[k] || touched.submit) && errors[k];
  const update = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError(null);
  };

  async function submit(joinWaitlist) {
    setTouched({ submit: true });
    if (Object.keys(errors).length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.register(workshop._id, { ...form, joinWaitlist });
      const name = res.registration.attendeeName;
      const left = res.workshop.seatsAvailable;
      setForm({ attendeeName: '', attendeeEmail: '' });
      setTouched({});
      setFullNow(false);
      await onDone({
        kind: 'success',
        text: res.waitlisted
          ? `${name} is on the waitlist. They will get a seat automatically if one frees up.`
          : `${name} is registered. ${left === 0 ? 'The workshop is now full.' : `${left} seat${left === 1 ? '' : 's'} left.`}`,
      });
    } catch (err) {
      if (err.code === 'WORKSHOP_FULL') {
        setFullNow(true);
        onSeatChange();
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  }

  const serverFields = error?.fieldErrors?.() ?? {};

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit(isFull);
      }}
    >
      {isFull && !fullNow && <Alert kind="warning">This workshop is full. You can add people to the waitlist instead.</Alert>}
      {fullNow && (
        <Alert kind="warning">
          Sorry, this workshop just filled up. Someone else took the last seat. You can add {form.attendeeName.trim() || 'this person'} to the waitlist instead.
        </Alert>
      )}
      <ErrorMessage error={error && !Object.keys(serverFields).length ? error : null} />
      <Field label="Full name" error={show('attendeeName') || serverFields.attendeeName}>
        {(id) => (
          <input id={id} value={form.attendeeName} onChange={update('attendeeName')} onBlur={() => setTouched((t) => ({ ...t, attendeeName: true }))} autoComplete="off" />
        )}
      </Field>
      <Field label="Email" error={show('attendeeEmail') || serverFields.attendeeEmail}>
        {(id) => (
          <input id={id} type="email" value={form.attendeeEmail} onChange={update('attendeeEmail')} onBlur={() => setTouched((t) => ({ ...t, attendeeEmail: true }))} autoComplete="off" />
        )}
      </Field>
      <div className="actions">
        {isFull || fullNow ? (
          <button type="submit" className="btn btn-primary" disabled={busy} onClick={(e) => (e.preventDefault(), submit(true))}>
            {busy ? 'Adding…' : 'Add to waitlist'}
          </button>
        ) : (
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Registering…' : 'Register'}
          </button>
        )}
      </div>
    </form>
  );
}
