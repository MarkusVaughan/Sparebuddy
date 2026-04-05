-- Add share_ratio to asset_shares
-- Represents the shared user's portion of the asset (0.0 – 1.0)
-- e.g. 0.5 means the shared user owns 50%, the owner gets the remaining 50%
alter table asset_shares
    add column share_ratio numeric(5, 4) not null default 0.5;
