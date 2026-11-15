# Fase 2A — acceso a la nube

## Alcance

Esta entrega agrega la primera pantalla de conexión de METZTLI Caja con el proyecto Supabase ya creado.

Incluye:
- Configuración del Project URL, publishable key y UUID del negocio.
- Inicio de sesión con Supabase Auth mediante HTTPS.
- Recuperación y renovación de sesión.
- Verificación de que el usuario pertenece al negocio METZTLI Caja y lectura de su rol.
- Registro de la instalación en `sync_devices`.
- Sección **Configuración → Nube**.
- Archivos incluidos en el shell del service worker para que la app siga abriendo offline.

## Lo que NO hace todavía

- No sincroniza productos, ventas, clientes, gastos ni configuración.
- No importa ni borra datos de IndexedDB.
- No activa sincronización en segundo plano.
- No resuelve folios ni movimientos de inventario entre dispositivos.
- No incluye todavía una aplicación Windows instalable.

La pantalla lo indica expresamente. No debe anunciarse como sincronización terminada.

## Configuración y seguridad

`caja/js/cloud-config.js` contiene únicamente la URL, la publishable key y el UUID del negocio. La publishable key es una clave pública para clientes y queda protegida por las políticas RLS; nunca debe sustituirse por una `service_role` o secret key.

La sesión Auth se conserva en el almacenamiento local del navegador mediante localStorage para permitir que el usuario no tenga que iniciar sesión cada vez. El usuario puede cerrar sesión en cada dispositivo desde Configuración → Nube. No se guarda la contraseña.

## Prueba manual

1. Instalar la compilación de prueba en un dispositivo que tenga conexión a internet.
2. Abrir **Configuración → Nube**.
3. Iniciar sesión con el correo y contraseña de la cuenta Auth propietaria.
4. Confirmar que aparece el negocio METZTLI Caja y el rol `owner`.
5. Revisar en Supabase → Table Editor → `sync_devices` que se registró esa instalación.
6. Cerrar sesión y comprobar que vuelve a mostrarse el formulario.
7. Repetir en otro dispositivo para confirmar que ambos quedan registrados por separado.
8. Comprobar que la app sigue abriendo sin conexión. El inicio de sesión inicial sí requiere internet.

Si el usuario inicia sesión pero no aparece en `business_members`, revisar que el UUID de Auth sea miembro del UUID de negocio configurado. No compartir contraseñas ni tokens en capturas.

## Próximas fases obligatorias

Antes de sincronizar datos reales se desarrollará y probará:
1. Cola local de operaciones idempotentes y sincronización incremental.
2. Revisión/conflictos y tombstones.
3. Movimientos de inventario y folios atómicos del lado servidor.
4. Pruebas RLS entre usuarios y negocios.
5. Respaldo y restauración con vista previa antes de cualquier importación.
6. Pruebas multi-dispositivo, offline/reconexión y restauración.
