// settings-appearance.js — temas clay (claro/oscuro), paleta ampliada y estilo visual.
import { getConfig, DEFAULT_CONFIG } from './state.js';
import { confirmDialog, toast } from './components.js';
import { escapeHtml } from './utilities.js';
import { save, options, bindSelect } from './settings-common.js';

/** Pares de acento sugeridos (principal + secundario) alineados a la paleta clay. */
const PRESETS = [
  { id: 'violet-cyan', label: 'Violeta · Cyan', accent: '#A855F7', accent2: '#22D3EE' },
  { id: 'purple-teal', label: 'Púrpura · Teal', accent: '#8B5CF6', accent2: '#2DD4BF' },
  { id: 'indigo-cyan', label: 'Índigo · Cyan', accent: '#6366F1', accent2: '#06B6D4' },
  { id: 'fuchsia-sky', label: 'Fucsia · Cielo', accent: '#C084FC', accent2: '#67E8F9' },
  { id: 'deep-aqua', label: 'Violeta profundo · Aqua', accent: '#7C3AED', accent2: '#4DE3F0' },
  { id: 'rose-amber', label: 'Rosa · Ámbar', accent: '#F43F5E', accent2: '#F59E0B' },
  { id: 'teal-indigo', label: 'Teal · Índigo', accent: '#0E7490', accent2: '#818CF8' },
  { id: 'magenta-mint', label: 'Magenta · Menta', accent: '#D946EF', accent2: '#34D399' }
];

const ACCENT_SWATCHES = [
  '#A855F7', '#8B5CF6', '#7C3AED', '#C084FC', '#D946EF',
  '#6366F1', '#4F46E5', '#22D3EE', '#06B6D4', '#2DD4BF',
  '#0E7490', '#F43F5E', '#E11D48', '#F59E0B', '#10B981'
];

const ACCENT2_SWATCHES = [
  '#22D3EE', '#67E8F9', '#4DE3F0', '#06B6D4', '#2DD4BF',
  '#34D399', '#A855F7', '#C084FC', '#818CF8', '#F59E0B',
  '#FB7185', '#F43F5E', '#0E7490', '#6366F1', '#E2E8F0'
];

function swatchesHtml(name, colors, current) {
  const cur = (current || '').toLowerCase();
  return colors.map((c) => {
    const on = c.toLowerCase() === cur;
    return `<button type="button" class="theme-swatch ${on ? 'is-on' : ''}" data-swatch="${name}" data-color="${c}"
      style="background:${c}" aria-label="${c}" aria-pressed="${on}" title="${c}"></button>`;
  }).join('');
}

function presetHtml(a) {
  return PRESETS.map((p) => {
    const on = a.accent.toLowerCase() === p.accent.toLowerCase() && a.accent2.toLowerCase() === p.accent2.toLowerCase();
    return `<button type="button" class="theme-preset ${on ? 'is-on' : ''}" data-preset="${p.id}" aria-pressed="${on}">
      <span class="theme-preset-dots" aria-hidden="true">
        <i style="background:${p.accent}"></i>
        <i style="background:${p.accent2}"></i>
      </span>
      <span class="theme-preset-label">${escapeHtml(p.label)}</span>
    </button>`;
  }).join('');
}

function modeHtml(mode) {
  const items = [
    { id: 'light', title: 'Claro', desc: 'Fondo cemento claro, cards blancas, sombras suaves.' },
    { id: 'dark', title: 'Oscuro', desc: 'Fondo navy profundo, superficies elevadas, acentos luminosos.' }
  ];
  return items.map((m) => `
    <button type="button" class="theme-mode ${mode === m.id ? 'is-on' : ''}" data-mode="${m.id}" aria-pressed="${mode === m.id}">
      <span class="theme-mode-preview theme-mode-preview--${m.id}" aria-hidden="true">
        <span class="tmp-bar"></span>
        <span class="tmp-card"></span>
        <span class="tmp-card tmp-card--accent"></span>
      </span>
      <strong>${m.title}</strong>
      <span class="muted small">${m.desc}</span>
    </button>`).join('');
}

export function render(host) {
  const a = getConfig().appearance;
  host.innerHTML = `
    <section class="section">
      <h2>Tema</h2>
      <p class="muted small" style="margin-bottom:12px">Claymorphism morado / cyan. Elige claro u oscuro; el resto de la interfaz se adapta solo.</p>
      <div class="theme-modes">${modeHtml(a.mode)}</div>
    </section>

    <section class="section">
      <h2>Combinaciones sugeridas</h2>
      <p class="muted small" style="margin-bottom:12px">Un toque aplica color principal y secundario a la vez.</p>
      <div class="theme-presets">${presetHtml(a)}</div>
    </section>

    <section class="section">
      <h2>Colores</h2>
      <div class="card stack">
        <div class="field">
          <label>Color principal</label>
          <span class="hint">Botones primarios, enlaces, foco y barra de estado.</span>
          <div class="theme-swatch-row" data-for="accent">${swatchesHtml('accent', ACCENT_SWATCHES, a.accent)}</div>
          <div class="row" style="margin-top:10px;gap:10px;align-items:center">
            <input id="a-accent" type="color" class="input" value="${escapeHtml(a.accent)}" aria-label="Color principal personalizado" style="width:64px;padding:4px">
            <code class="theme-hex" id="a-accent-hex">${escapeHtml(a.accent.toUpperCase())}</code>
          </div>
        </div>
        <hr class="sep">
        <div class="field">
          <label>Color secundario</label>
          <span class="hint">Acentos cyan, gráficas de comparación y detalles.</span>
          <div class="theme-swatch-row" data-for="accent2">${swatchesHtml('accent2', ACCENT2_SWATCHES, a.accent2)}</div>
          <div class="row" style="margin-top:10px;gap:10px;align-items:center">
            <input id="a-accent2" type="color" class="input" value="${escapeHtml(a.accent2)}" aria-label="Color secundario personalizado" style="width:64px;padding:4px">
            <code class="theme-hex" id="a-accent2-hex">${escapeHtml(a.accent2.toUpperCase())}</code>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Vista previa</h2>
      <div class="theme-preview card">
        <div class="row" style="gap:10px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" tabindex="-1">Primario</button>
          <button type="button" class="btn btn-secondary" tabindex="-1">Secundario</button>
          <button type="button" class="btn" tabindex="-1">Neutro</button>
          <button type="button" class="btn btn-danger" tabindex="-1">Peligro</button>
        </div>
        <div class="theme-preview-cards">
          <div class="theme-mini card-purple"><span>Morado</span></div>
          <div class="theme-mini card-cyan"><span>Cyan</span></div>
          <div class="theme-mini card-violet"><span>Violeta</span></div>
          <div class="theme-mini card-teal"><span>Teal</span></div>
        </div>
        <p class="muted small">Los botones y tarjetas de color usan la paleta clay. El acento que elijas tiñe botones primarios, chips activos y el foco.</p>
      </div>
    </section>

    <section class="section">
      <h2>Tamaño y estilo</h2>
      <div class="card form-grid">
        <div class="field">
          <label for="a-text">Tamaño del texto</label>
          <select id="a-text" class="input">${options([['small', 'Pequeño'], ['normal', 'Normal'], ['large', 'Grande']], a.textSize)}</select>
        </div>
        <div class="field">
          <label for="a-density">Densidad</label>
          <select id="a-density" class="input">${options([['comfortable', 'Cómoda'], ['compact', 'Compacta']], a.density)}</select>
          <span class="hint">Compacta reduce el padding de tarjetas y formularios.</span>
        </div>
        <div class="field">
          <label for="a-cards">Estilo de las tarjetas</label>
          <select id="a-cards" class="input">${options([
            ['soft', 'Clay (sombra 3D, recomendado)'],
            ['outlined', 'Solo borde'],
            ['flat', 'Planas, sin relieve']
          ], a.cards)}</select>
          <span class="hint">“Clay” es el efecto inflado del diseño actual.</span>
        </div>
        <div class="field">
          <label for="a-nav">Tipo de navegación</label>
          <select id="a-nav" class="input">${options([
            ['auto', 'Automática (lateral en escritorio, inferior en teléfono)'],
            ['side', 'Siempre lateral'],
            ['bottom', 'Siempre inferior']
          ], a.nav)}</select>
        </div>
      </div>
    </section>

    <section class="section">
      <h2>Restaurar</h2>
      <p class="muted small" style="margin-bottom:12px">Vuelve al tema Violeta · Cyan en modo claro, con tarjetas clay y navegación automática.</p>
      <button class="btn" id="a-reset" type="button">Restaurar apariencia predeterminada</button>
    </section>`;

  // Modo claro / oscuro
  host.querySelector('.theme-modes').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (mode === getConfig().appearance.mode) return;
    if (await save((cfg) => { cfg.appearance.mode = mode; }, mode === 'dark' ? 'Tema oscuro activado' : 'Tema claro activado')) {
      render(host);
    }
  });

  // Presets
  host.querySelector('.theme-presets').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    const preset = PRESETS.find((p) => p.id === btn.dataset.preset);
    if (!preset) return;
    if (await save((cfg) => {
      cfg.appearance.accent = preset.accent;
      cfg.appearance.accent2 = preset.accent2;
    }, `Paleta: ${preset.label}`)) {
      render(host);
    }
  });

  // Swatches
  host.querySelectorAll('.theme-swatch-row').forEach((row) => {
    row.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-swatch]');
      if (!b) return;
      const key = b.dataset.swatch; // accent | accent2
      const color = b.dataset.color;
      if (await save((cfg) => { cfg.appearance[key] = color; }, 'Color actualizado')) {
        render(host);
      }
    });
  });

  // Color pickers nativos
  const wireColor = (sel, key, hexId) => {
    const el = host.querySelector(sel);
    el.addEventListener('input', () => {
      const hex = host.querySelector(hexId);
      if (hex) hex.textContent = el.value.toUpperCase();
    });
    el.addEventListener('change', async () => {
      const v = el.value;
      if (await save((cfg) => { cfg.appearance[key] = v; }, 'Color actualizado')) {
        render(host);
      }
    });
  };
  wireColor('#a-accent', 'accent', '#a-accent-hex');
  wireColor('#a-accent2', 'accent2', '#a-accent2-hex');

  bindSelect(host, '#a-text', (cfg, v) => { cfg.appearance.textSize = v; });
  bindSelect(host, '#a-density', (cfg, v) => { cfg.appearance.density = v; });
  bindSelect(host, '#a-cards', (cfg, v) => { cfg.appearance.cards = v; });
  bindSelect(host, '#a-nav', (cfg, v) => { cfg.appearance.nav = v; });

  host.querySelector('#a-reset').addEventListener('click', async () => {
    const yes = await confirmDialog({
      title: '¿Restaurar la apariencia?',
      message: 'Se aplicará el tema Violeta · Cyan en modo claro, texto normal, densidad cómoda, tarjetas clay y navegación automática. Tus datos de ventas no se tocan.',
      confirmText: 'Restaurar'
    });
    if (!yes) return;
    if (await save((cfg) => { cfg.appearance = structuredClone(DEFAULT_CONFIG.appearance); }, 'Apariencia restaurada')) {
      render(host);
    } else {
      toast('No se pudo restaurar', 'error');
    }
  });
}
