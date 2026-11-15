// Autenticación y contexto multiempresa. Nunca almacena contraseñas ni service_role.
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './cloud-config.js';

const API = SUPABASE_URL.replace(/\/$/, '');
const SESSION_KEY = 'metztli.supabase.session.v2';
const ACTIVE_BUSINESS_KEY = 'metztli.active-business.v1';
let refreshPromise = null;

function readSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    return s?.access_token && s?.refresh_token ? s : null;
  } catch { return null; }
}
function saveSession(s) {
  if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(SESSION_KEY);
}
function errorMessage(data, fallback) {
  return data?.msg || data?.message || data?.error_description || data?.error || fallback;
}
async function request(path, { method='GET', body, token, headers={} }={}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    const e = new Error(errorMessage(data, 'Error de Supabase (' + response.status + ')'));
    e.status = response.status;
    throw e;
  }
  return data;
}
async function refreshSession(s) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = request('/auth/v1/token?grant_type=refresh_token', {
    method:'POST', body:{ refresh_token:s.refresh_token }
  }).then(next => { saveSession(next); return next; })
    .catch(e => { if ([400,401].includes(e.status)) saveSession(null); throw e; })
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}
export async function getSession() {
  let s = readSession();
  if (!s) return null;
  if (Number(s.expires_at || 0) * 1000 < Date.now() + 60000) s = await refreshSession(s);
  return s;
}
export async function signUp(email, password) {
  const data = await request('/auth/v1/signup', {
    method:'POST', body:{ email:String(email).trim().toLowerCase(), password:String(password) }
  });
  if (data?.access_token) saveSession(data);
  return { session: data?.access_token ? data : null, confirmationRequired: !data?.access_token };
}
export async function signIn(email, password) {
  const s = await request('/auth/v1/token?grant_type=password', {
    method:'POST', body:{ email:String(email).trim().toLowerCase(), password:String(password) }
  });
  saveSession(s);
  return getCloudContext();
}
export async function signOut() {
  const s = readSession();
  try { if (s?.access_token) await request('/auth/v1/logout', {method:'POST',token:s.access_token}); }
  finally { saveSession(null); localStorage.removeItem(ACTIVE_BUSINESS_KEY); }
}
async function authed(path, options={}) {
  const s = await getSession();
  if (!s?.access_token) throw new Error('Inicia sesión para continuar.');
  return request(path, {...options, token:s.access_token});
}
export async function listBusinesses() {
  const s = await getSession();
  if (!s?.access_token) return [];
  const user = await request('/auth/v1/user', {token:s.access_token});
  const rows = await request(
    '/rest/v1/business_members?select=business_id,role,businesses(name)&user_id=eq.' +
    encodeURIComponent(user.id) + '&order=created_at.asc',
    {token:s.access_token}
  );
  return (Array.isArray(rows) ? rows : []).map(r => ({
    id:r.business_id, role:r.role, name:r.businesses?.name || 'Mi negocio'
  }));
}
export async function createBusiness(name) {
  const rows = await authed('/rest/v1/rpc/create_business', {
    method:'POST', body:{p_name:String(name).trim()}
  });
  const id = typeof rows === 'string' ? rows : rows?.id;
  if (!id) throw new Error('El servidor no devolvió el identificador del negocio.');
  localStorage.setItem(ACTIVE_BUSINESS_KEY, id);
  return getCloudContext();
}
export async function selectBusiness(businessId) {
  const memberships = await listBusinesses();
  if (!memberships.some(m => m.id === businessId)) throw new Error('No tienes acceso a ese negocio.');
  localStorage.setItem(ACTIVE_BUSINESS_KEY, businessId);
  return getCloudContext();
}
export async function getCloudContext() {
  const s = await getSession();
  if (!s?.access_token) return null;
  const user = await request('/auth/v1/user', {token:s.access_token});
  const businesses = await listBusinesses();
  let activeId = localStorage.getItem(ACTIVE_BUSINESS_KEY);
  if (!businesses.some(b => b.id === activeId)) {
    activeId = businesses.length === 1 ? businesses[0].id : '';
    if (activeId) localStorage.setItem(ACTIVE_BUSINESS_KEY, activeId);
    else localStorage.removeItem(ACTIVE_BUSINESS_KEY);
  }
  const active = businesses.find(b => b.id === activeId) || null;
  if (active) await registerDevice(user.id, active.id);
  return { userId:user.id, email:user.email || '', businesses, activeBusiness:active };
}
export async function getCloudProfile() { return getCloudContext(); }
async function registerDevice(userId, businessId) {
  const s = await getSession();
  let deviceId = localStorage.getItem('metztli.device.id');
  if (!deviceId) { deviceId = crypto.randomUUID(); localStorage.setItem('metztli.device.id', deviceId); }
  const platform = /Android/i.test(navigator.userAgent) ? 'android' : /Windows/i.test(navigator.userAgent) ? 'windows' : 'web';
  const deviceName = 'METZTLI-' + platform.toUpperCase() + '-' + deviceId.slice(0,8);
  const existing = await request('/rest/v1/sync_devices?select=id&business_id=eq.'+
    encodeURIComponent(businessId)+'&user_id=eq.'+encodeURIComponent(userId)+
    '&device_name=eq.'+encodeURIComponent(deviceName), {token:s.access_token});
  if (!Array.isArray(existing) || !existing.length) {
    await request('/rest/v1/sync_devices', {
      method:'POST', token:s.access_token,
      body:{business_id:businessId,user_id:userId,device_name:deviceName,platform},
      headers:{Prefer:'return=minimal'}
    });
  }
}
export async function acceptInvitation(invitationId) {
  if (!invitationId) throw new Error('Falta el identificador de invitación.');
  return authed('/rest/v1/rpc/accept_business_invitation', {
    method:'POST', body:{p_invitation_id:invitationId}
  });
}
export async function inviteBusinessMember(email, role, businessId) {
  return authed('/functions/v1/business-invite-member', {
    method:'POST', body:{email:String(email).trim().toLowerCase(),role,business_id:businessId}
  });
}
export async function getPlatformAdminStatus() {
  const result = await authed('/functions/v1/platform-admin-status');
  return Boolean(result?.is_platform_admin);
}
export async function invitePlatformCustomer(email) {
  return authed('/functions/v1/platform-invite-customer', {
    method:'POST', body:{email:String(email).trim().toLowerCase()}
  });
}
