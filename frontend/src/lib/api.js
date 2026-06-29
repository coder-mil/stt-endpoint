/**
 * Tiny fetch wrapper that:
 *   - adds X-CSRF-Token header on non-GET (from cookie csrf_token)
 *   - same-origin cookies automatically by `credentials: 'include'`
 *   - returns parsed JSON or throws Error with .status + .body
 */

function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[2]) : null;
}

async function request(path, options = {}) {
  const opts = {
    method: options.method || 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    ...options,
  };

  // Inject CSRF token header on non-GET.
  const m = opts.method.toUpperCase();
  if (m !== 'GET' && m !== 'HEAD') {
    const csrf = getCookie('csrf_token');
    if (csrf) opts.headers['X-CSRF-Token'] = csrf;
  }
  if (options.body && typeof options.body !== 'string') {
    opts.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, opts);
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = new Error(body?.error || res.statusText);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function safejson(s) { try { return JSON.parse(s); } catch { return null; } }
function safeJson(s) { return safejson(s); }

export async function mintCsrf() {
  return request('/csrf-mint', { method: 'GET' });
}

export const api = {
  // ---- Auth ----
  register: (data) => request('/auth/register', { method: 'POST', body: data }),
  login: (data) => request('/auth/login', { method: 'POST', body: data }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request('/auth/me'),
  forgot: (email) => request('/auth/forgot-password', { method: 'POST', body: { email } }),
  reset: (token, password) =>
    request('/auth/reset-password', { method: 'POST', body: { token, password } }),

  // ---- Transcriptions ----
  listTranscriptions: () => request('/api/transcriptions'),
  getTranscription: (id) => request(`/api/transcriptions/${id}`),
  deleteTranscription: (id) =>
    request(`/api/transcriptions/${id}`, { method: 'DELETE' }),

  uploadTranscription: async (file, language = 'pt') => {
    const fd = new FormData();
    fd.append('audio', file);
    if (language) fd.append('language', language);
    const csrf = getCookie('csrf_token');
    const res = await fetch('/api/transcriptions', {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
      body: fd,
    });
    const text = await res.text();
    const body = text ? safeJson(text) : null;
    if (!res.ok) {
      const err = new Error(body?.error || res.statusText);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  },

  // ---- Docs ----
  apiDocsUrl: '/docs',
  openapiUrl: '/openapi.json',
};
