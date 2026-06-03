# Supabase Integration Plan

The current MVP stores profiles and boards in `localStorage` so the UI flow can be developed without backend setup. When Supabase is added, keep the UI component API stable and replace the persistence functions in `src/lib/storage.ts` with Supabase-backed implementations.

## Environment

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Tables

```sql
create table boards (
  id uuid primary key default gen_random_uuid(),
  share_token text unique not null,
  title text not null,
  ydoc_snapshot bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table users (
  id uuid primary key,
  nickname text not null,
  color text not null,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade,
  user_id uuid,
  nickname text not null,
  content text not null,
  mentions text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade,
  storage_path text not null,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create table board_snapshots (
  id uuid primary key default gen_random_uuid(),
  board_id uuid references boards(id) on delete cascade,
  ydoc_snapshot bytea not null,
  created_at timestamptz not null default now()
);
```

## First Adapter Targets

1. `loadBoards()` -> `select * from boards where deleted_at is null`
2. `createBoard()` / `upsertBoard()` -> `insert into boards`
3. `saveUserProfile()` -> anonymous `users` upsert
4. Assets -> Supabase Storage signed upload URL or S3-compatible storage
5. Messages/snapshots -> server actions or route handlers, not direct client writes for moderation and rate limiting
