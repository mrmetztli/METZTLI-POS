// auth-ui.js — Interfaz de login, registro, equipo y respaldo en la nube
import * as cloud from './supabase.js';
import * as db from './database.js';
import { toast } from './components.js';
import { escapeHtml } from './utilities.js';
import { getPermissionContext, invalidatePermissionContext } from './permissions.js';
import { renderTeamPermissions } from './team-permissions.js';

let currentMembership = null;

export async function getCurrentRole() {
  const context = await getPermissionContext();
  return context.role === 'owner' && context.local ? null : context.role;
}

export async function getCurrentPermissions() {
  return (await getPermissionContext()).permissions;
}

export async function isOwner() {
  return (await getCurrentRole()) === 'owner';
}

export function renderAccountSection(host) {
  host.innerHTML = `
    <section class="section">
      <h2>Cuenta y Equipo</h2>
      <div class="card stack" id="account-box">
        <p class="muted">Cargando…</p>
      </div>
    </section>
  `;
  loadAccountUI(host.querySelector('#account-box'));
}

async function loadAccountUI(box) {
  try {
    const session = await cloud.getSession();

    if (!session) {
      box.innerHTML = `
        <p class="muted small">Puedes usar la app sin cuenta. Crea una cuenta solo cuando quieras respaldar en la nube o agregar cajeros.</p>
        <div class="stack" style="gap:12px; max-width:360px">
          <input id="acc-email" type="email" placeholder="Correo electrónico" class="input">
          <input id="acc-pass" type="password" placeholder="Contraseña (mín. 6 caracteres)" class="input">
          <input id="acc-name" type="text" placeholder="Tu nombre (opcional)" class="input">
          <div class="row">
            <button class="btn btn-primary" id="acc-login" type="button">Iniciar sesión</button>
            <button class="btn" id="acc-register" type="button">Crear cuenta</button>
          </div>
        </div>
      `;

      box.querySelector('#acc-login').onclick = async () => {
        const email = box.querySelector('#acc-email').value.trim();
        const pass = box.querySelector('#acc-pass').value;
        if (!email || !pass) return toast('Escribe correo y contraseña', 'error');
        try {
          await cloud.signIn(email, pass);
          await afterLogin();
          toast('Sesión iniciada', 'ok');
          currentMembership = null;
          loadAccountUI(box);
        } catch (err) {
          toast(err.message || 'Error al iniciar sesión', 'error');
        }
      };

      box.querySelector('#acc-register').onclick = async () => {
        const email = box.querySelector('#acc-email').value.trim();
        const pass = box.querySelector('#acc-pass').value;
        const name = box.querySelector('#acc-name').value.trim();
        if (!email || pass.length < 6) return toast('Correo y contraseña de al menos 6 caracteres', 'error');
        try {
          await cloud.signUp(email, pass, name);
          toast('Cuenta creada. Ahora inicia sesión.', 'ok');
        } catch (err) {
          toast(err.message || 'Error al crear cuenta', 'error');
        }
      };
      return;
    }

    // Hay sesión → intentar aceptar invitación pendiente
    if (typeof cloud.acceptPendingInviteIfAny === 'function') {
  await cloud.acceptPendingInviteIfAny();
}
    currentMembership = await cloud.getMyMembership();

    if (!currentMembership) {
      box.innerHTML = `
        <p>Bienvenido. Vamos a crear tu negocio en la nube.</p>
        <input id="biz-name" type="text" class="input" placeholder="Nombre del negocio" value="Mi negocio">
        <button class="btn btn-primary" id="create-biz" type="button">Crear negocio y respaldar</button>
      `;
      box.querySelector('#create-biz').onclick = async () => {
        const name = box.querySelector('#biz-name').value.trim() || 'Mi negocio';
        try {
          await cloud.createBusiness(name);
          await doCloudBackup();
          toast('Negocio creado y datos respaldados', 'ok');
          currentMembership = await cloud.getMyMembership();
          loadAccountUI(box);
        } catch (err) {
          toast(err.message, 'error');
        }
      };
      return;
    }

    // Ya tiene negocio
    const roleLabel = currentMembership.role === 'owner' ? 'Propietario' : 'Cajero';
    const bizName = currentMembership.businesses?.name || 'Negocio';

    let html = `
      <dl class="kv">
        <dt>Correo</dt><dd>${escapeHtml(session.user.email)}</dd>
        <dt>Negocio</dt><dd>${escapeHtml(bizName)}</dd>
        <dt>Rol</dt><dd><strong>${roleLabel}</strong></dd>
      </dl>
      <div class="row" style="margin-top:12px">
        ${currentMembership.role === 'owner' ? '<button class="btn btn-primary" id="btn-backup" type="button">Respaldar ahora en la nube</button>' : ''}
        <button class="btn" id="btn-logout" type="button">Cerrar sesión</button>
      </div>
      ${currentMembership.role === 'cashier' ? '<p class="muted small">Los respaldos y la administración de la cuenta son exclusivos del propietario.</p>' : ''}
      <p class="muted small" id="backup-status" style="margin-top:8px"></p>
    `;

    // Solo el owner ve la gestión de cajeros
    if (currentMembership.role === 'owner') {
      html += `
        <div style="margin-top:28px">
          <h3>Cajeros</h3>
          <p class="muted small">Invita a alguien por correo. Cuando cree su cuenta e inicie sesión con ese correo, se unirá automáticamente como cajero.</p>
          <div class="row" style="gap:8px; margin-top:12px; max-width:420px">
            <input id="invite-email" type="email" class="input" placeholder="correo@ejemplo.com" style="flex:1">
            <button class="btn btn-primary" id="btn-invite" type="button">Invitar</button>
          </div>
          <div id="members-list" style="margin-top:16px"></div>
          <div id="invites-list" style="margin-top:12px"></div>
        </div>
      `;
    }

    box.innerHTML = html;

    box.querySelector('#btn-backup')?.addEventListener('click', async () => {
      try {
        await doCloudBackup();
        toast('Respaldo subido a la nube', 'ok');
        box.querySelector('#backup-status').textContent = 'Último respaldo: ahora';
      } catch (err) {
        toast('Error al respaldar: ' + err.message, 'error');
      }
    });

    box.querySelector('#btn-logout').onclick = async () => {
      await cloud.signOut();
      currentMembership = null;
      invalidatePermissionContext();
      toast('Sesión cerrada', 'ok');
      loadAccountUI(box);
    };

    if (currentMembership.role === 'owner') {
      box.querySelector('#btn-invite').onclick = async () => {
        const email = box.querySelector('#invite-email').value.trim();
        if (!email) return toast('Escribe un correo', 'error');
        try {
          await cloud.inviteCashier(email);
          toast('Invitación enviada (el cajero debe crear cuenta con ese correo)', 'ok');
          box.querySelector('#invite-email').value = '';
          loadMembersAndInvites(box);
        } catch (err) {
          toast(err.message, 'error');
        }
      };
      loadMembersAndInvites(box);
    }

  } catch (err) {
    box.innerHTML = `<p class="notice warn">Error: ${escapeHtml(err.message)}</p>`;
  }
}

async function loadMembersAndInvites(box) {
  const membersBox = box.querySelector('#members-list');
  const invitesBox = box.querySelector('#invites-list');
  if (!membersBox) return;
  try {
    const [members, invites] = await Promise.all([cloud.getMembers(), cloud.getInvites()]);
    await renderTeamPermissions(membersBox, members);
    const pending = invites.filter(i => !i.accepted_at);
    invitesBox.innerHTML = pending.length ? `
      <p class="muted small" style="margin-top:12px"><strong>Invitaciones pendientes:</strong></p>
      <ul style="margin:6px 0 0 18px">
        ${pending.map(i => `<li>${escapeHtml(i.email)}</li>`).join('')}
      </ul>` : '';
  } catch (err) {
    membersBox.innerHTML = `<p class="muted">No se pudieron cargar los miembros: ${escapeHtml(err.message)}</p>`;
  }
}

async function afterLogin() {
  try {
    if (typeof cloud.acceptPendingInviteIfAny === 'function') {
  await cloud.acceptPendingInviteIfAny();
}
    const membership = await cloud.getMyMembership();
    if (membership?.role === 'owner') {
      await doCloudBackup();
    }
  } catch (err) {
    console.warn('No se pudo completar el respaldo automático:', err);
  }
}

async function doCloudBackup() {
  const backup = await db.exportAll();
  await cloud.uploadBackup(backup);
}
