
-- ============================================================
-- 1. Location type enum
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.location_type AS ENUM ('warehouse', 'fba', 'consignment', 'driver');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.movement_type AS ENUM ('receive', 'transfer', 'sale', 'adjustment', 'return', 'initial');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. stock_locations
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type public.location_type NOT NULL DEFAULT 'warehouse',
  assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  salon_id UUID REFERENCES public.salons(id) ON DELETE SET NULL,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_locations_one_default
  ON public.stock_locations (is_default) WHERE is_default = true;

ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view locations" ON public.stock_locations;
CREATE POLICY "Authenticated can view locations" ON public.stock_locations
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can insert locations" ON public.stock_locations;
CREATE POLICY "Authenticated can insert locations" ON public.stock_locations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can update locations" ON public.stock_locations;
CREATE POLICY "Authenticated can update locations" ON public.stock_locations
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can delete locations" ON public.stock_locations;
CREATE POLICY "Authenticated can delete locations" ON public.stock_locations
  FOR DELETE USING (auth.uid() IS NOT NULL);

CREATE TRIGGER stock_locations_updated_at
  BEFORE UPDATE ON public.stock_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 3. product_stock (current quantities)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.stock_locations(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0,
  reserved INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, location_id)
);

CREATE INDEX IF NOT EXISTS product_stock_product_idx ON public.product_stock(product_id);
CREATE INDEX IF NOT EXISTS product_stock_location_idx ON public.product_stock(location_id);

ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view product stock" ON public.product_stock;
CREATE POLICY "Authenticated can view product stock" ON public.product_stock
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can insert product stock" ON public.product_stock;
CREATE POLICY "Authenticated can insert product stock" ON public.product_stock
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can update product stock" ON public.product_stock;
CREATE POLICY "Authenticated can update product stock" ON public.product_stock
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE TRIGGER product_stock_updated_at
  BEFORE UPDATE ON public.product_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 4. stock_movements (audit log)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type public.movement_type NOT NULL,
  quantity INTEGER NOT NULL,           -- always positive; direction inferred from from/to
  from_location_id UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  to_location_id   UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  unit_cost NUMERIC(12,2),             -- for receives
  reason TEXT,                         -- for adjustments / notes
  reference_type TEXT,                 -- e.g. 'order'
  reference_id UUID,                   -- e.g. orders.id
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_movements_product_idx     ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS stock_movements_created_at_idx  ON public.stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS stock_movements_from_idx        ON public.stock_movements(from_location_id);
CREATE INDEX IF NOT EXISTS stock_movements_to_idx          ON public.stock_movements(to_location_id);
CREATE INDEX IF NOT EXISTS stock_movements_reference_idx   ON public.stock_movements(reference_type, reference_id);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view movements" ON public.stock_movements;
CREATE POLICY "Authenticated can view movements" ON public.stock_movements
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can insert movements" ON public.stock_movements;
CREATE POLICY "Authenticated can insert movements" ON public.stock_movements
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Validation: must have at least one of from/to
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_has_location;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_has_location
  CHECK (from_location_id IS NOT NULL OR to_location_id IS NOT NULL);

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_qty_positive;
ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_qty_positive
  CHECK (quantity > 0);

-- ============================================================
-- 5. Trigger: apply movement -> update product_stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Subtract from source
  IF NEW.from_location_id IS NOT NULL THEN
    INSERT INTO public.product_stock (product_id, location_id, quantity)
    VALUES (NEW.product_id, NEW.from_location_id, -NEW.quantity)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = public.product_stock.quantity - NEW.quantity,
                  updated_at = now();
  END IF;

  -- Add to destination
  IF NEW.to_location_id IS NOT NULL THEN
    INSERT INTO public.product_stock (product_id, location_id, quantity)
    VALUES (NEW.product_id, NEW.to_location_id, NEW.quantity)
    ON CONFLICT (product_id, location_id)
    DO UPDATE SET quantity = public.product_stock.quantity + NEW.quantity,
                  updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_movements_apply ON public.stock_movements;
CREATE TRIGGER stock_movements_apply
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- ============================================================
-- 6. Trigger: keep products.stock_on_hand = SUM(product_stock.quantity)
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalc_product_total_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid UUID;
  total INTEGER;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    pid := OLD.product_id;
  ELSE
    pid := NEW.product_id;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO total
  FROM public.product_stock
  WHERE product_id = pid;

  UPDATE public.products SET stock_on_hand = total WHERE id = pid;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS product_stock_recalc ON public.product_stock;
CREATE TRIGGER product_stock_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.product_stock
  FOR EACH ROW EXECUTE FUNCTION public.recalc_product_total_stock();

-- ============================================================
-- 7. Seed default Main Warehouse + backfill existing stock
-- ============================================================
DO $$
DECLARE
  main_loc UUID;
BEGIN
  -- Create Main Warehouse if it doesn't exist
  SELECT id INTO main_loc FROM public.stock_locations WHERE is_default = true LIMIT 1;

  IF main_loc IS NULL THEN
    INSERT INTO public.stock_locations (name, type, is_default, notes)
    VALUES ('Main Warehouse', 'warehouse', true, 'Default location (auto-created). All existing inventory was placed here.')
    RETURNING id INTO main_loc;
  END IF;

  -- Backfill: insert one initial movement per product that has stock,
  -- the trigger will populate product_stock automatically.
  INSERT INTO public.stock_movements (product_id, movement_type, quantity, to_location_id, reason)
  SELECT p.id, 'initial'::public.movement_type, p.stock_on_hand, main_loc, 'Initial backfill from existing stock_on_hand'
  FROM public.products p
  WHERE COALESCE(p.stock_on_hand, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.stock_movements m
      WHERE m.product_id = p.id AND m.movement_type = 'initial'
    );
END $$;
