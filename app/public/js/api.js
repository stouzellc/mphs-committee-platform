let session = { user: null, mode: 'local-demo', private: false };

export async function req(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: { 'X-MPHS': '1' } };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opts); } catch { return { ok: false, status: 0, data: { error: 'Cannot reach the local server. Is it running?' } }; }
  let data = {};
  const type = res.headers.get('Content-Type') || '';
  if (type.includes('application/json')) data = await res.json();
  else data = { text: await res.text() };
  if (res.status === 401 && session.user) { session.user = null; window.dispatchEvent(new Event('session-changed')); }
  return { ok: res.ok, status: res.status, data };
}

// Sends a file's bytes as the request body (photo uploads). The server checks the bytes, not the file name.
export async function upload(url, file) {
  let res;
  try { res = await fetch(url, { method: 'PUT', credentials: 'same-origin', headers: { 'X-MPHS': '1', 'Content-Type': file.type || 'application/octet-stream' }, body: file }); } catch { return { ok: false, status: 0, data: { error: 'Cannot reach the local server. Is it running?' } }; }
  const data = (res.headers.get('Content-Type') || '').includes('application/json') ? await res.json() : {};
  return { ok: res.ok, status: res.status, data };
}

export async function loadSession() {
  const r = await req('GET', '/api/session');
  if (r.ok) session = r.data;
  return session;
}
export const currentUser = () => session.user;
export const mode = () => session.mode;
export const isPrivate = () => !!session.private;
export function setUser(u) { session.user = u; window.dispatchEvent(new Event('session-changed')); }
export const has = (perm) => !!session.user && session.user.permissions.includes(perm);

export async function login(username, password) {
  const r = await req('POST', '/api/login', { username, password });
  if (r.ok) { session.user = r.data.user; window.dispatchEvent(new Event('session-changed')); }
  return r;
}
export async function logout() {
  await req('POST', '/api/logout', {});
  session.user = null;
  window.dispatchEvent(new Event('session-changed'));
}
