// settings-common.js — ayudantes compartidos por las secciones de Configuración.
import { getConfig, updateConfig } from './state.js';
import { toast } from './components.js';
import { escapeHtml } from './utilities.js';

// Guarda un cambio de configuración (se ve al instante). Devuelve true si se guardó.
export async function save(mutator, message = 'Cambios guardados') {
  try {
    await updateConfig(mutator);
    toast(message, 'ok');
    return true;
  } catch (err) {
    toast('No se pudo guardar: ' + err.message, 'error');
    return false;
  }
}

export const options = (pairs, current) => pairs
  .map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(value) === String(current) ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');

// Campo de texto o número: guarda al terminar de editar. read() da el valor guardado (para deshacer si hay error).
export function bindField(root, selector, { read, validate, apply, message }) {
  const el = root.querySelector(selector);
  el.addEventListener('change', () => {
    const value = el.value.trim();
    const error = validate ? validate(value) : '';
    if (error) { toast(error, 'error'); el.value = read(); return; }
    el.value = value;
    save((cfg) => apply(cfg, value), message);
  });
  return el;
}

export function bindSelect(root, selector, apply) {
  root.querySelector(selector).addEventListener('change', (e) => save((cfg) => apply(cfg, e.target.value)));
}

export const cfgNow = () => getConfig();
