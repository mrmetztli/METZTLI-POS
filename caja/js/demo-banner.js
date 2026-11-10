// demo-banner.js — aviso visible cuando hay datos de PRUEBA cargados (para no confundirlos con ventas reales).
import { hasDemo, removeDemo } from './demo-data.js';
import { confirmDialog, toast } from './components.js';

// root: contenedor de la pantalla · rerender: función que vuelve a dibujarla tras eliminar los datos de prueba
export async function mountDemoBanner(root, rerender) {
  try { if (!(await hasDemo())) return; } catch { return; }
  if (!root.isConnected || root.querySelector('#demo-banner')) return;
  const box = document.createElement('div');
  box.id = 'demo-banner';
  box.className = 'notice warn no-print';
  box.style.marginBottom = '16px';
  box.innerHTML = '<strong>Estás viendo datos de prueba.</strong> Las ventas y gastos “PRUEBA-…” no son reales. <button class="btn btn-sm" id="demo-remove" type="button">Eliminar datos de prueba</button>';
  root.prepend(box);
  box.querySelector('#demo-remove').addEventListener('click', async () => {
    const yes = await confirmDialog({ title: '¿Eliminar los datos de prueba?', message: 'Se borran los productos, categorías, ventas y gastos marcados como PRUEBA. Tus datos reales no se tocan.', confirmText: 'Eliminar', danger: true });
    if (!yes) return;
    try { await removeDemo(); toast('Datos de prueba eliminados', 'ok'); rerender(); } catch (err) { toast(err.message, 'error'); }
  });
}
