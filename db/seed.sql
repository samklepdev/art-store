-- Placeholder catalog so the store renders on first run. Safe to re-run.

INSERT INTO products (slug, title, year, medium, dimensions, description, collection, featured, sort_order)
VALUES
  ('low-water', 'Low Water', 2025, 'Acrylic on Canvas', '122 × 152 cm',
   'Placeholder description. A few sentences about the piece help buyers connect with it.',
   'Paintings', true, 10),
  ('marsh-edge', 'Marsh Edge', 2025, 'Acrylic on Canvas', '91 × 76 cm', NULL, 'Paintings', true, 20),
  ('slack-tide', 'Slack Tide', 2024, 'Acrylic on Canvas', '30 × 30 cm', NULL, 'Paintings', false, 30),
  ('estuary-study', 'Estuary Study', 2024, 'Acrylic on Canvas', '21 × 30 cm', NULL, 'Paintings', false, 40),
  ('porch-light', 'Porch Light', 2025, 'Acrylic, Pen on paper', '56 × 76 cm',
   'Placeholder description for a drawing.', 'Illustrations', true, 50),
  ('streetlamp', 'Streetlamp, 2 a.m.', 2024, 'Acrylic, Pen on paper', '56 × 76 cm', NULL, 'Illustrations', true, 60),
  ('overpass', 'Overpass', 2024, 'Acrylic, Pen on paper', '76 × 102 cm', NULL, 'Illustrations', false, 70),
  ('pear-study', 'Pear Study', 2023, 'Acrylic, Pen, Marker on paper', '20 × 25 cm', NULL, 'Studies', true, 80),
  ('window-study', 'Window Study', 2023, 'Acrylic, Pen, Marker on paper', '25 × 20 cm', NULL, 'Studies', false, 90)
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
WHERE NOT EXISTS (
  SELECT 1
  FROM product_images existing
  WHERE existing.product_id = p.id AND existing.position = i.pos
);

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

-- Dummy orders so the admin order screens have something to show.
-- Safe to re-run: orders are keyed by their (fake) Stripe session id and
-- skipped on conflict, so items are only inserted alongside a new order.
-- Amounts are internally consistent: total = subtotal + shipping, and each
-- order's subtotal equals the sum of its item totals. shipping_address is
-- Stripe's snake_case Address shape (line1, line2, city, state, postal_code,
-- country), matching what recordOrder stores.
WITH new_orders AS (
  INSERT INTO orders (
    stripe_session_id, email, customer_name, currency,
    subtotal_cents, shipping_cents, total_cents,
    shipping_address, status, created_at
  )
  SELECT * FROM (VALUES
    ('cs_test_seed_0001', 'ada@example.com',      'Ada Lovelace',      'usd', 249000, 2500, 251500,
     '{"line1":"12 Analytical Way","line2":"Apt 4","city":"London","state":null,"postal_code":"EC1A 1BB","country":"GB"}'::jsonb,
     'paid',      now() - interval '2 hours'),
    ('cs_test_seed_0002', 'grace@example.com',    'Grace Hopper',      'usd',  14000, 1500,  15500,
     '{"line1":"1 Cobol Court","line2":null,"city":"Arlington","state":"VA","postal_code":"22201","country":"US"}'::jsonb,
     'fulfilled', now() - interval '1 day'),
    ('cs_test_seed_0003', 'alan@example.com',     'Alan Turing',       'usd',  45000, 2500,  47500,
     '{"line1":"7 Enigma Road","line2":null,"city":"Manchester","state":null,"postal_code":"M1 1AE","country":"GB"}'::jsonb,
     'refunded',  now() - interval '3 days'),
    ('cs_test_seed_0004', 'katherine@example.com','Katherine Johnson', 'usd',  25500, 1500,  27000,
     '{"line1":"100 Orbit Blvd","line2":"Suite 12","city":"Hampton","state":"VA","postal_code":"23666","country":"US"}'::jsonb,
     'paid',      now() - interval '5 days'),
    ('cs_test_seed_0005', NULL,                    NULL,               'usd',   4500, 1500,   6000,
     NULL::jsonb,
     'paid',      now() - interval '6 days'),
    ('cs_test_seed_0006', 'margaret@example.com', 'Margaret Hamilton', 'usd', 134000, 2500, 136500,
     '{"line1":"200 Apollo Way","line2":null,"city":"Cambridge","state":"MA","postal_code":"02139","country":"US"}'::jsonb,
     'fulfilled', now() - interval '9 days')
  ) AS v(stripe_session_id, email, customer_name, currency,
         subtotal_cents, shipping_cents, total_cents,
         shipping_address, status, created_at)
  ON CONFLICT (stripe_session_id) DO NOTHING
  RETURNING id, stripe_session_id
)
INSERT INTO order_items (order_id, variant_id, description, quantity, unit_price_cents, total_cents)
SELECT o.id, NULL, i.description, i.quantity, i.unit_price_cents, i.total_cents
FROM (VALUES
  ('cs_test_seed_0001', 'Low Water — Original',              1, 240000, 240000),
  ('cs_test_seed_0001', 'Low Water — Print, 8 × 10 in',      2,   4500,   9000),
  ('cs_test_seed_0002', 'Marsh Edge — Print, 18 × 24 in',    1,  14000,  14000),
  ('cs_test_seed_0003', 'Slack Tide — Original',             1,  45000,  45000),
  ('cs_test_seed_0004', 'Low Water — Print, 12 × 16 in',     3,   8500,  25500),
  ('cs_test_seed_0005', 'Slack Tide — Print, 8 × 10 in',     1,   4500,   4500),
  ('cs_test_seed_0006', 'Overpass — Original',               1, 120000, 120000),
  ('cs_test_seed_0006', 'Overpass — Print, 18 × 24 in',      1,  14000,  14000)
) AS i(session_id, description, quantity, unit_price_cents, total_cents)
JOIN new_orders o ON o.stripe_session_id = i.session_id;
