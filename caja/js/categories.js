// categories.js — pantalla para administrar categorías (se abre desde Catálogo).
import * as store from './catalog-store.js';
import { pageHeader, toast, confirmDialog, openModal, choicesHtml, bindChoices, COLOR_CHOICES } from './components.js';
import { escapeHtml } from './utilities.js';

export const CATEGORY_ICONS = ['🏷️', '🍔', '☕', '🥤', '🍰', '🛒', '👕', '💇', '🔧', '📦', '🧴', '📚', '🎁', '🧾', '🍎', '⭐', '🍕', '🧁', '🥗', '🧊', '🖨️', '📱', '💻', '🪑', '🧹', '🌿', '💊', '🧸', '⚽', '🎨'];

export async function renderCategories(root, { onBack }) {
  const state = { view: 'list', editingId: null };

  async function draw() {
    if (state.view === 'form') return drawForm();
    return drawList();
  }

  async function run(action, okMessage) {
    try {
      await action();
      if (okMessage) toast(okMessage, 'ok');
    } catch (err) {
      await openModal({ title: 'No se pudo completar', message: err.message });
    }
    await draw();
  }

  async function drawList() {
    const [cats, prods] = await Promise.all([store.listCategories(), store.listProducts()]);
    const countOf = (id) => prods.filter((p) => p.categoryId === id).length;

    const rows = cats.map((c, i) => `
      <div class="card crow" data-id="${c.id}">
        <div class="crow-main">
          <span class="cat-dot" style="background:${escapeHtml(c.color)}">${escapeHtml(c.icon)}</span>
          <div><strong>${escapeHtml(c.name)}</strong>
            ${c.hidden ? '<span class="badge">Oculta</span>' : ''}
            <div class="muted small">${countOf(c.id)} producto(s)${c.description ? ' · ' + escapeHtml(c.description) : ''}</div></div>
        </div>
        <div class="row">
          <button class="btn btn-sm" data-act="up" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="btn btn-sm" data-act="down" aria-label="Bajar" ${i === cats.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="btn btn-sm" data-act="edit">Editar</button>
          <button class="btn btn-sm" data-act="hide">${c.hidden ? 'Mostrar' : 'Ocultar'}</button>
          <button class="btn btn-sm" data-act="delete">Eliminar</button>
        </div>
      </div>`).join('');

    root.innerHTML = pageHeader('Categorías', 'Organiza tus productos y servicios') + `
      <div class="row" style="margin-bottom:16px">
        <button class="btn" id="cat-back" type="button">← Volver al catálogo</button>
        <button class="btn btn-primary" id="cat-new" type="button">Nueva categoría</button>
      </div>
      <div class="stack">${rows || `<div class="card empty"><h2>Aún no tienes categorías</h2>
        <p>Crea categorías como “Bebidas” o “Servicios” para encontrar tus productos más rápido al vender.</p></div>`}</div>`;

    root.querySelector('#cat-back').addEventListener('click', onBack);
    root.querySelector('#cat-new').addEventListener('click', () => { state.view = 'form'; state.editingId = null; draw(); window.scrollTo(0, 0); });

    root.querySelectorAll('.crow').forEach((row) => {
      const id = row.dataset.id;
      const cat = cats.find((c) => c.id === id);
      row.addEventListener('click', async (e) => {
        const act = e.target.closest('[data-act]')?.dataset.act;
        if (!act) return;
        if (act === 'up') await run(() => store.moveCategory(id, -1));
        if (act === 'down') await run(() => store.moveCategory(id, 1));
        if (act === 'hide') await run(() => store.setCategoryHidden(id, !cat.hidden), cat.hidden ? 'Categoría visible' : 'Categoría oculta');
        if (act === 'edit') { state.view = 'form'; state.editingId = id; await draw(); window.scrollTo(0, 0); }
        if (act === 'delete') {
          const yes = await confirmDialog({ title: `¿Eliminar “${cat.name}”?`, message: 'Esta acción no se puede deshacer.', confirmText: 'Eliminar', danger: true });
          if (yes) await run(() => store.deleteCategory(id), 'Categoría eliminada');
        }
      });
    });
  }

  async function drawForm() {
    const cats = await store.listCategories();
    const c = cats.find((x) => x.id === state.editingId) || { name: '', description: '', color: COLOR_CHOICES[0], icon: CATEGORY_ICONS[0] };
    root.innerHTML = pageHeader(state.editingId ? 'Editar categoría' : 'Nueva categoría') + `
      <form class="card stack" id="cat-form" novalidate>
        <div class="notice warn" id="cat-error" role="alert" hidden></div>
        <div class="field"><label for="c-name">Nombre</label>
          <input id="c-name" class="input" maxlength="40" value="${escapeHtml(c.name)}" required></div>
        <div class="field"><label for="c-desc">Descripción (opcional)</label>
          <input id="c-desc" class="input" maxlength="120" value="${escapeHtml(c.description)}"></div>
        <div class="field">
          <label for="c-icon">Icono (emoji)</label>
          <div class="row emoji-picker-row">
            <input id="c-icon" class="input emoji-input" maxlength="8" value="${escapeHtml(c.icon || '🏷️')}" aria-label="Emoji de la categoría" autocomplete="off">
            <span class="emoji-preview" id="c-icon-prev" aria-hidden="true">${escapeHtml(c.icon || '🏷️')}</span>
          </div>
          <span class="hint">Escribe o pega cualquier emoji. Sugerencias rápidas:</span>
          <div class="emoji-suggest" id="c-icon-suggest" role="group" aria-label="Sugerencias de emoji">
            ${CATEGORY_ICONS.map((em) => `<button type="button" class="emoji-chip" data-emoji="${escapeHtml(em)}" aria-label="Usar ${escapeHtml(em)}">${em}</button>`).join('')}
          </div>
        </div>
        <div class="field"><span class="label">Color</span>${choicesHtml('c-color', COLOR_CHOICES, c.color, 'swatch', 'Color')}</div>
        <div class="row">
          <button class="btn btn-primary" type="submit" id="c-save">Guardar categoría</button>
          <button class="btn" type="button" id="c-cancel">Cancelar</button>
        </div>
      </form>`;
    bindChoices(root, 'c-color');
    const iconInput = root.querySelector('#c-icon');
    const iconPrev = root.querySelector('#c-icon-prev');
    const syncIconPrev = () => {
      const v = (iconInput.value || '').trim() || '🏷️';
      iconPrev.textContent = [...v][0] || '🏷️'; // primer grafema aproximado
    };
    iconInput.addEventListener('input', syncIconPrev);
    root.querySelector('#c-icon-suggest').addEventListener('click', (e) => {
      const em = e.target.closest('[data-emoji]')?.dataset.emoji;
      if (!em) return;
      iconInput.value = em;
      syncIconPrev();
      iconInput.focus();
    });
    const back = () => { state.view = 'list'; state.editingId = null; draw(); window.scrollTo(0, 0); };
    root.querySelector('#c-cancel').addEventListener('click', back);

    let saving = false;
    root.querySelector('#cat-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (saving) return; // evita guardar dos veces por pulsaciones repetidas
      saving = true;
      const btn = root.querySelector('#c-save');
      btn.disabled = true;
      try {
        await store.saveCategory({
          id: state.editingId || undefined,
          name: root.querySelector('#c-name').value,
          description: root.querySelector('#c-desc').value,
          icon: (root.querySelector('#c-icon').value || '').trim() || '🏷️',
          color: root.querySelector('#c-color').value
        });
        toast('Categoría guardada', 'ok');
        back();
      } catch (err) {
        const box = root.querySelector('#cat-error');
        box.textContent = err.message;
        box.hidden = false;
        saving = false;
        btn.disabled = false;
      }
    });
    root.querySelector('#c-name').focus();
  }

  await draw();
}
