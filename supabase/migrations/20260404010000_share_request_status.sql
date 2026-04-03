DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'share_status') THEN
        CREATE TYPE share_status AS ENUM ('pending', 'accepted', 'declined');
    END IF;
END $$;

ALTER TABLE asset_shares
ADD COLUMN IF NOT EXISTS status share_status NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS decline_message TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

ALTER TABLE transaction_splits
ADD COLUMN IF NOT EXISTS status share_status NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS decline_message TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

UPDATE asset_shares
SET status = 'accepted'
WHERE status IS DISTINCT FROM 'accepted';

UPDATE transaction_splits
SET status = 'accepted'
WHERE status IS DISTINCT FROM 'accepted';

