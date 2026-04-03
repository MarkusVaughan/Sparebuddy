ALTER TABLE transaction_splits
ADD COLUMN IF NOT EXISTS payment_requested_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_requested_by_user_id BIGINT REFERENCES users(id);

