import * as cloud from './supabase.js';
import { PERMISSION_DEFS, invalidatePermissionContext } from './permissions.js';
import { escapeHtml } from './utilities.js';
import { toast } from './components.js';

export async function renderTeamPermissions(membersBox, members) {
  membersBox.innerHTML = '<p class="muted small"><strong>Miembros actuales:</strong></p><div class="stack" data-team-list style="gap:12px"></div>';
  const list = membersBox.querySelector('[data-team-list]');
  for (const member of members) {
    const card = document.createElement('section');
    card.className = 'card stack';
    if (member.role !== 'cashier') {
      card.innerHTML = '<strong>' + escapeHtml(member.profiles?.full_name || 'Sin nombre') + '</strong><span class="muted">(Propietario)</span>';
      list.append(card);
      continue;
    }
    const title = document.createElement('div');
    title.innerHTML = '<strong>' + escapeHtml(member.profiles?.full_name || 'Sin nombre') + '</strong> <span class="muted">(Cajero)</span>';
    card.append(title);
    const intro = document.createElement('p');
    intro.className = 'muted small';
    intro.textContent = 'Los permisos están desactivados inicialmente. Activa solo lo que esta persona necesita.';
    card.append(intro);
    const controls = document.createElement('div');
    controls.className = 'stack';
    for (const [key, def] of Object.entries(PERMISSION_DEFS)) {
      const label = document.createElement('label');
      label.className = 'check';
      label.style.alignItems = 'flex-start';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.permission = key;
      input.checked = member.permissions?.[key] === true;
      const copy = document.createElement('span');
      const strong = document.createElement('strong');
      strong.textContent = def.label;
      const note = document.createElement('span');
      note.className = 'muted small';
      note.textContent = def.risk;
      copy.append(strong, document.createElement('br'), note);
      label.append(input, copy);
      controls.append(label);
    }
    card.append(controls);
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn btn-primary';
    save.textContent = 'Guardar permisos';
    const status = document.createElement('p');
    status.className = 'muted small';
    save.addEventListener('click', async () => {
      const permissions = {};
      controls.querySelectorAll('[data-permission]').forEach((input) => { permissions[input.dataset.permission] = input.checked; });
      save.disabled = true;
      status.textContent = 'Guardando…';
      try {
        await cloud.updateCashierPermissions(member.id, permissions);
        invalidatePermissionContext();
        status.textContent = 'Permisos guardados. El cajero debe actualizar la aplicación para recibirlos.';
        toast('Permisos actualizados', 'ok');
      } catch (error) {
        status.textContent = 'No se pudieron guardar: ' + error.message;
        toast('No se pudieron guardar los permisos', 'error');
      } finally { save.disabled = false; }
    });
    card.append(save, status);
    list.append(card);
  }
}
