-- Drop existing foreign key and recreate with CASCADE
ALTER TABLE public.loyalty_transactions 
DROP CONSTRAINT IF EXISTS loyalty_transactions_order_id_fkey;

ALTER TABLE public.loyalty_transactions 
ADD CONSTRAINT loyalty_transactions_order_id_fkey 
FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;