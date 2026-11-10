// catalog.js — pantalla del Catálogo: lista de productos/servicios (tarjetas o lista) y formulario de edición.
// Las reglas (validaciones, guardado, orden) están en catalog-store.js. La apariencia (tamaño de tarjetas,
// datos visibles, orden, productos por página…) se configura en Catálogo → Personalizar (catalog-editor.js).
import { mountDemoBanner } from './demo-banner.js';
import * as store from './catalog-store.js';
import { getConfig, updateConfig } from './state.js';
import { pageHeader, emptyState, toast, confirmDialog, openModal, choicesHtml, bindChoices, COLOR_CHOICES, productThumb } from './components.js';
import { escapeHtml, money, formatDateTime, resizeImage } from './utilities.js';
import { renderCategories } from './categories.js';
import { renderCatalogEditor } from './catalog-editor.js';
import { openBarcodeScanner } from './barcode-scan.js';

// Filtros que se conservan mientras la app está abierta
const ui = { view: 'list', editingId: null, search: '', category: 'all', status: 'active', page: 1 };
let root = null;
let cats = [];
let prods = [];

async function load() {
  [cats, prods] = await Promise.all([store.listCategories(), store.listProducts()]);
}

// Lo usa el Dashboard para abrir el catálogo ya filtrado por existencias bajas.
export function showLowStockNext() { ui.status = 'low'; ui.category = 'all'; ui.search = ''; ui.page = 1; }

export async function render(container) {
  root = container;
  ui.view = 'list';
  ui.editingId = null;
  await load();
  draw();
}

async function go(view, id = null) {
  ui.view = view;
  ui.editingId = id;
  await load();
  draw();
  window.scrollTo(0, 0);
}

// Dibuja la pantalla y, si hay datos de PRUEBA cargados, muestra el aviso para no confundirlos con ventas reales.
function draw() {
  drawScreen();
  if (ui.view === 'list') mountDemoBanner(root, () => render(root));
}

function drawScreen() {
  if (ui.view === 'form') return drawForm();
  if (ui.view === 'categories') return renderCategories(root, { onBack: () => go('list') });
  if (ui.view === 'customize') return renderCatalogEditor(root, { onBack: () => go('list') });
  return drawList();
}

/* ---------- Lista ---------- */

const categoryOf = (p) => cats.find((c) => c.id === p.categoryId);

function visibleProducts() {
  const q = ui.search.trim().toLowerCase();
  const cc = getConfig().catalog;
  const list = prods.filter((p) => {
    if (ui.status === 'active' && !p.active) return false;
    if (ui.status === 'archived' && p.active) return false;
    if (ui.status === 'low' && !(p.active && store.isLowStock(p))) return false;
    if (ui.category === 'none' && p.categoryId) return false;
    if (ui.category !== 'all' && ui.category !== 'none' && p.categoryId !== ui.category) return false;
    if (q && ![p.name, p.sku, p.barcode, p.description].some((v) => String(v || '').toLowerCase().includes(q))) return false;
    return true;
  });
  return store.sortProducts(list, cc.sort, cc.featuredFirst);
}

function badgesOf(p, showExtras) {
  const out = [];
  if (showExtras && p.featured) out.push('<span class="badge">★ Destacado</span>');
  if (showExtras && p.type === 'service') out.push('<span class="badge">Servicio</span>');
  if (showExtras && p.quick) out.push('<span class="badge">Venta rápida</span>');
  if (p.active && store.isLowStock(p)) out.push('<span class="badge warn">Stock bajo</span>');
  if (p.demo) out.push('<span class="badge warn">PRUEBA</span>');
  if (!p.active) out.push('<span class="badge">Archivado</span>');
  return out.join('');
}

const unitSuffix = (p) => (p.unit && !['pieza', 'servicio'].includes(p.unit) ? `<span class="muted small"> / ${escapeHtml(p.unit)}</span>` : '');

function productCard(p, cc) {
  const f = cc.fields;
  const cat = categoryOf(p);
  const meta = [f.category && cat ? `${cat.icon} ${cat.name}` : '', f.stock && p.trackStock ? `${p.stock} ${p.unit}` : '', f.sku && p.sku ? `SKU ${p.sku}` : '']
    .filter(Boolean).join(' · ');
  return `<button type="button" class="pcard ${p.active ? '' : 'is-off'}" data-id="${p.id}">
    ${f.image ? `<span class="pcard-media">${productThumb(p, cat, cc.placeholder)}</span>` : ''}
    <span class="pcard-body">
      <strong>${escapeHtml(p.name)}</strong>
      ${f.price ? `<span class="price">${money(p.price)}${unitSuffix(p)}</span>` : ''}
      ${meta ? `<span class="muted small">${escapeHtml(meta)}</span>` : ''}
      ${f.description && p.description ? `<span class="muted small clamp">${escapeHtml(p.description)}</span>` : ''}
      <span class="badges">${badgesOf(p, f.badges)}</span>
    </span></button>`;
}

const LIST_COLUMNS = {
  category: { label: 'Categoría', cell: (p) => { const c = categoryOf(p); return c ? escapeHtml(`${c.icon} ${c.name}`) : '—'; } },
  sku: { label: 'SKU', cell: (p) => escapeHtml(p.sku || '—') },
  price: { label: 'Precio', num: true, cell: (p) => money(p.price) },
  cost: { label: 'Costo', num: true, cell: (p) => (p.cost === null || p.cost === undefined ? '—' : money(p.cost)) },
  stock: { label: 'Existencias', num: true, cell: (p) => (p.trackStock ? `${p.stock} ${escapeHtml(p.unit)}` : '—') }
};

function productTable(list, cc) {
  const cols = Object.keys(LIST_COLUMNS).filter((k) => cc.listColumns[k]);
  return `<div class="card table-wrap"><table class="table"><thead><tr><th scope="col">Producto</th>
    ${cols.map((k) => `<th scope="col" class="${LIST_COLUMNS[k].num ? 'num' : ''}">${LIST_COLUMNS[k].label}</th>`).join('')}</tr></thead><tbody>
    ${list.map((p) => `<tr class="${p.active ? '' : 'is-off'}"><td><button type="button" class="prow-btn" data-id="${p.id}">
        <span class="prow-thumb">${productThumb(p, categoryOf(p), cc.placeholder)}</span>
        <span><strong>${escapeHtml(p.name)}</strong><span class="badges">${badgesOf(p, cc.fields.badges)}</span></span></button></td>
      ${cols.map((k) => `<td class="${LIST_COLUMNS[k].num ? 'num' : ''}">${LIST_COLUMNS[k].cell(p)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
}

function drawResults() {
  const cc = getConfig().catalog;
  const all = visibleProducts();
  const { items, pages, page } = store.paginate(all, ui.page, cc.perPage);
  ui.page = page;
  const box = root.querySelector('#results');
  root.querySelector('#count').textContent = `${all.length} de ${prods.length}`;
  if (!all.length) {
    box.innerHTML = `<div class="card empty"><h2>Sin resultados</h2><p>Ningún producto coincide con la búsqueda o los filtros.</p></div>`;
    return;
  }
  const body = cc.view === 'list' ? productTable(items, cc) : `<div class="pgrid size-${escapeHtml(cc.cardSize)}">${items.map((p) => productCard(p, cc)).join('')}</div>`;
  const pager = pages > 1 ? `<div class="pager row"><button type="button" class="btn btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
    <span class="muted">Página ${page} de ${pages}</span><button type="button" class="btn btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Siguiente →</button></div>` : '';
  box.innerHTML = body + pager;
}

function drawList() {
  const cc = getConfig().catalog;
  const lowCount = prods.filter((p) => p.active && store.isLowStock(p)).length;

  if (!prods.length) {
    root.innerHTML = pageHeader('Catálogo', 'Productos, servicios y categorías') + emptyState({
      icon: 'tag', title: 'Tu catálogo está vacío',
      text: 'Crea tu primer producto o servicio para poder venderlo. Te recomendamos crear antes algunas categorías.',
      actionId: 'new-first', actionLabel: 'Crear primer producto'
    }) + `<p style="text-align:center;margin-top:12px"><button class="btn" id="to-cats" type="button">Administrar categorías</button></p>`;
    root.querySelector('#new-first').addEventListener('click', () => go('form'));
    root.querySelector('#to-cats').addEventListener('click', () => go('categories'));
    return;
  }

  const opts = (pairs, cur) => pairs.map(([v, l]) => `<option value="${escapeHtml(v)}" ${v === cur ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('');
  const catOptions = opts([['all', 'Todas las categorías'], ['none', 'Sin categoría'],
    ...cats.map((c) => [c.id, `${c.icon} ${c.name}${c.hidden ? ' (oculta)' : ''}`])], ui.category);

  root.innerHTML = pageHeader('Catálogo', 'Productos, servicios y categorías') + `
    <div class="row" style="margin-bottom:16px">
      <button class="btn btn-primary" id="new" type="button">Nuevo producto</button>
      <button class="btn" id="to-cats" type="button">Categorías</button>
      <button class="btn" id="to-custom" type="button">Personalizar</button>
    </div>
    ${lowCount ? `<div class="notice warn" style="margin-bottom:16px">${lowCount} producto(s) con existencias bajas.
      <button class="btn btn-sm" id="show-low" type="button">Verlos</button></div>` : ''}
    <div class="toolbar">
      <input class="input grow" id="q" type="search" placeholder="Buscar por nombre, SKU o código" aria-label="Buscar" value="${escapeHtml(ui.search)}">
      <select class="input" id="cat" aria-label="Categoría" style="width:auto">${catOptions}</select>
      <select class="input" id="status" aria-label="Estado" style="width:auto">${opts([['active', 'Activos'], ['archived', 'Archivados'], ['low', 'Stock bajo'], ['all', 'Todos']], ui.status)}</select>
      <select class="input" id="sort" aria-label="Ordenar por" style="width:auto">${opts(Object.entries(store.SORTS), cc.sort)}</select>
      <div class="seg" role="group" aria-label="Vista">
        <button type="button" data-view="cards" aria-pressed="${cc.view !== 'list'}">Tarjetas</button>
        <button type="button" data-view="list" aria-pressed="${cc.view === 'list'}">Lista</button>
      </div>
    </div>
    <p class="muted small" id="count" style="margin-bottom:10px"></p>
    <div id="results"></div>`;

  const $ = (s) => root.querySelector(s);
  $('#new').addEventListener('click', () => go('form'));
  $('#to-cats').addEventListener('click', () => go('categories'));
  $('#to-custom').addEventListener('click', () => go('customize'));
  $('#show-low')?.addEventListener('click', () => { ui.status = 'low'; ui.page = 1; draw(); });
  $('#q').addEventListener('input', (e) => { ui.search = e.target.value; ui.page = 1; drawResults(); });
  $('#cat').addEventListener('change', (e) => { ui.category = e.target.value; ui.page = 1; drawResults(); });
  $('#status').addEventListener('change', (e) => { ui.status = e.target.value; ui.page = 1; drawResults(); });
  $('#sort').addEventListener('change', async (e) => {
    try { await updateConfig((c) => { c.catalog.sort = e.target.value; }); } catch (err) { toast('No se pudo guardar el orden', 'error'); }
    ui.page = 1;
    drawResults();
  });
  $('.seg').addEventListener('click', async (e) => {
    const v = e.target.closest('[data-view]')?.dataset.view;
    if (!v) return;
    root.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    try { await updateConfig((c) => { c.catalog.view = v; }); } catch (err) { toast('No se pudo guardar la vista', 'error'); }
    drawResults();
  });
  $('#results').addEventListener('click', (e) => {
    const pg = e.target.closest('[data-page]');
    if (pg) { ui.page = Number(pg.dataset.page); drawResults(); $('#results').scrollIntoView({ block: 'start' }); return; }
    const item = e.target.closest('[data-id]');
    if (item) go('form', item.dataset.id);
  });
  drawResults();
}

/* ---------- Formulario ---------- */

function drawForm() {
  const p = ui.editingId ? prods.find((x) => x.id === ui.editingId) : null;
  if (ui.editingId && !p) { go('list'); return; }
  const v = p || {
    name: '', description: '', sku: '', barcode: '', categoryId: '', type: 'product', price: '', cost: '',
    image: null, active: true, color: COLOR_CHOICES[0], unit: 'pieza', trackStock: false, stock: 0, minStock: 0, quick: false, featured: false
  };
  let image = v.image;
  const units = [...new Set([...getConfig().units, v.unit])];
  const catOptions = [['', 'Sin categoría'], ...cats.map((c) => [c.id, `${c.icon} ${c.name}`])]
    .map(([id, l]) => `<option value="${escapeHtml(id)}" ${id === v.categoryId ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('');
  const unitOptions = units.map((u) => `<option ${u === v.unit ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('');

  root.innerHTML = pageHeader(p ? 'Editar producto' : 'Nuevo producto', p ? v.name : 'Completa los datos básicos; el resto es opcional') + `
    <form class="card stack" id="pform" novalidate>
      <div class="notice warn" id="perror" role="alert" hidden></div>
      <div class="form-grid">
        <div class="field"><label for="f-name">Nombre</label><input id="f-name" class="input" maxlength="80" value="${escapeHtml(v.name)}" required></div>
        <div class="field"><label for="f-type">Tipo</label>
          <select id="f-type" class="input"><option value="product" ${v.type === 'product' ? 'selected' : ''}>Producto</option>
            <option value="service" ${v.type === 'service' ? 'selected' : ''}>Servicio</option></select></div>
        <div class="field"><label for="f-cat">Categoría</label><select id="f-cat" class="input">${catOptions}</select></div>
        <div class="field"><label for="f-unit">Unidad de medida</label><select id="f-unit" class="input">${unitOptions}</select></div>
        <div class="field"><label for="f-price">Precio de venta (MXN)</label>
          <input id="f-price" class="input" type="number" inputmode="decimal" min="0" step="0.01" value="${v.price}" required></div>
        <div class="field"><label for="f-cost">Costo unitario (opcional)</label>
          <input id="f-cost" class="input" type="number" inputmode="decimal" min="0" step="0.01" value="${v.cost ?? ''}">
          <span class="hint">Se usa para calcular utilidad en los reportes.</span></div>
        <div class="field"><label for="f-sku">SKU o código interno (opcional)</label><input id="f-sku" class="input" maxlength="40" value="${escapeHtml(v.sku)}"></div>
        <div class="field"><label for="f-barcode">Código de barras (opcional)</label>
          <div class="row barcode-row">
            <input id="f-barcode" class="input" inputmode="numeric" maxlength="40" value="${escapeHtml(v.barcode)}" placeholder="EAN, UPC, Code 128…">
            <button type="button" class="btn btn-scan-sm" id="f-barcode-scan" title="Escanear con la cámara" aria-label="Escanear código de barras con la cámara">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
                <path d="M7 8h10M7 12h10M7 16h6"/>
              </svg>
              Cámara
            </button>
          </div>
        </div>
      </div>
      <div class="field"><label for="f-desc">Descripción (opcional)</label><textarea id="f-desc" class="input textarea" maxlength="300">${escapeHtml(v.description)}</textarea></div>
      <div class="field"><span class="label">Color</span>${choicesHtml('f-color', COLOR_CHOICES, v.color, 'swatch', 'Color')}</div>
      <div class="field"><span class="label">Imagen (opcional)</span>
        <div class="row">
          <img class="img-prev" id="img-prev" alt="" ${image ? `src="${escapeHtml(image)}"` : 'hidden'}>
          <input id="f-image" type="file" accept="image/*">
          <button class="btn btn-sm" type="button" id="img-remove" ${image ? '' : 'hidden'}>Quitar imagen</button>
        </div></div>
      <label class="check"><input type="checkbox" id="f-quick" ${v.quick ? 'checked' : ''}> Mostrar como botón de venta rápida</label>
      <label class="check"><input type="checkbox" id="f-featured" ${v.featured ? 'checked' : ''}> ★ Producto destacado (aparece primero)</label>
      <div id="stock-section" class="stack" ${v.type === 'service' ? 'hidden' : ''}>
        <label class="check"><input type="checkbox" id="f-track" ${v.trackStock ? 'checked' : ''}> Controlar existencias (inventario)</label>
        <div class="form-grid" id="stock-fields" ${v.trackStock ? '' : 'hidden'}>
          <div class="field"><label for="f-stock">Existencias actuales</label><input id="f-stock" class="input" type="number" inputmode="decimal" min="0" step="any" value="${v.stock}"></div>
          <div class="field"><label for="f-min">Existencias mínimas (alerta)</label><input id="f-min" class="input" type="number" inputmode="decimal" min="0" step="any" value="${v.minStock}"></div>
        </div>
      </div>
      <div class="row">
        <button class="btn btn-primary" type="submit" id="p-save">Guardar</button>
        <button class="btn" type="button" id="p-cancel">Cancelar</button>
      </div>
      ${p ? `<hr class="sep">
        <div class="row">
          <button class="btn" type="button" id="p-dup">Duplicar</button>
          <button class="btn" type="button" id="p-arch">${p.active ? 'Archivar' : 'Reactivar'}</button>
          <button class="btn btn-danger" type="button" id="p-del">Eliminar</button>
        </div>
        <p class="muted small">Creado: ${formatDateTime(p.createdAt)} · Última modificación: ${formatDateTime(p.updatedAt)}</p>` : ''}
    </form>`;

  const $ = (id) => root.querySelector(`#${id}`);
  bindChoices(root, 'f-color');
  $('f-type').addEventListener('change', (e) => { $('stock-section').hidden = e.target.value === 'service'; });
  $('f-track').addEventListener('change', (e) => { $('stock-fields').hidden = !e.target.checked; });
  $('f-barcode-scan')?.addEventListener('click', async () => {
    const code = await openBarcodeScanner({
      title: 'Registrar código de barras',
      hint: 'Apunta al código del producto. Se copiará al campo al detectarlo.'
    });
    if (code) {
      $('f-barcode').value = code;
      toast(`Código ${code} capturado`, 'ok');
    }
  });
  $('f-image').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      image = await resizeImage(file);
      $('img-prev').src = image; $('img-prev').hidden = false; $('img-remove').hidden = false;
    } catch (err) { toast(err.message, 'error'); }
  });
  $('img-remove').addEventListener('click', () => {
    image = null; $('img-prev').hidden = true; $('img-remove').hidden = true; $('f-image').value = '';
  });
  $('p-cancel').addEventListener('click', () => go('list'));

  let saving = false;
  $('pform').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (saving) return; // evita registros duplicados por pulsaciones repetidas
    saving = true;
    $('p-save').disabled = true;
    try {
      await store.saveProduct({
        id: p?.id, name: $('f-name').value, type: $('f-type').value, categoryId: $('f-cat').value,
        unit: $('f-unit').value, price: $('f-price').value, cost: $('f-cost').value,
        sku: $('f-sku').value, barcode: $('f-barcode').value, description: $('f-desc').value,
        color: $('f-color').value, image, quick: $('f-quick').checked, featured: $('f-featured').checked,
        trackStock: $('f-track').checked, stock: $('f-stock').value, minStock: $('f-min').value
      });
      toast('Producto guardado', 'ok');
      await go('list');
    } catch (err) {
      const box = $('perror');
      box.textContent = err.message;
      box.hidden = false;
      box.scrollIntoView({ block: 'center' });
      saving = false;
      $('p-save').disabled = false;
    }
  });

  if (p) {
    $('p-dup').addEventListener('click', async () => {
      try {
        const copy = await store.duplicateProduct(p.id);
        toast('Copia creada. Ajusta sus datos y guarda.', 'ok');
        await go('form', copy.id);
      } catch (err) { toast(err.message, 'error'); }
    });
    $('p-arch').addEventListener('click', async () => {
      try {
        await store.setProductActive(p.id, !p.active);
        toast(p.active ? 'Producto archivado' : 'Producto reactivado', 'ok');
        await go('list');
      } catch (err) { toast(err.message, 'error'); }
    });
    $('p-del').addEventListener('click', async () => {
      const yes = await confirmDialog({
        title: `¿Eliminar “${p.name}”?`,
        message: 'Se borrará de forma definitiva. Si solo quieres dejar de venderlo, mejor archívalo.',
        confirmText: 'Eliminar', danger: true
      });
      if (!yes) return;
      try {
        await store.deleteProduct(p.id);
        toast('Producto eliminado', 'ok');
        await go('list');
      } catch (err) {
        await openModal({ title: 'No se puede eliminar', message: err.message });
      }
    });
  }
  $('f-name').focus();
}
