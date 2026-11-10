// dashboard-editor.js — pantalla "Personalizar dashboard": mostrar/ocultar, reordenar y dar tamaño a los bloques.
// Cada cambio se guarda al instante (sobrevive a cerrar y abrir la app).
import { getConfig, updateConfig, DEFAULT_CONFIG } from './state.js';
import { WIDGET_META, PERIOD_NAMES } from './dashboard-widgets.js';
import { mountOrderEditor, confirmDialog, toast, pageHeader } from './components.js';

const SIZES = [['full', 'Ancho completo'], ['half', 'Mitad']];

async function save(mutator) {
  try { await updateConfig(mutator); } catch (err) { toast('No se pudo guardar: ' + err.message, 'error'); }
}

export function renderDashboardEditor(root, { onBack }) {
  const cfg = getConfig().dashboard;
  const opt = (v, l, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`;

  root.innerHTML = pageHeader('Personalizar dashboard', 'Elige qué ver, en qué orden y con qué tamaño. Los cambios se guardan solos.') + `
    <div class="row" style="margin-bottom:16px"><button class="btn btn-primary" id="de-back" type="button">← Listo, volver al dashboard</button></div>
    <section class="editor-section"><h2>Bloques</h2>
      <p class="muted small">Marca los que quieres ver y usa ↑ ↓ para ordenarlos. Las tarjetas de indicadores se agrupan en cuadrícula; los bloques grandes pueden ocupar todo el ancho o la mitad.</p>
      <div id="de-list"></div></section>
    <section class="editor-section"><h2>Periodo y gráfica</h2>
      <div class="card form-grid">
        <div class="field"><label for="de-period">Periodo predeterminado</label><select id="de-period" class="input">
          ${Object.entries(PERIOD_NAMES).map(([k, l]) => opt(k, l, cfg.period)).join('')}</select></div>
        <div class="field"><label for="de-chart">Tipo de gráfica de ventas</label><select id="de-chart" class="input">
          ${opt('bars', 'Barras', cfg.chartType)}${opt('line', 'Líneas', cfg.chartType)}</select></div>
      </div></section>
    <section class="editor-section"><h2>Restaurar</h2>
      <div><button class="btn" id="de-reset" type="button">Restaurar distribución predeterminada</button></div></section>`;

  const items = cfg.widgets.filter((w) => WIDGET_META[w.id]).map((w) => ({
    id: w.id, label: WIDGET_META[w.id].label, enabled: w.enabled,
    choice: WIDGET_META[w.id].kind === 'block' && w.id !== 'shortcuts' && w.id !== 'lowStock'
      ? { value: w.size || 'full', options: SIZES } : undefined
  }));
  mountOrderEditor(root.querySelector('#de-list'), {
    items,
    onChange: (list) => save((c) => { c.dashboard.widgets = list.map(({ id, enabled, choice }) => ({ id, enabled, ...(choice ? { size: choice } : {}) })); })
  });

  root.querySelector('#de-back').addEventListener('click', onBack);
  root.querySelector('#de-period').addEventListener('change', (e) => save((c) => { c.dashboard.period = e.target.value; }));
  root.querySelector('#de-chart').addEventListener('change', (e) => save((c) => { c.dashboard.chartType = e.target.value; }));
  root.querySelector('#de-reset').addEventListener('click', async () => {
    const yes = await confirmDialog({ title: '¿Restaurar el dashboard?', message: 'Volverán el orden, los tamaños, el periodo y la gráfica predeterminados. Tus ventas no se tocan.', confirmText: 'Restaurar' });
    if (!yes) return;
    await save((c) => { c.dashboard = structuredClone(DEFAULT_CONFIG.dashboard); });
    toast('Distribución restaurada', 'ok');
    renderDashboardEditor(root, { onBack });
  });
}
