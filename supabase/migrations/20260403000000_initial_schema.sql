-- Initial Sparebuddy schema

-- Enums
create type account_type as enum ('checking', 'savings', 'credit');
create type asset_type as enum ('bank', 'investment', 'pension', 'property', 'other');
create type category_type as enum ('expense', 'income');

-- Users
create table users (
    id bigserial primary key,
    name text not null,
    email text unique not null,
    password_hash text not null,
    created_at timestamptz default now()
);

-- Accounts
create table accounts (
    id bigserial primary key,
    user_id bigint not null references users(id) on delete cascade,
    name text not null,
    bank text default 'DNB',
    account_type account_type default 'checking',
    account_number text
);

-- Categories
create table categories (
    id bigserial primary key,
    name text not null,
    color text default '#6366f1',
    icon text default '💳',
    category_type category_type default 'expense'
);

-- Category rules (auto-categorization)
create table category_rules (
    id bigserial primary key,
    category_id bigint not null references categories(id) on delete cascade,
    match_text text not null,
    is_active boolean default true
);

-- Transactions
create table transactions (
    id bigserial primary key,
    account_id bigint not null references accounts(id) on delete cascade,
    category_id bigint references categories(id) on delete set null,
    date date not null,
    description text not null,
    amount numeric(12, 2) not null,
    balance_after numeric(12, 2),
    imported_at timestamptz default now(),
    import_hash text unique not null
);

-- Budget targets
create table budget_targets (
    id bigserial primary key,
    user_id bigint not null references users(id) on delete cascade,
    category_id bigint not null references categories(id) on delete cascade,
    month text not null,  -- Format: "2026-04"
    amount numeric(12, 2) not null
);

-- Assets (net worth tracking)
create table assets (
    id bigserial primary key,
    user_id bigint not null references users(id) on delete cascade,
    name text not null,
    asset_type asset_type not null,
    value numeric(12, 2) not null,
    recorded_date date not null,
    notes text
);

-- Seed default categories
insert into categories (name, color, icon, category_type) values
    ('Dagligvarer',             '#22c55e', '🛒', 'expense'),
    ('Restaurant & Kafe',       '#f97316', '🍽️', 'expense'),
    ('Transport',               '#3b82f6', '🚗', 'expense'),
    ('Abonnementer',            '#8b5cf6', '📱', 'expense'),
    ('Helse',                   '#ec4899', '🏥', 'expense'),
    ('Klær & Shopping',         '#f59e0b', '👕', 'expense'),
    ('Bolig & Hushold',         '#64748b', '🏠', 'expense'),
    ('Fritid & Underholdning',  '#06b6d4', '🎬', 'expense'),
    ('Reise & Ferie',           '#10b981', '✈️', 'expense'),
    ('Sparing',                 '#6366f1', '💰', 'expense'),
    ('Lønn',                    '#16a34a', '💼', 'income'),
    ('Overføring',              '#94a3b8', '↔️', 'income'),
    ('Annet',                   '#9ca3af', '📦', 'expense');
