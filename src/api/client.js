// Thin fetch wrapper: attaches the in-memory access token, transparently
// rotates expired sessions via the httpOnly refresh cookie, and surfaces
// server error codes for i18n mapping.
let accessToken = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

// Upload components (XHR) need the in-memory token at request time.
export const getAccessToken = () => accessToken;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

async function rawRequest(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.code || 'INTERNAL_ERROR', data.message);
  return data;
}

let refreshInFlight = null;

// One shared refresh attempt; concurrent 401s wait on the same promise.
export function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = rawRequest('/auth/refresh', { method: 'POST' })
      .then((data) => {
        setAccessToken(data.accessToken);
        return data.user;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function request(path, options) {
  // Auth endpoints surface their own errors (wrong password, expired session);
  // everything else retries once through the refresh flow on a stale token.
  if (path.startsWith('/auth/')) return rawRequest(path, options);
  try {
    return await rawRequest(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      try {
        await refreshSession();
      } catch {
        throw err;
      }
      return rawRequest(path, options);
    }
    throw err;
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  refreshSession,
};

// --- multipart / binary helpers (shared; do not alter JSON paths above) ---

function authHeaders(extra = {}) {
  return accessToken ? { Authorization: `Bearer ${accessToken}`, ...extra } : extra;
}

async function withRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      await refreshSession();
      return fn();
    }
    throw err;
  }
}

// POST FormData (file uploads) with the standard 401-refresh retry.
export function requestForm(path, formData, { method = 'POST' } = {}) {
  return withRetry(async () => {
    let res;
    try {
      res = await fetch(`/api${path}`, { method, headers: authHeaders(), credentials: 'include', body: formData });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.code || 'INTERNAL_ERROR', data.message);
    return data;
  });
}

// GET a private file as a Blob (authenticated downloads/previews).
export async function requestBlob(path) {
  return withRetry(async () => {
    let res;
    try {
      res = await fetch(`/api${path}`, { headers: authHeaders(), credentials: 'include' });
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR');
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data.code || 'INTERNAL_ERROR', data.message);
    }
    return res.blob();
  });
}
