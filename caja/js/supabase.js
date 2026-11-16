// supabase.js — Cliente de Supabase + helpers de autenticación, negocio y respaldos
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://vkrsolqtphuxogmdtosq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_FM4JzPBJxt_q8itCAGhDSA_wlrqOj9l';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- Auth ----------

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signUp(email, password, fullName = '') {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ---------- Negocio y roles ----------

export async function getMyMembership() {
  const user = await getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('business_members')
    .select('*, businesses(*)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createBusiness(name) {
  const user = await getUser();
  if (!user) throw new Error('No hay sesión');

  // Crear negocio
  const { data: business, error: bErr } = await supabase
    .from('businesses')
    .insert({ name, owner_id: user.id })
    .select()
    .single();
  if (bErr) throw bErr;

  // Agregarme como owner
  const { error: mErr } = await supabase
    .from('business_members')
    .insert({
      business_id: business.id,
      user_id: user.id,
      role: 'owner'
    });
  if (mErr) throw mErr;

  return business;
}

export async function ensureBusiness(businessName = 'Mi negocio') {
  let membership = await getMyMembership();
  if (membership) return membership;

  // Primera vez: crear negocio
  const business = await createBusiness(businessName);
  membership = await getMyMembership();
  return membership;
}

// ---------- Respaldos en la nube ----------

export async function uploadBackup(backupObject) {
  const user = await getUser();
  const membership = await getMyMembership();
  if (!user || !membership) throw new Error('No hay sesión o negocio');

  const { error } = await supabase
    .from('backups')
    .insert({
      business_id: membership.business_id,
      user_id: user.id,
      data: backupObject,
      schema_version: backupObject.schema || 3
    });

  if (error) throw error;
}

export async function getLatestBackup() {
  const membership = await getMyMembership();
  if (!membership) return null;

  const { data, error } = await supabase
    .from('backups')
    .select('*')
    .eq('business_id', membership.business_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}
