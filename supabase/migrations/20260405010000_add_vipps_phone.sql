-- Add vipps_phone to users table
-- Used for Vipps payment deeplinks when settling shared expenses / assets
alter table users
    add column vipps_phone text null;
