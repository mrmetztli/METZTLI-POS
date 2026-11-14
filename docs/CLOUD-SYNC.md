# Sincronización en la nube — METZTLI Caja

## Objetivo

Compartir una sola operación de negocio entre varios Android y varias PC Windows, desde redes diferentes. El sistema conserva IndexedDB como almacenamiento local y usa Supabase (PostgreSQL + Auth + Realtime) como servidor compartido.

## Estado de esta entrega

Esta rama prepara la base SQL y el procedimiento de migración. **Todavía no activa la sincronización dentro de la aplicación**: falta crear el proyecto Supabase, establecer la cuenta propietaria, definir la primera importación y después conectar el motor cliente. No publicar una APK/EXE con credenciales de ejemplo.

## Arquitectura prevista

- Android: APK actual, IndexedDB local y cola de cambios pendientes.
- Windows: instalador EXE con la misma aplicación web y almacenamiento local.
- Supabase Auth: cada empleado inicia sesión con su propia cuenta.
- PostgreSQL: registros compartidos por negocio, con Row Level Security (RLS).
- Realtime: avisos de cambios; el cliente siempre confirma y descarga cambios desde PostgreSQL.
- Offline: ventas y consultas siguen disponibles localmente. La cola se reintenta al recuperar internet.

## Datos que se sincronizan

Los almacenes actuales de `caja-db` versión 3: products, categories, sales, clients, expenses, expenseCategories, settings, audit y meta.

La tabla remota `sync_records` conserva cada registro como JSONB junto con negocio, almacén, ID, revisión, fecha y marca de eliminación. Esto evita cambiar el formato de los registros actuales durante la primera fase.

## Reglas críticas de consistencia

1. Ventas y gastos son registros identificados por UUID y se envían de forma idempotente.
2. Los folios no pueden depender de contadores locales independientes. La asignación definitiva debe ocurrir en una operación remota atómica.
3. El inventario no se sincroniza copiando el campo stock con "última escritura gana". Se implementará un libro de movimientos de inventario y una operación remota atómica para evitar que ventas simultáneas pierdan existencias.
4. Ediciones simultáneas de configuración/productos se detectan por revisión; los conflictos se presentan para resolución, no se descartan silenciosamente.
5. Las eliminaciones se propagan mediante tombstones.
6. Cada negocio queda aislado por RLS. La clave service_role jamás se incluye en el APK ni en el EXE.

## Preparación de Supabase

1. Crear un proyecto Supabase y conservar URL y anon/publishable key.
2. Abrir SQL Editor y ejecutar `supabase/schema.sql`.
3. Crear el usuario propietario en Authentication.
4. Crear el negocio e insertar su membresía owner desde SQL Editor, sustituyendo los valores:

```sql
insert into public.businesses (name)
values ('Mi negocio')
returning id;

-- Con el UUID devuelto y el UUID del usuario Auth:
insert into public.business_members (business_id, user_id, role)
values ('UUID_DEL_NEGOCIO', 'UUID_DEL_USUARIO', 'owner');
```

5. Invitar/crear las cuentas de los demás usuarios y añadir una fila en business_members para cada uno, con el rol adecuado.
6. Configurar la URL y la anon/publishable key en el proceso de compilación. Nunca colocar la service_role key en el cliente.

## Migración segura de los datos actuales

No se debe importar automáticamente desde cada dispositivo al iniciar sesión. Si varios dispositivos contienen datos distintos, una importación indiscriminada puede duplicar ventas o sobrescribir productos.

1. Exportar un respaldo JSON desde cada instalación actual.
2. Identificar cuál respaldo es el principal y revisar los demás.
3. Unir catálogos/clientes por ID y revisar colisiones; las ventas/gastos se conservan por ID.
4. Importar una sola vez con una vista previa de conteos y conflictos.
5. Verificar totales, folios, existencias, clientes y gastos antes de activar sincronización bidireccional.
6. Mantener intactos los respaldos originales hasta completar pruebas.

## Fases de desarrollo

- Fase 1 (esta rama): esquema remoto, aislamiento por negocio y guía de migración.
- Fase 2: autenticación, selector/registro de dispositivo, estado de conexión y sincronización incremental.
- Fase 3: movimientos de inventario y folios atómicos; resolución de conflictos.
- Fase 4: empaquetado Windows EXE y compilación Android con configuración de backend.
- Fase 5: pruebas con varios dispositivos, desconexión, reconexión y restauración.

## Pruebas de aceptación

- Un registro creado en Android aparece en Windows y viceversa.
- Dos ventas simultáneas del mismo producto no pierden movimientos de stock.
- Un dispositivo desconectado conserva sus operaciones y las sube al reconectar.
- Reintentar una sincronización no duplica ventas ni gastos.
- Un usuario de otro negocio no puede leer ni modificar datos.
- Una restauración de respaldo local no dispara una sustitución remota accidental.
