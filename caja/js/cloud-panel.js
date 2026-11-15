// Configuración → Nube: registro, acceso, selección de negocio y gestión básica de equipo.
import {
  signUp, signIn, signOut, getCloudContext, createBusiness, selectBusiness,
  inviteBusinessMember, invitePlatformCustomer, acceptInvitation, getPlatformAdminStatus
} from './cloud-auth.js';
import { escapeHtml } from './utilities.js';

export async function render(host) {
  host.innerHTML = `
  <section class="section">
    <h2>Cuenta y negocios</h2>
    <p class="muted small">Cada negocio mantiene sus propios datos. Puedes usar tu cuenta en varios dispositivos; la sincronización de registros todavía no está activada.</p>
    <div class="card stack" id="cloud-auth-card">
      <div class="chips" role="group" aria-label="Acceso">
        <button class="chip" type="button" data-mode="login" aria-pressed="true">Iniciar sesión</button>
        <button class="chip" type="button" data-mode="register" aria-pressed="false">Crear cuenta</button>
      </div>
      <form id="cloud-auth-form" class="stack">
        <label for="cloud-email">Correo electrónico</label>
        <input id="cloud-email" name="email" type="email" autocomplete="username" required maxlength="254">
        <label for="cloud-password">Contraseña</label>
        <input id="cloud-password" name="password" type="password" autocomplete="new-password" required minlength="8">
        <label id="business-name-label" for="cloud-business-name" hidden>Nombre de tu negocio (opcional al registrarte)</label>
        <input id="cloud-business-name" name="businessName" maxlength="120" placeholder="Ej. Papelería López" hidden>
        <button class="btn btn-primary" id="cloud-submit" type="submit">Iniciar sesión</button>
      </form>
      <p id="cloud-status" class="muted small" role="status" aria-live="polite"></p>
    </div>
    <div id="cloud-workspace"></div>
    <div class="card stack">
      <h3>Privacidad y funcionamiento</h3>
      <p class="muted small">Esta versión verifica la cuenta, los negocios y los permisos. No sube ni modifica productos, ventas, clientes, gastos o inventario. Tus datos locales permanecen intactos.</p>
    </div>
  </section>`;
  const form=host.querySelector('#cloud-auth-form'), status=host.querySelector('#cloud-status');
  const submit=host.querySelector('#cloud-submit'), workspace=host.querySelector('#cloud-workspace');
  const businessName=host.querySelector('#cloud-business-name'), businessLabel=host.querySelector('#business-name-label');
  let mode='login', context=null;

  const setStatus=(s)=>{status.textContent=s||'';};
  function setMode(next) {
    mode=next;
    host.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    submit.textContent=mode==='login'?'Iniciar sesión':'Crear cuenta';
    businessName.hidden=businessLabel.hidden=mode!=='register';
    form.querySelector('#cloud-password').autocomplete=mode==='login'?'current-password':'new-password';
  }
  host.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  function renderWorkspace() {
    if (!context) { workspace.innerHTML=''; form.hidden=false; return; }
    form.hidden=true;
    const opts=context.businesses.map(b=>`<option value="${escapeHtml(b.id)}" ${b.id===context.activeBusiness?.id?'selected':''}>${escapeHtml(b.name)} — ${escapeHtml(b.role)}</option>`).join('');
    workspace.innerHTML=`
      <div class="card stack">
        <div><strong>Sesión activa</strong><p class="muted small">${escapeHtml(context.email)}</p></div>
        ${context.businesses.length? `
          <label for="cloud-business-select">Negocio activo</label>
          <select id="cloud-business-select">${opts}</select>` : '<p class="muted small">Tu cuenta aún no pertenece a un negocio.</p>'}
        <form id="cloud-create-business" class="stack">
          <h3>Crear un negocio</h3>
          <label for="cloud-new-business">Nombre del negocio</label>
          <input id="cloud-new-business" name="name" required maxlength="120" placeholder="Nombre comercial">
          <button class="btn" type="submit">Crear negocio y asignarme como dueño</button>
        </form>
        ${context.activeBusiness && ['owner','admin'].includes(context.activeBusiness.role) ? `
          <form id="cloud-invite-member" class="stack">
            <h3>Invitar empleado o cajero</h3>
            <label for="cloud-member-email">Correo del empleado</label>
            <input id="cloud-member-email" name="email" type="email" required maxlength="254">
            <label for="cloud-member-role">Permiso</label>
            <select id="cloud-member-role" name="role">
              ${context.activeBusiness.role==='owner'?'<option value="admin">Administrador</option>':''}
              <option value="cashier">Cajero</option><option value="viewer">Solo lectura</option>
            </select>
            <button class="btn" type="submit">Enviar invitación</button>
            <p class="muted small">El invitado debe aceptar con el mismo correo. Solo el dueño puede invitar administradores.</p>
          </form>` : ''}
        ${context.isPlatformAdmin ? `
          <form id="cloud-platform-invite" class="stack">
            <h3>Administración METZTLI</h3>
            <label for="cloud-customer-email">Invitar nuevo cliente</label>
            <input id="cloud-customer-email" name="email" type="email" required maxlength="254">
            <button class="btn" type="submit">Enviar invitación al cliente</button>
            <p class="muted small">El cliente recibirá acceso para crear su propio negocio. Este permiso solo aparece a administradores de plataforma.</p>
          </form>` : ''}
        <button class="btn" id="cloud-logout" type="button">Cerrar sesión</button>
      </div>`;
    const selector=workspace.querySelector('#cloud-business-select');
    selector?.addEventListener('change',async()=>{
      try { context=await selectBusiness(selector.value); renderWorkspace(); setStatus('Negocio activo cambiado.'); }
      catch(e){setStatus(e.message);}
    });
    workspace.querySelector('#cloud-create-business')?.addEventListener('submit',async e=>{
      e.preventDefault(); const button=e.submitter; button.disabled=true;
      try { context=await createBusiness(new FormData(e.currentTarget).get('name')); renderWorkspace(); setStatus('Negocio creado. Ya eres su propietario.'); }
      catch(err){setStatus(err.message);} finally{button.disabled=false;}
    });
    workspace.querySelector('#cloud-invite-member')?.addEventListener('submit',async e=>{
      e.preventDefault(); const form=e.currentTarget, button=e.submitter; button.disabled=true;
      try {
        const data=new FormData(form);
        const result=await inviteBusinessMember(data.get('email'),data.get('role'),context.activeBusiness.id);
        form.reset();
        if(result.email_sent) setStatus('Invitación enviada por correo. El empleado debe aceptarla.');
        else if(result.acceptance_url) {
          setStatus('La cuenta ya existía. Comparte este enlace de aceptación con el empleado: ' + result.acceptance_url);
        } else setStatus('Invitación creada.');
      } catch(err){setStatus(err.message);} finally{button.disabled=false;}
    });
    workspace.querySelector('#cloud-platform-invite')?.addEventListener('submit',async e=>{
      e.preventDefault(); const form=e.currentTarget, button=e.submitter; button.disabled=true;
      try {
        const email=new FormData(form).get('email');
        await invitePlatformCustomer(email);
        form.reset(); setStatus('Invitación de cliente enviada por correo.');
      } catch(err){setStatus(err.message);} finally{button.disabled=false;}
    });
    workspace.querySelector('#cloud-logout')?.addEventListener('click',async()=>{
      try {await signOut();context=null;renderWorkspace();setStatus('Sesión cerrada en este dispositivo.');}
      catch(e){setStatus(e.message);}
    });
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    if(!navigator.onLine){setStatus('Necesitas internet para registrarte o iniciar sesión.');return;}
    submit.disabled=true;setStatus('Conectando con Supabase…');
    try {
      const data=new FormData(form), email=data.get('email'), password=data.get('password');
      if(mode==='register') {
        const result=await signUp(email,password);
        if(result.confirmationRequired){setStatus('Cuenta creada. Revisa tu correo para confirmar la dirección y después inicia sesión.');setMode('login');}
        else {
          context=await getCloudContext();
          const name=String(data.get('businessName')||'').trim();
          if(name) context=await createBusiness(name);
          renderWorkspace();setStatus('Cuenta creada correctamente.');
        }
      } else {
        context=await signIn(email,password); context.isPlatformAdmin=await getPlatformAdminStatus().catch(()=>false); renderWorkspace();
        setStatus(context.businesses.length?'Sesión iniciada.':'Sesión iniciada. Crea tu primer negocio para comenzar.');
        await finishInvitation();
      }
    } catch(err){setStatus(err.message||'No se pudo completar el acceso.');}
    finally{submit.disabled=false;}
  });
  const invitationId = new URLSearchParams(location.search).get('invitation');
  async function finishInvitation() {
    if (!invitationId || !context) return;
    try {
      await acceptInvitation(invitationId);
      history.replaceState(null, '', location.pathname + location.hash);
      context=await getCloudContext();
      context.isPlatformAdmin=await getPlatformAdminStatus().catch(()=>false);
      renderWorkspace();
      setStatus('Invitación aceptada. Ya tienes acceso al negocio.');
    } catch(err) {
      setStatus('No se pudo aceptar la invitación: ' + err.message + '. Inicia sesión con el correo al que fue enviada.');
    }
  }
  try {
    context=await getCloudContext();
    if(context){context.isPlatformAdmin=await getPlatformAdminStatus().catch(()=>false);renderWorkspace();setStatus('Sesión recuperada. Membresías verificadas con el servidor.'); await finishInvitation();}
  } catch(err){setStatus(err.message);}
}
