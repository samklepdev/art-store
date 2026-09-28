-- Placeholder catalog so the store renders on first run. Safe to re-run.

INSERT INTO products (slug, title, year, medium, dimensions, description, collection, featured, sort_order)
VALUES
  ('low-water', 'Low Water', 2025, 'Oil on linen', '122 × 152 cm',
   'Placeholder description. A few sentences about the piece help buyers connect with it.',
   'Tidewater', true, 10),
  ('marsh-edge', 'Marsh Edge', 2025, 'Oil on linen', '91 × 76 cm', NULL, 'Tidewater', true, 20),
  ('slack-tide', 'Slack Tide', 2024, 'Gouache on panel', '30 × 30 cm', NULL, 'Tidewater', false, 30),
  ('estuary-study', 'Estuary Study', 2024, 'Gouache on paper', '21 × 30 cm', NULL, 'Tidewater', false, 40),
  ('porch-light', 'Porch Light', 2025, 'Charcoal on paper', '56 × 76 cm',
   'Placeholder description for a drawing.', 'Night drawings', true, 50),
  ('streetlamp', 'Streetlamp, 2 a.m.', 2024, 'Charcoal on paper', '56 × 76 cm', NULL, 'Night drawings', true, 60),
  ('overpass', 'Overpass', 2024, 'Compressed charcoal on paper', '76 × 102 cm', NULL, 'Night drawings', false, 70),
  ('pear-study', 'Pear Study', 2023, 'Oil on panel', '20 × 25 cm', NULL, 'Studies', true, 80),
  ('window-study', 'Window Study', 2023, 'Oil on panel', '25 × 20 cm', NULL, 'Studies', false, 90)
ON CONFLICT (slug) DO NOTHING;

-- width/height must match each image's real pixel size.
INSERT INTO product_images (product_id, url, width, height, alt_text, position)
SELECT p.id, i.url, i.w, i.h, i.alt, i.pos
FROM (VALUES
  ('low-water',     'https://picsum.photos/id/1015/1500/1200', 1500, 1200, 'A river winding through a steep green valley', 0),
  ('low-water',     'https://picsum.photos/id/1011/1200/1500', 1200, 1500, 'Detail of the painting surface', 1),
  ('low-water',     'https://picsum.photos/id/1019/1500/1000', 1500, 1000, 'The painting hanging in a room', 2),
  ('marsh-edge',    'https://picsum.photos/id/1036/1200/1500', 1200, 1500, 'Snow-covered hills under a pale sky', 0),
  ('marsh-edge',    'https://picsum.photos/id/1039/1500/1200', 1500, 1200, 'Detail of brushwork', 1),
  ('slack-tide',    'https://picsum.photos/id/1016/1200/1200', 1200, 1200, 'Red canyon walls and a distant ridge', 0),
  ('estuary-study', 'https://picsum.photos/id/1018/1500/1050', 1500, 1050, 'Mountains and a green meadow at dusk', 0),
  ('porch-light',   'https://picsum.photos/id/1043/1100/1500', 1100, 1500, 'A dim interior with light from a window', 0),
  ('porch-light',   'https://picsum.photos/id/1044/1500/1100', 1500, 1100, 'Detail of charcoal marks', 1),
  ('streetlamp',    'https://picsum.photos/id/1050/1100/1500', 1100, 1500, 'A road at night lit by a single lamp', 0),
  ('overpass',      'https://picsum.photos/id/1080/1500/1100', 1500, 1100, 'Dark shapes of a structure against the sky', 0),
  ('pear-study',    'https://picsum.photos/id/106/1200/1500',  1200, 1500, 'A small still life with flowers', 0),
  ('pear-study',    'https://picsum.photos/id/1060/1500/1200', 1500, 1200, 'Detail of the panel edge', 1),
  ('window-study',  'https://picsum.photos/id/110/1500/1200',  1500, 1200, 'A field and a line of trees seen through a window', 0)
) AS i(slug, url, w, h, alt, pos)
JOIN products p ON p.slug = i.slug
ON CONFLICT (product_id, position) DO NOTHING;

-- Originals (one of one). inventory 0 = sold.
INSERT INTO variants (product_id, name, kind, price_cents, inventory, position)
SELECT p.id, 'Original', 'original', o.price, o.inventory, 0
FROM (VALUES
  ('low-water', 240000, 1),
  ('marsh-edge', 180000, 0),
  ('slack-tide', 45000, 1),
  ('porch-light', 90000, 1),
  ('streetlamp', 90000, 0),
  ('overpass', 120000, 1),
  ('pear-study', 35000, 1)
) AS o(slug, price, inventory)
JOIN products p ON p.slug = o.slug
ON CONFLICT (product_id, name) DO NOTHING;

-- Open-edition prints for everything. inventory NULL = printed to order.
INSERT INTO variants (product_id, name, kind, price_cents, inventory, position)
SELECT p.id, s.name, 'print', s.price, NULL, s.pos
FROM products p
CROSS JOIN (VALUES
  ('Print, 8 × 10 in', 4500, 1),
  ('Print, 12 × 16 in', 8500, 2),
  ('Print, 18 × 24 in', 14000, 3)
) AS s(name, price, pos)
ON CONFLICT (product_id, name) DO NOTHING;

-- One sale price, to show compare-at pricing.
UPDATE variants v
SET price_cents = 11000, compare_at_cents = 14000
FROM products p
WHERE v.product_id = p.id AND p.slug = 'pear-study'
  AND v.name = 'Print, 18 × 24 in' AND v.compare_at_cents IS NULL;
