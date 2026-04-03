create table if not exists goals (
    id bigserial primary key,
    user_id bigint not null references users(id) on delete cascade,
    name text not null,
    target_amount numeric(12, 2) not null,
    current_amount numeric(12, 2) not null default 0,
    target_month text not null,
    notes text,
    created_at timestamptz default now()
);
