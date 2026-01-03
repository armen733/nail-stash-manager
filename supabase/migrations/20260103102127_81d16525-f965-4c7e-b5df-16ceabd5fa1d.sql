-- Add 'Shipped' to the order_status enum
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Shipped' AFTER 'Confirmed';