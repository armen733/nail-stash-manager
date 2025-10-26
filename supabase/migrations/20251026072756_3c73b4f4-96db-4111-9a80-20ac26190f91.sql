-- Delete all order items first (child records)
DELETE FROM order_items;

-- Then delete all orders (parent records)
DELETE FROM orders;