// Stand-ins for the Supabase-owned objects our migrations reference (auth.users,
// storage.buckets, the anon/authenticated roles). Shared by the in-process PGlite
// unit tests and the Postgres database the e2e harness resets. Idempotent, because
// roles are cluster-wide on a real server. Never run against a real Supabase project.

export const SUPABASE_STUBS = `
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    email_confirmed_at timestamptz
  );
  create schema if not exists storage;
  create table if not exists storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
  do $$ begin
    if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  end $$;
`;

/** Mirrors Supabase's default grants, so RLS (not missing grants) is what denies access. */
export const SUPABASE_GRANTS = `
  grant usage on schema public to anon, authenticated;
  grant select, insert, update, delete on all tables in schema public to anon, authenticated;
`;
