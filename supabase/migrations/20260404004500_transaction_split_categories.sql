ALTER TABLE transaction_splits
ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES categories(id);

