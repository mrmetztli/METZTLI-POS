// catalog-editor.js — pantalla "Personalizar catálogo": vista, tamaño de tarjetas, datos visibles,
// columnas de la lista, orden, productos por página y botones de venta rápida.
// Cada cambio se guarda al instante y se refleja en Catálogo y en Nueva venta.
import * as store from './catalog-store.js';
import { getConfig, updateConfig, DEFAULT_CONFIG } from './state.js';
import { pageHeader, toast, confirmDialog, mountOrderEditor } from './components.js';
import { escapeHtml } from './utilities.js';

const FIELDS = [['image', 'Imagen o icono'], ['price', 'Precio'], ['category', 'Categoría'], ['stock', 'Existencias'], ['sku', 'SKU'], ['description', 'Descripción'], ['badges', 'Etiquetas (servicio, venta rápida, destacado)']];
const COLUMNS = [['category', 'Categoría'], ['sku', 'SKU'], ['price', 'Precio'], ['cost', 'Costo'], ['stock', 'Existencias']];
const PAGE_SIZES = [[0, 'Todos en una página'], [12, '12'], [24, '24'], [48, '48'], [100, '100']];

async function save(mutator) {
  try { await updateConfig(mutator); } catch (err) { toast('No se pudo guardar: ' + err.message, 'error'); }
}

// Cambia un valor de la configuración del catálogo a partir de su ruta, por ejemplo "fields.price".
const setPath = (path, value) => save((c) => {
  const parts = path.split('.');
  let o = c.catalog;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
  o[parts[parts.length - 1]] = value;
});

export async function renderCatalogEditor(root, { onBack }) {
  const cc = getConfig().catalog;
  const products = (await store.listProducts()).filter((p) => p.active);
  const sel = (pairs, cur) => pairs.map(([v, l]) => `<option value="${escapeHtml(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('');
  const check = (path, label, on) => `<label class="check"><input type="checkbox" data-path="${path}" ${on ? 'checked' : ''}> ${escapeHtml(label)}</label>`;

  root.innerHTML = pageHeader('Personalizar catálogo', 'Los cambios se guardan solos y se ven de inmediato en Catálogo y en Nueva venta.') + `
    <div class="row" style="margin-bottom:16px"><button class="btn btn-primary" id="ce-back" type="button">← Listo, volver al catálogo</button></div>

    <section class="editor-section"><h2>Vista</h2>
      <div class="card form-grid">
        <div class="field"><label for="ce-view">Vista predeterminada</label><select id="ce-view" class="input" data-path="view">${sel([['cards', 'Tarjetas'], ['list', 'Lista']], cc.view)}</select></div>
        <div class="field"><label for="ce-size">Tamaño de las tarjetas</label><select id="ce-size" class="input" data-path="cardSize">${sel([['small', 'Pequeñas'], ['medium', 'Medianas'], ['large', 'Grandes']], cc.cardSize)}</select></div>
        <div class="field"><label for="ce-ph">Cuando no hay imagen</label><select id="ce-ph" class="input" data-path="placeholder">${sel([['letter', 'Inicial del producto'], ['icon', 'Icono de su categoría']], cc.placeholder)}</select></div>
      </div></section>

    <section class="editor-section"><h2>Datos visibles en cada tarjeta</h2>
      <div class="card form-grid">${FIELDS.map(([k, l]) => check(`fields.${k}`, l, cc.fields[k])).join('')}</div></section>

    <section class="editor-section"><h2>Columnas de la vista de lista</h2>
      <div class="card form-grid">${COLUMNS.map(([k, l]) => check(`listColumns.${k}`, l, cc.listColumns[k])).join('')}</div></section>

    <section class="editor-section"><h2>Orden y páginas</h2>
      <div class="card form-grid">
        <div class="field"><label for="ce-sort">Ordenar por</label><select id="ce-sort" class="input" data-path="sort">${sel(Object.entries(store.SORTS), cc.sort)}</select></div>
        <div class="field"><label for="ce-per">Productos por página</label><select id="ce-per" class="input" data-path="perPage" data-num="1">${sel(PAGE_SIZES, cc.perPage)}</select></div>
        ${check('featuredFirst', '★ Mostrar primero los productos destacados', cc.featuredFirst)}
      </div></section>

    <section class="editor-section"><h2>Botones de venta rápida</h2>
      <p class="muted small">Estos botones aparecen arriba en Nueva venta, en este orden. Desmarca uno para quitarlo.</p>
      <div id="ce-quick"></div>
      <div class="row" id="ce-add-row"></div></section>

    <section class="editor-section"><h2>Restaurar</h2>
      <div><button class="btn" id="ce-reset" type="button">Restaurar valores predeterminados del catálogo</button></div></section>`;

  root.querySelector('#ce-back').addEventListener('click', onBack);

  // Controles simples: la ruta de configuración está en data-path
  root.onchange = (e) => { // propiedad (no addEventListener): evita acumular escuchadores en el contenedor compartido
    const path = e.target.dataset.path;
    if (!path) return;
    const value = e.target.type === 'checkbox' ? e.target.checked : (e.target.dataset.num ? Number(e.target.value) : e.target.value);
    setPath(path, value);
  };

  // Botones de venta rápida: orden con ↑ ↓ y desmarcar para quitar
  const quickNow = new Map(products.map((p) => [p.id, p.quick]));
  const quickList = store.orderQuick(products, cc.quickOrder);
  mountOrderEditor(root.querySelector('#ce-quick'), {
    items: quickList.map((p) => ({ id: p.id, label: p.name, enabled: true })),
    onChange: async (list) => {
      try {
        for (const it of list) if (quickNow.get(it.id) !== it.enabled) { await store.setQuick(it.id, it.enabled); quickNow.set(it.id, it.enabled); }
        await updateConfig((c) => { c.catalog.quickOrder = list.filter((x) => x.enabled).map((x) => x.id); });
      } catch (err) { toast('No se pudo guardar: ' + err.message, 'error'); }
    }
  });
  if (!quickList.length) root.querySelector('#ce-quick').innerHTML = '<p class="muted">Aún no tienes botones de venta rápida.</p>';

  const addable = products.filter((p) => !p.quick).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  root.querySelector('#ce-add-row').innerHTML = addable.length
    ? `<select id="ce-add" class="input" aria-label="Producto a agregar" style="width:auto;max-width:100%">${addable.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</select>
       <button class="btn" id="ce-add-btn" type="button">Agregar botón</button>`
    : '<p class="muted small">Todos tus productos activos ya son botones de venta rápida.</p>';
  root.querySelector('#ce-add-btn')?.addEventListener('click', async () => {
    const id = root.querySelector('#ce-add').value;
    try {
      await store.setQuick(id, true);
      await updateConfig((c) => { c.catalog.quickOrder = [...c.catalog.quickOrder.filter((x) => x !== id), id]; });
      toast('Botón agregado', 'ok');
      renderCatalogEditor(root, { onBack });
    } catch (err) { toast('No se pudo agregar: ' + err.message, 'error'); }
  });

  root.querySelector('#ce-reset').addEventListener('click', async () => {
    const yes = await confirmDialog({ title: '¿Restaurar el catálogo?', message: 'Vuelven la vista, el tamaño, los datos visibles, el orden y las páginas predeterminados. Tus productos y botones de venta rápida no se borran.', confirmText: 'Restaurar' });
    if (!yes) return;
    await save((c) => { c.catalog = structuredClone(DEFAULT_CONFIG.catalog); });
    toast('Catálogo restaurado', 'ok');
    renderCatalogEditor(root, { onBack });
  });
}
