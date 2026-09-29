-- Reordering images permutes product_images.position within one transaction.
-- Postgres checks non-deferrable UNIQUE constraints as a statement proceeds, so
-- a valid final ordering can still fail on an intermediate state. Defer the
-- check to COMMIT and keep the invariant that two images can't share a slot.
ALTER TABLE product_images
  DROP CONSTRAINT product_images_product_id_position_key;

ALTER TABLE product_images
  ADD CONSTRAINT product_images_product_id_position_key
  UNIQUE (product_id, position) DEFERRABLE INITIALLY DEFERRED;
