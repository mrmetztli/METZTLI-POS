# METZTLI · Caja

Aplicación web de punto de venta (POS) offline-first: ventas, gastos, catálogo, reportes y configuración.
Estructura

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
