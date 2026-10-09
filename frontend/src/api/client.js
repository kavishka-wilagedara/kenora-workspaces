const BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'wrs.token';

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
    }
  },
};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  // Validation error
  fieldErrors() {
    const out = {};
    for (const d of Array.isArray(this.details) ? this.details : []) {
      if (d.field && !out[d.field]) out[d.field] = d.message;
    }
    return out;
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function request(method, path, { body, query } = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, v);
  }
  const qs = params.toString();
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}/api${path}${qs ? `?${qs}` : ''}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error ?? {};
    const err = new ApiError(res.status, e.code ?? 'ERROR', e.message ?? `Request failed (${res.status})`, e.details);
    if (res.status === 401 && path !== '/auth/login') onUnauthorized(err);
    throw err;
  }
  return data;
}

export const api = {
  login: (email, password) => request('POST', '/auth/login', { body: { email, password } }),
  me: () => request('GET', '/auth/me'),

  listWorkshops: (query) => request('GET', '/workshops', { query }),
  getWorkshop: (id) => request('GET', `/workshops/${id}`),
  createWorkshop: (body) => request('POST', '/workshops', { body }),
  updateWorkshop: (id, body) => request('PATCH', `/workshops/${id}`, { body }),

  listRegistrations: (workshopId, status = 'all') =>
    request('GET', `/workshops/${workshopId}/registrations`, { query: { status } }),
  register: (workshopId, body) => request('POST', `/workshops/${workshopId}/registrations`, { body }),
  cancelRegistration: (id, reason) => request('POST', `/registrations/${id}/cancel`, { body: { reason } }),
  history: (query) => request('GET', '/registrations/history', { query }),

  listUsers: () => request('GET', '/users'),
  createUser: (body) => request('POST', '/users', { body }),
  updateUser: (id, body) => request('PATCH', `/users/${id}`, { body }),

  audit: (query) => request('GET', '/audit', { query }),
};
