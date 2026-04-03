ALTER TABLE goal_shares
ADD COLUMN IF NOT EXISTS status share_status NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS decline_message TEXT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

UPDATE goal_shares
SET status = 'accepted'
WHERE status IS DISTINCT FROM 'accepted';

