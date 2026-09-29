-- created_at can't answer "what did I just change", which is the default sort
-- for the admin product list. Set explicitly by admin writes, not by a trigger,
-- so ordinary storefront reads stay untouched.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
