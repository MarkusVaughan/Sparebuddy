alter table goals
    add column if not exists goal_type text not null default 'savings',
    add column if not exists monthly_target numeric(12, 2),
    add column if not exists start_month text,
    add column if not exists category_id bigint references categories(id) on delete set null;

update goals
set start_month = to_char(created_at, 'YYYY-MM')
where start_month is null;

alter table goals
    alter column start_month set not null;
