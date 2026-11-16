// auth-ui.js — Interfaz de login, registro, equipo y respaldo en la nube
import * as cloud from './supabase.js';
import * as db from './database.js';
import { toast, confirmDialog, promptDialog } from './components.js';
import { escapeHtml } from './utilities.js';

let currentMembership = null;

export async function getCurrentRole() {
  if (!currentMembership) {
    try {
      currentMembership = await cloud.getMyMembership();
    } catch {
      currentMembership = null;
    }
  }
  return currentMembership?.role || null; // 'owner' | 'cashier' | null
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
      // No hay sesión → mostrar login / registro
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
          toast('Sesión iniciada', 'ok');
          await afterLogin();
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
          toast('Cuenta creada. Revisa tu correo si pide confirmación, o inicia sesión.', 'ok');
        } catch (err) {
          toast(err.message || 'Error al crear cuenta', 'error');
        }
      };

      return;
    }

    // Hay sesión
    currentMembership = await cloud.getMyMembership();

    if (!currentMembership) {
      // Primera vez → crear negocio
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

    box.innerHTML = `
      <dl class="kv">
        <dt>Correo</dt><dd>${escapeHtml(session.user.email)}</dd>
        <dt>Negocio</dt><dd>${escapeHtml(bizName)}</dd>
        <dt>Rol</dt><dd><strong>${roleLabel}</strong></dd>
      </dl>
      <div class="row" style="margin-top:12px">
        <button class="btn btn-primary" id="btn-backup" type="button">Respaldar ahora en la nube</button>
        <button class="btn" id="btn-logout" type="button">Cerrar sesión</button>
      </div>
      <p class="muted small" id="backup-status" style="margin-top:8px"></p>
    `;

    box.querySelector('#btn-backup').onclick = async () => {
      try {
        await doCloudBackup();
        toast('Respaldo subido a la nube', 'ok');
        box.querySelector('#backup-status').textContent = 'Último respaldo: ahora';
      } catch (err) {
        toast('Error al respaldar: ' + err.message, 'error');
      }
    };

    box.querySelector('#btn-logout').onclick = async () => {
      await cloud.signOut();
      currentMembership = null;
      toast('Sesión cerrada', 'ok');
      loadAccountUI(box);
    };

    // Si es owner, mostrar sección de cajeros (próximamente más completa)
    if (currentMembership.role === 'owner') {
      const inviteHtml = document.createElement('div');
      inviteHtml.className = 'section';
      inviteHtml.innerHTML = `
        <h3 style="margin-top:24px">Cajeros</h3>
        <p class="muted small">Pronto podrás invitar cajeros por correo. Por ahora el respaldo en la nube ya está activo.</p>
      `;
      box.parentElement.appendChild(inviteHtml);
    }

  } catch (err) {
    box.innerHTML = `<p class="notice warn">Error: ${escapeHtml(err.message)}</p>`;
  }
}

async function afterLogin() {
  // Al iniciar sesión → crear negocio si no existe + respaldar
  try {
    await cloud.ensureBusiness();
    await doCloudBackup();
  } catch (err) {
    console.warn('No se pudo completar el respaldo automático:', err);
  }
}

async function doCloudBackup() {
  const backup = await db.exportAll();
  await cloud.uploadBackup(backup);
}
