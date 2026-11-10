# METZTLI · Caja

Aplicación web de punto de venta (POS) offline-first: ventas, gastos, catálogo, reportes y configuración.

## Despliegue automático con GitHub Actions

Este repositorio incluye un workflow de **GitHub Actions** que publica automáticamente la app en **GitHub Pages** cada vez que haces push a `main` o `master`.

### Cómo activarlo

1. Sube este proyecto a un repositorio de GitHub.
2. Ve a **Settings → Pages**.
3. En **Source** elige **GitHub Actions**.
4. Haz push a la rama `main` (o `master`) o ejecuta el workflow manualmente desde la pestaña **Actions**.

La URL de la app será algo como:

```
https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/
```

### Estructura

```
.
├── .github/workflows/deploy.yml   ← Workflow de despliegue
├── caja/                          ← Código de la aplicación
│   ├── index.html
│   ├── manifest.json
│   ├── sw.js
│   ├── css/
│   ├── js/
│   └── assets/icons/
└── README.md
```

### Desarrollo local

```bash
# Desde la carpeta caja/
python3 -m http.server 8080
# o usa Live Server en VS Code
```

Luego abre `http://localhost:8080`.

## Notas

- Es una PWA estática (HTML + CSS + JS vanilla). No necesita build step.
- El service worker (`sw.js`) cachea todos los archivos para funcionar offline.
- Si agregas archivos nuevos, recuerda incluirlos en el array `SHELL` de `sw.js` y subir el número de `CACHE`.
