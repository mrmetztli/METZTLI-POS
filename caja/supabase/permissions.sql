-- METZTLI Caja: permisos individuales para cajeros.
-- Ejecuta este archivo una sola vez en Supabase > SQL Editor.
ALTER TABLE public.business_members
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT
  '{"catalog_view":false,"products_create":false,"products_edit":false,"prices_edit":false,"stock_adjust":false,"discounts":false,"cancel_sales":false,"clients_manage":false}'::jsonb;

CREATE OR REPLACE FUNCTION public.metztli_guard_member_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
  allowed_keys text[] := ARRAY[
    'catalog_view','products_create','products_edit','prices_edit',
    'stock_adjust','discounts','cancel_sales','clients_manage'
  ];
  permission_key text;
BEGIN
  IF NEW.business_id IS DISTINCT FROM OLD.business_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'No se puede mover un miembro a otra cuenta.';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'No se puede cambiar el rol de un miembro desde esta operación.';
  END IF;

  SELECT b.owner_id INTO owner_id
  FROM public.businesses b
  WHERE b.id = OLD.business_id;

  IF OLD.role = 'owner' THEN
    IF NEW.permissions IS DISTINCT FROM OLD.permissions THEN
      RAISE EXCEPTION 'No se pueden modificar los permisos del propietario.';
    END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR auth.uid() <> owner_id THEN
    RAISE EXCEPTION 'Solo el propietario puede modificar permisos de cajeros.';
  END IF;

  IF jsonb_typeof(NEW.permissions) <> 'object' THEN
    RAISE EXCEPTION 'Los permisos deben ser un objeto JSON.';
  END IF;

  FOR permission_key IN SELECT jsonb_object_keys(NEW.permissions)
  LOOP
    IF NOT permission_key = ANY(allowed_keys) OR jsonb_typeof(NEW.permissions -> permission_key) <> 'boolean' THEN
      RAISE EXCEPTION 'Permiso no válido: %', permission_key;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS metztli_guard_member_permissions ON public.business_members;
CREATE TRIGGER metztli_guard_member_permissions
BEFORE UPDATE ON public.business_members
FOR EACH ROW EXECUTE FUNCTION public.metztli_guard_member_permissions();

-- Permite al propietario actualizar permisos de miembros de su propio negocio.
-- La función trigger anterior limita los campos que pueden cambiarse.
DROP POLICY IF EXISTS metztli_owner_update_member_permissions ON public.business_members;
CREATE POLICY metztli_owner_update_member_permissions
ON public.business_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_members.business_id
      AND b.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_members.business_id
      AND b.owner_id = auth.uid()
  )
);
