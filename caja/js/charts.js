// charts.js — gráficas en SVG/HTML (sin librerías). Las usan Dashboard y Reportes.
//  · barChartSvg(c, ancho)  c = { type: 'bars' | 'line', labels[], full[], show[], current[], previous? }
//  · rankBarsHtml(items)    items = [{ label, value, pct?, sub?, color? }]  → barras horizontales
//  · donutHtml(items)       items = [{ label, value, pct?, color? }]        → gráfica de dona con leyenda
import { money, escapeHtml } from './utilities.js';
import { getConfig } from './state.js';

function niceMax(v) {
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}

export function barChartSvg(c, width = 600) {
  const type = c.type === 'line' ? 'line' : 'bars';
  const hasPrev = Array.isArray(c.previous);
  const W = Math.max(300, Math.min(width, 900));
  const H = 230; const padL = 52; const padR = 8; const padT = 10; const padB = 26;
  const innerW = W - padL - padR; const innerH = H - padT - padB;
  const max = niceMax(Math.max(...c.current, ...(hasPrev ? c.previous : []), 1));
  const n = c.current.length;
  const slot = innerW / n;
  const bw = Math.max(2, Math.min(26, slot * 0.62));
  const y = (v) => padT + innerH - (v / max) * innerH;
  const cx = (i) => padL + slot * i + slot / 2;
  const compact = new Intl.NumberFormat('es-MX', { style: 'currency', currency: getConfig().currency, notation: 'compact', maximumFractionDigits: 1 });
  const path = (values) => values.map((v, i) => `${i ? 'L' : 'M'}${cx(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  // c.last = último punto con datos reales: la línea se corta ahí en vez de caer a cero en días futuros.
  const upto = Number.isInteger(c.last) ? Math.max(0, Math.min(c.last, n - 1)) : n - 1;
  const shown = c.current.slice(0, upto + 1);

  const grid = [0, 0.5, 1].map((f) => `<line x1="${padL}" x2="${W - padR}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="var(--line)"/>
    <text x="${padL - 6}" y="${y(max * f) + 4}" text-anchor="end" font-size="11" fill="var(--ink-2)">${compact.format(max * f)}</text>`).join('');
  const hits = c.current.map((v, i) => `<g><title>${escapeHtml(c.full[i])}: ${money(v)}${hasPrev ? ` (anterior: ${money(c.previous[i])})` : ''}</title>
    <rect x="${padL + slot * i}" y="${padT}" width="${slot}" height="${innerH}" fill="transparent"/>
    ${type === 'bars' && v > 0 ? `<rect x="${cx(i) - bw / 2}" y="${y(v)}" width="${bw}" height="${padT + innerH - y(v)}" rx="3" fill="var(--accent)"/>` : ''}
    ${type === 'line' && i <= upto && v > 0 && n <= 40 ? `<circle cx="${cx(i)}" cy="${y(v)}" r="3.5" fill="var(--accent)"/>` : ''}</g>`).join('');
  const main = type === 'line'
    ? `<path d="${path(shown)} L${cx(upto).toFixed(1)},${y(0)} L${cx(0).toFixed(1)},${y(0)} Z" fill="var(--accent)" opacity=".10"/>
       <path d="${path(shown)}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>`
    : '';
  const prev = hasPrev ? `<path d="${path(c.previous)}" fill="none" stroke="var(--accent-2)" stroke-width="1.8" stroke-dasharray="4 3"/>` : '';
  const labels = c.labels.map((l, i) => (c.show[i] ? `<text x="${cx(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--ink-2)">${escapeHtml(l)}</text>` : '')).join('');
  const total = c.current.reduce((s, v) => s + v, 0);

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
    aria-label="Gráfica de ${type === 'line' ? 'línea' : 'barras'}. Total: ${money(total)}. Pasa el cursor o toca un punto para ver el detalle.">
    ${grid}${main}${hits}${prev}${labels}</svg>`;
}

export function rankBarsHtml(items) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return items.map((i) => `<div class="rank">
    <div class="row between"><strong>${escapeHtml(i.label)}</strong><span>${money(i.value)}${Number.isFinite(i.pct) ? ` · ${Math.round(i.pct)}%` : ''}</span></div>
    <div class="bar"><span style="width:${(i.value / max) * 100}%${i.color ? `;background:${escapeHtml(i.color)}` : ''}"></span></div>
    ${i.sub ? `<span class="muted small">${escapeHtml(i.sub)}</span>` : ''}</div>`).join('');
}

const PALETTE = ['#1d4ed8', '#0f766e', '#b45309', '#7e22ce', '#be185d', '#15803d', '#0e7490', '#b91c1c', '#4d7c0f', '#475569'];

export function donutHtml(items) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const R = 56; const C = 2 * Math.PI * R;
  let offset = 0;
  const colors = items.map((i, k) => i.color || PALETTE[k % PALETTE.length]);
  const arcs = items.map((i, k) => {
    const len = (i.value / total) * C;
    const arc = `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${escapeHtml(colors[k])}" stroke-width="26"
      stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 80 80)"><title>${escapeHtml(i.label)}: ${money(i.value)}</title></circle>`;
    offset += len;
    return arc;
  }).join('');
  const legend = items.map((i, k) => `<li><i style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${escapeHtml(colors[k])}"></i>
    <span>${escapeHtml(i.label)}</span><strong>${money(i.value)} · ${Math.round(Number.isFinite(i.pct) ? i.pct : (i.value / total) * 100)}%</strong></li>`).join('');
  return `<div class="donut-wrap"><svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="Gráfica de dona. Total: ${money(total)}">
    ${arcs}<text x="80" y="84" text-anchor="middle" font-size="13" font-weight="700" fill="var(--ink)">${money(total)}</text></svg>
    <ul class="donut-legend">${legend}</ul></div>`;
}
