-- Add dynamic form fields for Nail Tips category
INSERT INTO category_field_configs (category, field_name, field_label, field_type, options, is_required, display_order, placeholder)
VALUES
  ('Nail Tips', 'tip_shape', 'Tip Shape', 'select', '["Oval", "Square", "Almond", "Stiletto", "Coffin/Ballerina", "Round", "Squoval", "Edge"]', true, 1, NULL),
  ('Nail Tips', 'finish', 'Finish', 'select', '["Matte", "Glossy", "Clear", "Natural", "Frosted"]', true, 2, NULL),
  ('Nail Tips', 'material', 'Material', 'select', '["ABS Plastic", "Acrylic", "Gel", "Soft Gel"]', false, 3, NULL),
  ('Nail Tips', 'length', 'Length', 'select', '["Short", "Medium", "Long", "Extra Long"]', false, 4, NULL),
  ('Nail Tips', 'sizes_included', 'Sizes Included', 'text', NULL, false, 5, 'e.g., 0-9, 0-11'),
  ('Nail Tips', 'pcs_per_box', 'Pieces per Box', 'number', NULL, true, 6, 'e.g., 100, 500'),
  ('Nail Tips', 'color', 'Color', 'text', NULL, false, 7, 'e.g., Clear, Natural Pink, White'),
  ('Nail Tips', 'well_type', 'Well Type', 'select', '["Full Well", "Half Well", "No Well/Full Cover"]', false, 8, NULL);