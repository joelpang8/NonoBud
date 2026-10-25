-- Minimal stand-in for the parts of Supabase the migration relies on, so the
-- migration can be tested on a plain Postgres (PGlite) without a Supabase project.
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;
-- Supabase gives these roles table access by default and relies on RLS to restrict rows.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- Realtime pieces the Phase 4 migration touches.
create publication supabase_realtime;
create schema realtime;
create table realtime.messages (id bigserial primary key, topic text, extension text, payload jsonb, event text, private boolean);
alter table realtime.messages enable row level security;
grant usage on schema realtime to anon, authenticated;
grant select, insert on realtime.messages to anon, authenticated;
grant usage on sequence realtime.messages_id_seq to anon, authenticated;
