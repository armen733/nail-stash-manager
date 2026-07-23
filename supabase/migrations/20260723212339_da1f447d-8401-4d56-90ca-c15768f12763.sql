DROP TRIGGER IF EXISTS trg_apply_stock_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_stock_movement
AFTER INSERT ON public.stock_movements
FOR EACH ROW
EXECUTE FUNCTION public.apply_stock_movement();