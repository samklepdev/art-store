CREATE TABLE IF NOT EXISTS products (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title       text NOT NULL,
  year        integer CHECK (year BETWEEN 1900 AND 2100),
  medium      text,                  -- "Oil on linen"
  dimensions  text,                  -- size of the original, e.g. "76 × 61 cm"
  description text,
  collection  text,                  -- NULL = not in a collection
  featured    boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  published   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_images (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        text NOT NULL,          -- "/art/file.jpg" or a full https URL
  width      integer NOT NULL CHECK (width > 0),
  height     integer NOT NULL CHECK (height > 0),
  alt_text   text NOT NULL DEFAULT '',
  position   integer NOT NULL DEFAULT 0,   -- 0 is the main image
  UNIQUE (product_id, position)
);

-- Each purchasable option: the original, or a print size.
CREATE TABLE IF NOT EXISTS variants (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id       integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name             text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('original', 'print')),
  price_cents      integer NOT NULL CHECK (price_cents >= 0),
  compare_at_cents integer CHECK (compare_at_cents IS NULL OR compare_at_cents > price_cents),
  inventory        integer CHECK (inventory IS NULL OR inventory >= 0),  -- NULL = made to order
  sku              text,
  position         integer NOT NULL DEFAULT 0,
  UNIQUE (product_id, name)
);

CREATE TABLE IF NOT EXISTS orders (
  id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  stripe_session_id text NOT NULL UNIQUE,
  email             text,
  customer_name     text,
  currency          text NOT NULL,
  subtotal_cents    integer NOT NULL,
  shipping_cents    integer NOT NULL,
  total_cents       integer NOT NULL,
  shipping_address  jsonb,
  status            text NOT NULL DEFAULT 'paid',   -- paid, fulfilled, refunded
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id       integer REFERENCES variants(id) ON DELETE SET NULL,
  description      text NOT NULL,
  quantity         integer NOT NULL,
  unit_price_cents integer NOT NULL,
  total_cents      integer NOT NULL
);

CREATE INDEX IF NOT EXISTS products_listing_idx ON products (sort_order) WHERE published;
CREATE INDEX IF NOT EXISTS variants_product_idx ON variants (product_id);
CREATE INDEX IF NOT EXISTS product_images_product_idx ON product_images (product_id, position);
