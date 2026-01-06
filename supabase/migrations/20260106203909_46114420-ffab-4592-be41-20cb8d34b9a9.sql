-- Add missing category field configs for Nippers and Brushes
INSERT INTO category_field_configs (category, field_name, field_label, field_type, options, is_required, display_order, placeholder) VALUES
-- Nippers
('Nippers', 'jaw_size', 'Jaw Size', 'select', '["3mm", "5mm", "7mm", "10mm"]', true, 1, null),
('Nippers', 'material', 'Material', 'select', '["Stainless Steel", "Cobalt Steel", "Surgical Steel"]', true, 2, null),
('Nippers', 'spring_type', 'Spring Type', 'select', '["Single", "Double", "Leaf"]', false, 3, null),
('Nippers', 'handle_style', 'Handle Style', 'select', '["Straight", "Curved", "Ergonomic"]', false, 4, null),
-- Brushes
('Brushes', 'brush_type', 'Brush Type', 'select', '["Nail Dust", "Cleaning", "Application", "Buffer"]', true, 1, null),
('Brushes', 'bristle_material', 'Bristle Material', 'select', '["Nylon", "Natural Hair", "Synthetic", "Mixed"]', false, 2, null),
('Brushes', 'handle_material', 'Handle Material', 'select', '["Wood", "Plastic", "Metal", "Acrylic"]', false, 3, null),
('Brushes', 'size', 'Size', 'select', '["Small", "Medium", "Large"]', false, 4, null);