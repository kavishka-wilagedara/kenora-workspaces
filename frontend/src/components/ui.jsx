import { useEffect, useId, useRef, useState } from 'react';

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" /> {label}
    </div>
  );
}

export function ErrorMessage({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      <span>{error.message || String(error)}</span>
      {onRetry && (
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function Alert({ kind = 'info', children, onClose }) {
  if (!children) return null;
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onClose && (
        <button type="button" className="alert-close" aria-label="Dismiss" onClick={onClose}>
          ×
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="state empty">
      <strong>{title}</strong>
      {children && <div>{children}</div>}
    </div>
  );
}

const STATUS_CLASS = {
  SCHEDULED: 'badge-blue',
  CANCELLED: 'badge-grey',
  COMPLETED: 'badge-green',
  ACTIVE: 'badge-green',
  WAITLISTED: 'badge-amber',
};
const STATUS_LABEL = { SCHEDULED: 'Scheduled', CANCELLED: 'Cancelled', COMPLETED: 'Completed', ACTIVE: 'Booked', WAITLISTED: 'Waitlist' };

export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_CLASS[status] ?? ''}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function Seats({ workshop, large = false }) {
  const { capacity, activeCount, seatsAvailable } = workshop;
  const pct = Math.min(100, Math.round((activeCount / capacity) * 100));
  const tone = seatsAvailable === 0 ? 'full' : seatsAvailable <= Math.max(2, capacity * 0.2) ? 'low' : 'ok';
  return (
    <div className={`seats seats-${tone} ${large ? 'seats-large' : ''}`}>
      <div className="seats-text">
        <strong>{seatsAvailable === 0 ? 'Full' : `${seatsAvailable} left`}</strong>
        <span className="muted">
          {activeCount} / {capacity} booked
        </span>
      </div>
      <div className="seats-bar" aria-hidden="true">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Field({ label, error, hint, children }) {
  const id = useId();
  const child = typeof children === 'function' ? children(id) : children;
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {child}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

/** Accessible modal built on <dialog>. */
export function Modal({ open, title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onCancel={(e) => (e.preventDefault(), onClose())}>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}

/** Confirm with an optional free-text reason. `onConfirm(reason)` may return a promise. */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger, askReason, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={title} onClose={() => !busy && onClose()}>
      <form onSubmit={submit}>
        <p>{message}</p>
        {askReason && (
          <Field label="Reason (optional)">
            {(id) => (
              <textarea id={id} rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
            )}
          </Field>
        )}
        <ErrorMessage error={error} />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Go back
          </button>
          <button type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy} autoFocus>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
