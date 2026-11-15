// cloud-auth.js — autenticación Supabase para METZTLI Caja.
// Esta etapa habilita inicio de sesión y verificación de membresía; aún no sincroniza registros.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, BUSINESS_ID, BUSINESS_NAME } from './cloud-config.js';

const SESSION_KEY = 'metztli.supabase.session.v1';
const API = SUPABASE_URL.replace(/\/$/, '');
let refreshPromise = null;

function readSession() {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return value && value.access_token && value.refresh_token ? value : null;
  } catch { return null; }
}
function saveSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}
function messageFrom(data, fallback) {
  return data?.msg || data?.message || data?.error_description || data?.error || fallback;
}
async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!response.ok) {
    const error = new Error(messageFrom(data, 'Supabase respondió con HTTP ' + response.status));
    error.status = response.status;
    throw error;
  }
  return data;
}
async function refreshSession(session) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = request('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: session.refresh_token }
  }).then((next) => {
    saveSession(next);
    return next;
  }).catch((error) => {
    if (error.status === 400 || error.status === 401) saveSession(null);
    throw error;
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}
export async function getSession() {
  let session = readSession();
  if (!session) return null;
  if (Number(session.expires_at || 0) * 1000 < Date.now() + 60_000) {
    session = await refreshSession(session);
  }
  return session;
}
export async function signIn(email, password) {
  const session = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: String(email).trim(), password: String(password) }
  });
  saveSession(session);
  try {
    const profile = await getCloudProfile();
    await registerDevice(profile);
    return profile;
  } catch (error) {
    // Conserva la sesión para que un problema de red temporal no obligue a repetir el login.
    throw error;
  }
}
export async function signOut() {
  const session = readSession();
  try {
    if (session?.access_token) {
      await request('/auth/v1/logout', { method: 'POST', token: session.access_token });
    }
  } finally { saveSession(null); }
}
export async function getCloudProfile() {
  const session = await getSession();
  if (!session?.access_token) return null;
  const user = await request('/auth/v1/user', { token: session.access_token });
  const memberships = await request(
    '/rest/v1/business_members?select=business_id,role&user_id=eq.' +
    encodeURIComponent(user.id) + '&business_id=eq.' + encodeURIComponent(BUSINESS_ID),
    { token: session.access_token }
  );
  const membership = Array.isArray(memberships) ? memberships[0] : null;
  if (!membership) {
    const error = new Error('Tu cuenta inició sesión, pero no tiene acceso al negocio METZTLI Caja.');
    error.code = 'NO_BUSINESS_MEMBERSHIP';
    throw error;
  }
  return {
    userId: user.id,
    email: user.email || '',
    businessId: membership.business_id,
    businessName: BUSINESS_NAME,
    role: membership.role,
    accessToken: session.access_token
  };
}
async function registerDevice(profile) {
  const session = await getSession();
  if (!session?.access_token) return;
  let deviceId = localStorage.getItem('metztli.device.id');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('metztli.device.id', deviceId);
  }
  const platform = /Android/i.test(navigator.userAgent) ? 'android'
    : /Windows/i.test(navigator.userAgent) ? 'windows' : 'web';
  const deviceName = 'METZTLI-' + platform.toUpperCase() + '-' + deviceId.slice(0, 8);
  const existing = await request(
    '/rest/v1/sync_devices?select=id&business_id=eq.' + encodeURIComponent(profile.businessId) +
    '&user_id=eq.' + encodeURIComponent(profile.userId) +
    '&device_name=eq.' + encodeURIComponent(deviceName),
    { token: session.access_token }
  );
  if (!Array.isArray(existing) || existing.length === 0) {
    await request('/rest/v1/sync_devices', {
      method: 'POST',
      token: session.access_token,
      body: {
        business_id: profile.businessId,
        user_id: profile.userId,
        device_name: deviceName,
        platform
      },
      headers: { Prefer: 'return=minimal' }
    });
  }
}
