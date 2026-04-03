alter table categories
    add column if not exists user_id bigint references users(id) on delete cascade,
    add column if not exists base_category_id bigint references categories(id) on delete set null;

create index if not exists idx_categories_user_id on categories(user_id);
create index if not exists idx_categories_base_category_id on categories(base_category_id);
