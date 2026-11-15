// cloud-panel.js — pantalla inicial de conexión de METZTLI Caja con Supabase.
import { signIn, signOut, getCloudProfile } from './cloud-auth.js';
import { BUSINESS_NAME, BUSINESS_ID } from './cloud-config.js';
import { escapeHtml } from './utilities.js';

export async function render(host) {
  host.innerHTML = `
    <section class="section">
      <h2>Sincronización en la nube</h2>
      <div class="notice">Negocio: <strong>${escapeHtml(BUSINESS_NAME)}</strong><br><span class="muted small">Esta etapa configura el acceso seguro. La sincronización de ventas, inventario y clientes se activará en una actualización posterior.</span></div>
      <div class="card stack" id="cloud-auth-card">
        <p class="muted">Comprueba tu conexión e inicia sesión con el usuario propietario que creaste en Supabase.</p>
        <form id="cloud-login" class="stack">
          <label for="cloud-email">Correo electrónico</label>
          <input id="cloud-email" name="email" type="email" autocomplete="username" required maxlength="254">
          <label for="cloud-password">Contraseña</label>
          <input id="cloud-password" name="password" type="password" autocomplete="current-password" required>
          <button class="btn btn-primary" id="cloud-login-btn" type="submit">Iniciar sesión</button>
        </form>
        <div id="cloud-status" class="muted small" role="status" aria-live="polite"></div>
        <div id="cloud-profile"></div>
      </div>
      <div class="card stack">
        <h3>Estado de esta instalación</h3>
        <dl class="kv">
          <dt>Almacenamiento local</dt><dd>Activo (IndexedDB)</dd>
          <dt>Conexión a Supabase</dt><dd id="cloud-network">Sin comprobar</dd>
          <dt>Identificador del negocio</dt><dd><code>${escapeHtml(BUSINESS_ID)}</code></dd>
        </dl>
      </div>
    </section>`;
  const form = host.querySelector('#cloud-login');
  const button = host.querySelector('#cloud-login-btn');
  const status = host.querySelector('#cloud-status');
  const profileBox = host.querySelector('#cloud-profile');
  const network = host.querySelector('#cloud-network');

  function showProfile(profile) {
    if (!profile) {
      form.hidden = false;
      profileBox.innerHTML = '';
      return;
    }
    form.hidden = true;
    profileBox.innerHTML = `
      <div class="notice">
        <strong>Sesión iniciada</strong>
        <dl class="kv">
          <dt>Cuenta</dt><dd>${escapeHtml(profile.email)}</dd>
          <dt>Negocio</dt><dd>${escapeHtml(profile.businessName)}</dd>
          <dt>Rol</dt><dd>${escapeHtml(profile.role)}</dd>
          <dt>Acceso</dt><dd>Verificado</dd>
        </dl>
      </div>
      <p class="muted small">La sesión queda guardada en este dispositivo. No compartas tu contraseña.</p>
      <button class="btn" id="cloud-logout" type="button">Cerrar sesión en este dispositivo</button>`;
    profileBox.querySelector('#cloud-logout').addEventListener('click', async () => {
      try {
        await signOut();
        showProfile(null);
        status.textContent = 'Sesión cerrada en este dispositivo.';
      } catch (error) { status.textContent = 'No se pudo cerrar la sesión en el servidor: ' + error.message; }
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!navigator.onLine) { status.textContent = 'Necesitas internet para iniciar sesión por primera vez.'; return; }
    button.disabled = true;
    status.textContent = 'Verificando cuenta y permisos…';
    try {
      const data = new FormData(form);
      const profile = await signIn(data.get('email'), data.get('password'));
      form.reset();
      showProfile(profile);
      status.textContent = 'Cuenta y acceso al negocio verificados correctamente.';
      network.textContent = 'Conectado';
    } catch (error) {
      status.textContent = error.message || 'No se pudo iniciar sesión.';
    } finally { button.disabled = false; }
  });

  window.addEventListener('online', () => { network.textContent = 'Conectado a internet'; });
  window.addEventListener('offline', () => { network.textContent = 'Sin internet'; });
  network.textContent = navigator.onLine ? 'Internet disponible' : 'Sin internet';

  try {
    const profile = await getCloudProfile();
    if (profile) {
      showProfile(profile);
      status.textContent = 'Sesión recuperada y permisos verificados.';
    }
  } catch (error) {
    status.textContent = error.message;
  }
}
