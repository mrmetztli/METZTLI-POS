// components.js — piezas reutilizables: iconos, avisos, ventanas, estados vacíos.
import { escapeHtml } from './utilities.js';
import { pctChange } from './dashboard-store.js';

const ICONS = {
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2.5l2.2 10.5h10.6L20.5 8H6.5"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8L3 12z"/><circle cx="7.5" cy="8.5" r="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  gear: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h12v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 7h16a1 1 0 0 1 1 1v3"/><path d="M16 14h5v-3h-5a1.5 1.5 0 0 0 0 3z"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3v-6zM3 13h5l1 2h6l1-2h5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// Texto con la variación frente al periodo anterior. bad: true cuando subir es malo (gastos): la flecha sigue la
// dirección, pero el color se invierte.
export function deltaHtml(cur, prev, versus, bad = false) {
  const pct = pctChange(cur, prev);
  const tone = (up) => (up !== bad ? 'up' : 'down');
  if (prev === 0 && cur === 0) return `<span class="delta flat">Sin datos ${versus}</span>`;
  if (pct === null) return `<span class="delta ${tone(cur >= 0)}">${cur >= 0 ? '▲' : '▼'} nuevo ${versus}</span>`;
  const r = Math.round(pct);
  if (r === 0) return `<span class="delta flat">= 0% ${versus}</span>`;
  return `<span class="delta ${tone(r > 0)}">${r > 0 ? '▲ +' : '▼ '}${r}% ${versus}</span>`;
}

export function pageHeader(title, subtitle = '') {
  return `<header class="page-head"><h1>${escapeHtml(title)}</h1>${subtitle ? `<p class="muted">${escapeHtml(subtitle)}</p>` : ''}</header>`;
}

// Si pasas actionId y actionLabel, se dibuja un botón con ese id para que el módulo lo conecte.
export function emptyState({ icon: iconName = 'inbox', title, text = '', actionId = '', actionLabel = '' }) {
  const button = actionId ? `<button class="btn btn-primary" id="${escapeHtml(actionId)}" type="button">${escapeHtml(actionLabel)}</button>` : '';
  return `<div class="card empty">${icon(iconName)}<h2>${escapeHtml(title)}</h2>${text ? `<p>${escapeHtml(text)}</p>` : ''}${button}</div>`;
}

// Selector de una opción (colores o emojis). Guarda el valor en un <input hidden id="inputId">.
export const COLOR_CHOICES = ['#A855F7', '#22D3EE', '#C084FC', '#4DE3F0', '#8B5CF6', '#06B6D4', '#6366F1', '#2DD4BF', '#F43F5E', '#F59E0B', '#7C3AED', '#0E7490'];

export function choicesHtml(inputId, options, value, kind = 'swatch', label = 'Opciones') {
  const buttons = options.map((o) => `<button type="button" class="choice ${kind}" role="radio"
    aria-checked="${o === value}" aria-label="${escapeHtml(o)}" data-value="${escapeHtml(o)}"
    ${kind === 'swatch' ? `style="background:${escapeHtml(o)}"` : ''}>${kind === 'emoji' ? escapeHtml(o) : ''}</button>`).join('');
  return `<input type="hidden" id="${inputId}" value="${escapeHtml(value)}">
    <div class="choices" data-for="${inputId}" role="radiogroup" aria-label="${escapeHtml(label)}">${buttons}</div>`;
}

export function bindChoices(root, inputId) {
  const box = root.querySelector(`.choices[data-for="${inputId}"]`);
  const input = root.querySelector(`#${inputId}`);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.choice');
    if (!b) return;
    input.value = b.dataset.value;
    box.querySelectorAll('.choice').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  });
}

export function toast(message, type = '') {
  const root = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 2800);
}

// Ventana modal. Devuelve una promesa con el "value" del botón pulsado (o null si se cierra).
export function openModal({ title, message = '', actions = [{ label: 'Cerrar', value: null }] }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const previous = document.activeElement;
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h2 id="modal-title"></h2><p class="muted"></p><div class="modal-actions"></div>
        </div>
      </div>`;
    root.querySelector('h2').textContent = title;
    root.querySelector('p').textContent = message;
    const bar = root.querySelector('.modal-actions');

    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      root.innerHTML = '';
      previous?.focus?.();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) close(null);
    });

    actions.forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${a.kind ? `btn-${a.kind}` : ''}`;
      b.textContent = a.label;
      b.addEventListener('click', () => close(a.value));
      bar.appendChild(b);
      if (i === actions.length - 1) b.focus();
    });
  });
}

export async function confirmDialog({ title, message, confirmText = 'Confirmar', danger = false }) {
  const result = await openModal({
    title, message,
    actions: [
      { label: 'Cancelar', value: false },
      { label: confirmText, value: true, kind: danger ? 'danger' : 'primary' }
    ]
  });
  return result === true;
}

// Formulario en ventana modal. "html" lo arma quien llama (con escapeHtml en los datos).
// onSubmit(form) puede lanzar un Error: el mensaje se muestra y la ventana sigue abierta.
// Mientras guarda, el botón queda bloqueado para evitar registros duplicados.
export function openForm({ title, html, submitText = 'Guardar', wide = false, onReady, onSubmit }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const previous = document.activeElement;
    root.innerHTML = `
      <div class="modal-backdrop">
        <form class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="form-title">
          <h2 id="form-title"></h2>
          <div class="modal-form">${html}</div>
          <p class="form-error" role="alert" hidden></p>
          <div class="modal-actions">
            <button type="button" class="btn" data-cancel>Cancelar</button>
            <button type="submit" class="btn btn-primary" data-submit></button>
          </div>
        </form>
      </div>`;
    const form = root.querySelector('form');
    const errorBox = root.querySelector('.form-error');
    const submitBtn = root.querySelector('[data-submit]');
    root.querySelector('#form-title').textContent = title;
    submitBtn.textContent = submitText;

    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      root.innerHTML = '';
      previous?.focus?.();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    root.querySelector('[data-cancel]').addEventListener('click', () => close(false));

    let busy = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      submitBtn.disabled = true;
      errorBox.hidden = true;
      try {
        await onSubmit(form);
        close(true);
      } catch (err) {
        errorBox.textContent = err.message || 'No se pudo guardar.';
        errorBox.hidden = false;
        busy = false;
        submitBtn.disabled = false;
      }
    });

    onReady?.(form);
    form.querySelector('input:not([type=hidden]):not([type=radio]), select')?.focus();
  });
}

/**
 * Teclado numérico reutilizable (cantidades, montos, descuentos).
 * options: {
 *   title, message, value (número o string),
 *   decimals (0|2, default 0 para cantidades),
 *   min, max, allowZero (default false),
 *   confirmText, quick: number[] (botones rápidos)
 * }
 * Devuelve el número, o null si cancela.
 */
export function askNumpad({
  title = 'Cantidad',
  message = '',
  value = '',
  decimals = 0,
  min = 0,
  max = null,
  allowZero = false,
  confirmText = 'Aplicar',
  quick = []
} = {}) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const previous = document.activeElement;
    let buffer = value === '' || value === null || value === undefined ? '' : String(value);
    let fresh = true;

    const quickHtml = (quick || []).map((v) =>
      `<button type="button" class="num-quick" data-amount="${v}">${v}</button>`
    ).join('');

    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal modal-numpad" role="dialog" aria-modal="true" aria-labelledby="np-title">
          <div class="window-dots" aria-hidden="true">
            <span class="dot-cyan"></span>
            <span class="dot-cyan-light"></span>
            <span class="dot-white"></span>
          </div>
          <h2 id="np-title">${escapeHtml(title)}</h2>
          ${message ? `<p class="muted small">${escapeHtml(message)}</p>` : ''}
          <div class="numpad" id="np-pad">
            <div class="numpad-display" id="np-display">${escapeHtml(buffer || '0')}</div>
            ${quickHtml ? `<div class="numpad-quick">${quickHtml}</div>` : ''}
            <div class="numpad-grid">
              <button type="button" class="num-key" data-k="7">7</button>
              <button type="button" class="num-key" data-k="8">8</button>
              <button type="button" class="num-key" data-k="9">9</button>
              <button type="button" class="num-key num-key-action" data-k="back">⌫</button>
              <button type="button" class="num-key" data-k="4">4</button>
              <button type="button" class="num-key" data-k="5">5</button>
              <button type="button" class="num-key" data-k="6">6</button>
              <button type="button" class="num-key num-key-action" data-k="clear">C</button>
              <button type="button" class="num-key" data-k="1">1</button>
              <button type="button" class="num-key" data-k="2">2</button>
              <button type="button" class="num-key" data-k="3">3</button>
              <button type="button" class="num-key" data-k="00">00</button>
              ${decimals > 0
                ? `<button type="button" class="num-key" data-k=".">.</button>`
                : `<button type="button" class="num-key num-key-action" data-k="clear">C</button>`}
              <button type="button" class="num-key" data-k="0">0</button>
              <button type="button" class="num-key num-key-ok" data-k="ok" style="grid-column: span 2">${escapeHtml(confirmText)}</button>
            </div>
          </div>
          <p id="np-error" class="small" style="color:var(--danger)" hidden role="alert"></p>
          <div class="modal-actions">
            <button type="button" class="btn" id="np-cancel">Cancelar</button>
          </div>
        </div>
      </div>`;

    const $ = (s) => root.querySelector(s);
    const display = $('#np-display');
    const errBox = $('#np-error');

    const updateDisplay = () => { display.textContent = buffer === '' ? '0' : buffer; };

    const finish = (raw) => {
      const n = Number(raw === '' ? 0 : raw);
      if (!Number.isFinite(n)) {
        errBox.textContent = 'Número inválido.';
        errBox.hidden = false;
        return;
      }
      if (!allowZero && n <= 0) {
        errBox.textContent = 'Escribe un valor mayor a 0.';
        errBox.hidden = false;
        return;
      }
      if (n < min) {
        errBox.textContent = `El mínimo es ${min}.`;
        errBox.hidden = false;
        return;
      }
      if (max !== null && max !== undefined && n > max) {
        errBox.textContent = `El máximo es ${max}.`;
        errBox.hidden = false;
        return;
      }
      close(decimals > 0 ? Math.round(n * 100) / 100 : n);
    };

    const press = (k) => {
      errBox.hidden = true;
      if (k === 'ok') { finish(buffer); return; }
      if (k === 'clear') { buffer = ''; fresh = true; updateDisplay(); return; }
      if (k === 'back') {
        if (fresh) { buffer = ''; fresh = false; }
        else buffer = buffer.slice(0, -1);
        updateDisplay();
        return;
      }
      if (k === '.') {
        if (decimals <= 0) return;
        if (fresh) { buffer = '0.'; fresh = false; }
        else if (!buffer.includes('.')) buffer += '.';
        updateDisplay();
        return;
      }
      if (k === '00') {
        if (fresh) { buffer = '0'; fresh = false; }
        else {
          const parts = buffer.split('.');
          if (parts[1] !== undefined && parts[1].length >= decimals) return;
          if (parts[1] !== undefined) buffer += '0'.repeat(Math.min(decimals, decimals - parts[1].length));
          else buffer += '00';
        }
        updateDisplay();
        return;
      }
      if (/^\d$/.test(k)) {
        if (fresh) { buffer = k === '0' ? '0' : k; fresh = false; }
        else {
          const parts = buffer.split('.');
          if (parts[1] !== undefined && parts[1].length >= decimals) return;
          if (buffer === '0' && k !== '.') buffer = k;
          else buffer += k;
        }
        updateDisplay();
      }
    };

    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      root.innerHTML = '';
      previous?.focus?.();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); return; }
      if (e.key === 'Enter') { e.preventDefault(); press('ok'); return; }
      if (e.key === 'Backspace') { e.preventDefault(); press('back'); return; }
      if (e.key === 'Delete') { e.preventDefault(); press('clear'); return; }
      if (e.key === '.' && decimals > 0) { e.preventDefault(); press('.'); return; }
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); return; }
    };
    document.addEventListener('keydown', onKey);

    $('#np-pad').addEventListener('click', (e) => {
      const key = e.target.closest('[data-k]')?.dataset.k;
      if (key) press(key);
      const amt = e.target.closest('[data-amount]')?.dataset.amount;
      if (amt !== undefined) {
        buffer = String(amt);
        fresh = true;
        updateDisplay();
      }
    });
    $('#np-cancel').addEventListener('click', () => close(null));
    root.querySelector('.modal-backdrop').addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('modal-backdrop')) close(null);
    });
  });
}

// Pide un dato al usuario (motivo, precio…). Devuelve el texto, o null si cancela.
// validate(valor) puede devolver un mensaje de error para mantener la ventana abierta.
export function promptDialog({ title, message = '', label, value = '', type = 'text', inputMode = '', step = '', confirmText = 'Aceptar', danger = false, validate = null }) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const previous = document.activeElement;
    root.innerHTML = `
      <div class="modal-backdrop">
        <form class="modal" role="dialog" aria-modal="true" aria-labelledby="pd-title" novalidate>
          <h2 id="pd-title"></h2><p class="muted" id="pd-msg"></p>
          <div class="field"><label for="pd-input"></label><input id="pd-input" class="input"></div>
          <p id="pd-error" role="alert" class="small" style="color:var(--danger)" hidden></p>
          <div class="modal-actions">
            <button type="button" class="btn" id="pd-cancel">Cancelar</button>
            <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="pd-ok"></button>
          </div>
        </form>
      </div>`;
    root.querySelector('#pd-title').textContent = title;
    root.querySelector('#pd-msg').textContent = message;
    root.querySelector('label').textContent = label;
    root.querySelector('#pd-ok').textContent = confirmText;
    const input = root.querySelector('#pd-input');
    input.type = type;
    input.value = value;
    if (inputMode) input.inputMode = inputMode;
    if (step) { input.step = step; input.min = '0'; }

    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      root.innerHTML = '';
      previous?.focus?.();
      resolve(result);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    root.querySelector('#pd-cancel').addEventListener('click', () => close(null));
    root.querySelector('.modal-backdrop').addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('modal-backdrop')) close(null);
    });
    root.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const error = validate ? validate(input.value) : '';
      const box = root.querySelector('#pd-error');
      if (error) { box.textContent = error; box.hidden = false; input.focus(); return; }
      close(input.value);
    });
    input.focus();
    input.select();
  });
}


// Miniatura de un producto: su imagen, o la inicial / el icono de su categoría sobre su color.
export function productThumb(p, category = null, placeholder = 'letter') {
  if (p.image) return `<img src="${escapeHtml(p.image)}" alt="">`;
  const glyph = placeholder === 'icon' && category ? category.icon : p.name.charAt(0).toUpperCase();
  return `<span class="thumb-letter" style="background:${escapeHtml(p.color)}">${escapeHtml(glyph)}</span>`;
}

// Lista editable: mostrar/ocultar y reordenar con ↑ ↓ (sin arrastrar, funciona bien en el teléfono).
// items: [{ id, label, enabled, locked?, choice?: { value, options: [[valor, texto]] } }]
// onChange recibe [{ id, enabled, choice }] en el nuevo orden.
export function mountOrderEditor(host, { items, toggle = true, onChange }) {
  const list = items.map((i) => ({ ...i }));
  const draw = (focus) => {
    host.innerHTML = `<ul class="order-list">${list.map((it, i) => `
      <li class="order-row" data-id="${escapeHtml(it.id)}">
        ${toggle
          ? `<label class="check"><input type="checkbox" data-f="on" ${it.enabled ? 'checked' : ''} ${it.locked ? 'disabled' : ''}><span>${escapeHtml(it.label)}</span></label>`
          : `<span class="order-label">${escapeHtml(it.label)}</span>`}
        ${it.choice ? `<select class="input mini-select" data-f="choice" aria-label="Opciones de ${escapeHtml(it.label)}">${it.choice.options.map(([v, l]) =>
          `<option value="${escapeHtml(v)}" ${v === it.choice.value ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}</select>` : ''}
        <span class="order-btns">
          <button type="button" class="btn btn-sm" data-f="up" aria-label="Subir ${escapeHtml(it.label)}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="btn btn-sm" data-f="down" aria-label="Bajar ${escapeHtml(it.label)}" ${i === list.length - 1 ? 'disabled' : ''}>↓</button>
        </span></li>`).join('')}</ul>`;
    if (focus) (host.querySelector(`[data-id="${focus.id}"] [data-f="${focus.f}"]:not(:disabled)`) || host.querySelector(`[data-id="${focus.id}"] [data-f]:not(:disabled)`))?.focus();
  };
  const emit = () => onChange(list.map(({ id, enabled, choice }) => ({ id, enabled, choice: choice?.value })));
  // Se usan propiedades on… para que volver a montar sobre el mismo elemento no duplique los eventos.
  host.onclick = (e) => {
    const f = e.target.closest('[data-f]')?.dataset.f;
    const row = e.target.closest('.order-row');
    if (!row || (f !== 'up' && f !== 'down')) return;
    const i = list.findIndex((x) => x.id === row.dataset.id);
    const j = f === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    draw({ id: list[j].id, f });
    emit();
  };
  host.onchange = (e) => {
    const f = e.target.dataset.f;
    const row = e.target.closest('.order-row');
    if (!row) return;
    const it = list.find((x) => x.id === row.dataset.id);
    if (f === 'on') it.enabled = e.target.checked;
    if (f === 'choice') it.choice.value = e.target.value;
    emit();
  };
  draw();
}
