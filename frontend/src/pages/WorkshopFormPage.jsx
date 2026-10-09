import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { ErrorMessage, Field, Loading } from '../components/ui.jsx';
import { LOCATIONS } from '../utils/constants.js';
import { toDateTimeInput } from '../utils/dates.js';

const EMPTY = {
  code: '',
  title: '',
  instructor: '',
  location: LOCATIONS[0],
  startsAt: '',
  endsAt: '',
  capacity: 10,
  status: 'SCHEDULED',
  description: '',
};

function validate(f) {
  const e = {};
  if (!/^[A-Za-z0-9-]{2,20}$/.test(f.code.trim())) e.code = 'Use 2–20 letters, numbers or dashes, e.g. POT-101';
  if (!f.title.trim()) e.title = 'Enter a title';
  if (!f.instructor.trim()) e.instructor = 'Enter the instructor';
  if (!f.startsAt) e.startsAt = 'Choose a start date and time';
  if (!f.endsAt) e.endsAt = 'Choose an end date and time';
  else if (f.startsAt && new Date(f.endsAt) <= new Date(f.startsAt)) e.endsAt = 'End must be after the start';
  const cap = Number(f.capacity);
  if (!Number.isInteger(cap) || cap < 1) e.capacity = 'Enter a whole number of at least 1';
  return e;
}

export default function WorkshopFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [original, setOriginal] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api
      .getWorkshop(id)
      .then(({ workshop: w }) => {
        setOriginal(w);
        setForm({
          ...EMPTY,
          ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, w[k] ?? EMPTY[k]])),
          startsAt: toDateTimeInput(w.startsAt),
          endsAt: toDateTimeInput(w.endsAt),
        });
      })
      .catch(setLoadError);
  }, [id, isEdit]);

  if (loadError) return <ErrorMessage error={loadError} />;
  if (isEdit && !original) return <Loading />;

  const errors = validate(form);
  const serverFields = error?.fieldErrors?.() ?? {};
  if (error?.code === 'CAPACITY_BELOW_REGISTRATIONS') serverFields.capacity = error.message;
  const fieldError = (k) => (submitted && errors[k]) || serverFields[k];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    setBusy(true);
    setError(null);
    const body = {
      ...form,
      code: form.code.trim().toUpperCase(),
      capacity: Number(form.capacity),
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: new Date(form.endsAt).toISOString(),
    };
    try {
      let saved;
      if (isEdit) {
        // Send only what changed, so we never overwrite someone else's edit to another field.
        const changed = Object.fromEntries(
          Object.entries(body).filter(([k, v]) =>
            k === 'startsAt' || k === 'endsAt' ? new Date(original[k]).getTime() !== new Date(v).getTime() : original[k] !== v,
          ),
        );
        saved = Object.keys(changed).length ? (await api.updateWorkshop(id, changed)).workshop : original;
      } else {
        saved = (await api.createWorkshop(body)).workshop;
      }
      navigate(`/workshops/${saved._id}`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const showGeneralError = error && error.code !== 'CAPACITY_BELOW_REGISTRATIONS' && !Object.keys(error.fieldErrors()).length;

  return (
    <>
      <p>
        <Link to={isEdit ? `/workshops/${id}` : '/workshops'}>← Back</Link>
      </p>
      <h1>{isEdit ? `Edit ${original.code}` : 'New workshop'}</h1>
      <form className="card form-grid" onSubmit={submit} noValidate>
        {showGeneralError && <ErrorMessage error={error} />}
        <Field label="Workshop code" error={fieldError('code')} hint="Short unique code, e.g. POT-101">
          {(fid) => <input id={fid} value={form.code} onChange={set('code')} style={{ textTransform: 'uppercase' }} />}
        </Field>
        <Field label="Title" error={fieldError('title')}>
          {(fid) => <input id={fid} value={form.title} onChange={set('title')} />}
        </Field>
        <Field label="Instructor" error={fieldError('instructor')}>
          {(fid) => <input id={fid} value={form.instructor} onChange={set('instructor')} />}
        </Field>
        <Field label="Centre" error={fieldError('location')}>
          {(fid) => (
            <select id={fid} value={form.location} onChange={set('location')}>
              {LOCATIONS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Starts" error={fieldError('startsAt')}>
          {(fid) => <input id={fid} type="datetime-local" value={form.startsAt} onChange={set('startsAt')} />}
        </Field>
        <Field label="Ends" error={fieldError('endsAt')}>
          {(fid) => <input id={fid} type="datetime-local" value={form.endsAt} min={form.startsAt} onChange={set('endsAt')} />}
        </Field>
        <Field
          label="Capacity (seats)"
          error={fieldError('capacity')}
          hint={isEdit && original.activeCount > 0 ? `${original.activeCount} already registered, so it can’t go below that.` : undefined}
        >
          {(fid) => <input id={fid} type="number" min={Math.max(1, original?.activeCount ?? 1)} step="1" value={form.capacity} onChange={set('capacity')} />}
        </Field>
        <Field label="Status" error={fieldError('status')} hint={isEdit ? 'Cancelling a workshop stops new registrations. Existing ones are kept.' : undefined}>
          {(fid) => (
            <select id={fid} value={form.status} onChange={set('status')}>
              <option value="SCHEDULED">Scheduled</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="COMPLETED">Completed</option>
            </select>
          )}
        </Field>
        <div className="span-2">
          <Field label="Description (optional)" error={fieldError('description')}>
            {(fid) => <textarea id={fid} rows={3} value={form.description} onChange={set('description')} maxLength={2000} />}
          </Field>
        </div>
        <div className="actions span-2">
          <Link className="btn" to={isEdit ? `/workshops/${id}` : '/workshops'}>
            Cancel
          </Link>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create workshop'}
          </button>
        </div>
      </form>
    </>
  );
}
