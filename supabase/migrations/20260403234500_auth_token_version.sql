alter table users
    add column if not exists auth_token_version bigint not null default 1;
