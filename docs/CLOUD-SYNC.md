# Sincronización en la nube — METZTLI Caja

## Objetivo

Compartir una sola operación de negocio entre varios Android y varias PC Windows, desde redes diferentes. IndexedDB seguirá siendo el almacenamiento local y Supabase (PostgreSQL + Auth + Realtime) será el servidor compartido.

## Estado de esta entrega

Esta fase prepara el esquema remoto y el alta segura del negocio/propietario. **Todavía no activa la sincronización dentro de la aplicación**: faltan aplicar y verificar el SQL, crear el usuario propietario, conectar Auth y desarrollar el motor cliente. No publicar una APK/EXE con credenciales de ejemplo.

## Arquitectura prevista

- Android: APK actual, IndexedDB local y cola de cambios pendientes.
- Windows: futura aplicación instalable con la misma aplicación web y almacenamiento local.
- Supabase Auth: cada empleado inicia sesión con su propia cuenta.
- PostgreSQL: registros compartidos por negocio, protegidos con Row Level Security (RLS) y privilegios SQL explícitos.
- Realtime: avisos de cambios; el cliente confirma y descarga cambios desde PostgreSQL bajo RLS.
- Offline: las operaciones locales permanecen en el dispositivo y se reintentan al recuperar internet.

## Datos previstos

Los almacenes actuales de `caja-db` versión 3: products, categories, sales, clients, expenses, expenseCategories, settings, audit y meta. La tabla remota `sync_records` conserva cada registro como JSONB junto con negocio, almacén, ID, revisión, fecha y marca de eliminación. La compatibilidad real de cada registro se validará al implementar el adaptador; no se debe importar hasta entonces.

## Roles

- `owner`: propietario; administra el negocio y todos los datos.
- `admin`: administra la operación y puede agregar cajeros/lectores.
- `cashier`: opera registros, pero no puede modificar la configuración compartida.
- `viewer`: solo lectura.

La base SQL revoca privilegios de cliente por defecto y concede únicamente lectura o escritura necesaria. Las funciones privilegiadas fijan `search_path`, verifican al usuario autenticado y limitan quién puede ejecutarlas. La tabla no concede borrado directo; las bajas se representan con `deleted=true`.

## Preparación de Supabase

1. Crear el proyecto Supabase y conservar Project URL y Publishable key.
2. Crear la cuenta propietaria en **Authentication → Users** (o habilitar el método de registro que se vaya a utilizar).
3. Abrir **SQL Editor → New query**, pegar el contenido completo de `supabase/schema.sql` de esta rama y ejecutar una sola vez.
4. Iniciar sesión en la aplicación futura con la cuenta propietaria y llamar a la función `create_business` con el nombre del negocio. La función crea el negocio y su membresía `owner` en una sola transacción.
5. Para dar acceso a otro usuario, crear primero su cuenta en Auth y después llamar a `add_business_member` con el UUID de Auth y el rol permitido. Solo el propietario puede asignar `admin`; owner/admin pueden asignar cashier o viewer.
6. Configurar Project URL y Publishable key en el proceso de compilación. Nunca colocar la contraseña de la base de datos ni una clave `service_role`/secret en el APK o EXE.

**No insertar manualmente miembros ni ejecutar importaciones de IndexedDB.** El procedimiento de alta inicial desde la app se conectará en una fase posterior; por ahora, el SQL puede prepararse, pero no se considera validado hasta pasar las pruebas descritas abajo.

## Reglas críticas de consistencia

1. Ventas y gastos deben usar IDs estables e idempotentes.
2. Los folios definitivos deben asignarse mediante una operación remota atómica.
3. El inventario no se sincroniza copiando `stock` con "última escritura gana". Se implementará un libro de movimientos y una operación remota atómica para evitar pérdidas de existencias por ventas simultáneas.
4. Ediciones simultáneas se detectan por revisión; los conflictos se presentan para resolución.
5. Las eliminaciones se propagan mediante tombstones.
6. Cada negocio queda aislado por RLS. Un usuario de otro negocio no debe poder leer ni modificar datos.

## Migración segura de los datos actuales

No se debe importar automáticamente desde cada dispositivo al iniciar sesión.

1. Exportar un respaldo JSON desde cada instalación actual.
2. Identificar cuál respaldo es el principal y revisar los demás.
3. Unir catálogos/clientes por ID y revisar colisiones; conservar ventas/gastos por ID.
4. Preparar una importación única con vista previa de conteos y conflictos.
5. Verificar totales, folios, existencias, clientes y gastos antes de activar sincronización bidireccional.
6. Mantener intactos los respaldos originales hasta completar las pruebas.

## Fases de desarrollo

- Fase 1: esquema remoto, roles, aislamiento por negocio y guía de migración.
- Fase 2: autenticación, alta del negocio/dispositivos, estado de conexión y sincronización incremental.
- Fase 3: movimientos de inventario y folios atómicos; resolución de conflictos.
- Fase 4: empaquetado Windows y compilación Android con configuración del backend.
- Fase 5: pruebas con varios dispositivos, desconexión, reconexión y restauración.

## Pruebas pendientes antes de usar datos reales

- Un usuario sin sesión no puede leer ni escribir tablas.
- Un miembro solo ve los negocios a los que pertenece.
- Un viewer no puede insertar ni modificar registros.
- Un cashier no puede modificar `settings`.
- Un admin no puede asignar el rol owner ni admin.
- Un usuario de otro negocio no puede leer ni modificar datos.
- Reintentar una sincronización no duplica ventas/gastos.
- Dos ventas simultáneas no pierden movimientos de inventario.
- Restaurar un respaldo local no sustituye automáticamente los datos remotos.

El SQL de esta fase es una base de permisos, no reemplaza las pruebas automatizadas RLS (`supabase test db`) ni la revisión de la configuración de API del proyecto.
