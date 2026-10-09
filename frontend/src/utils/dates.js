const pad = (n) => String(n).padStart(2, '0');

export const fmtDay = (d) =>
  new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtTime = (d) => new Date(d).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const fmtDateTime = (d) => (d ? `${fmtDay(d)}, ${fmtTime(d)}` : '');
export const fmtRange = (start, end) => `${fmtDay(start)} · ${fmtTime(start)} – ${fmtTime(end)}`;

export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday-to-Sunday week containing `d`. */
export function weekRange(d = new Date()) {
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  const monday = startOfDay(addDays(d, -offset));
  return [monday, endOfDay(addDays(monday, 6))];
}

export const RANGE_PRESETS = {
  today: { label: 'Today', range: () => [startOfDay(), endOfDay()] },
  week: { label: 'This week', range: () => weekRange() },
  next7: { label: 'Next 7 days', range: () => [startOfDay(), endOfDay(addDays(new Date(), 6))] },
  all: { label: 'All dates', range: () => [null, null] },
};

/** yyyy-mm-dd for <input type="date"> */
export const toDateInput = (d) => (d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : '');
/** yyyy-mm-ddThh:mm for <input type="datetime-local"> (local time) */
export const toDateTimeInput = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${toDateInput(x)}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
};
/** Parse a yyyy-mm-dd input as a local date. */
export const fromDateInput = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
