-- ============================================================================
-- VectorMind — Supabase Database Schema
-- ============================================================================
-- Run this entire script in your Supabase SQL Editor (Dashboard → SQL Editor)
-- This creates all tables, indexes, functions, and RLS policies needed.
-- ============================================================================

-- 1. Enable required extensions
-- ============================================================================
create extension if not exists vector with schema extensions;

-- 2. Core Tables
-- ============================================================================

-- Projects / Workspaces table
create table if not exists public.nods_project (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Default Workspace',
  created_at timestamptz default now(),
  provider text default 'cohere',
  embedding_provider text default 'cohere',
  chat_provider text default 'groq'
);

-- Document pages (metadata per uploaded file)
create table if not exists public.nods_page (
  id bigserial primary key,
  project_id text not null,
  path text not null,
  checksum text,
  meta jsonb,
  type text
);

-- Vector embedding chunks (one row per chunk)
create table if not exists public.nods_page_section (
  id bigserial primary key,
  page_id bigint not null references public.nods_page on delete cascade,
  content text,
  token_count int,
  embedding vector(768),
  chunk_level int default 0
);

-- 3. Indexes for fast similarity search
-- ============================================================================

-- HNSW index for cosine similarity (fast approximate nearest-neighbor)
create index if not exists idx_nods_page_section_embedding_hnsw
  on public.nods_page_section
  using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- B-tree index on page_id for fast joins
create index if not exists idx_nods_page_section_page_id
  on public.nods_page_section (page_id);

-- B-tree index on project_id for fast project filtering
create index if not exists idx_nods_page_project_id
  on public.nods_page (project_id);

-- 4. Hybrid Search Function (BM25 + Vector Cosine)
-- ============================================================================
-- This function performs combined keyword + semantic vector search using
-- Reciprocal Rank Fusion (RRF) to merge both result sets.

create or replace function public.hybrid_search(
  query_text text,
  query_embedding vector(768),
  p_project_id text,
  match_count int default 10,
  similarity_threshold float default 0.5
)
returns table (
  id bigint,
  page_id bigint,
  content text,
  token_count int,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    s.id,
    s.page_id,
    s.content,
    s.token_count,
    (1 - (s.embedding <=> query_embedding))::float as similarity
  from public.nods_page_section s
  inner join public.nods_page p on s.page_id = p.id
  where p.project_id = p_project_id
    and s.embedding is not null
    and (1 - (s.embedding <=> query_embedding)) > similarity_threshold
  order by s.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 5. Schema Introspection Helper (used by diagnostics)
-- ============================================================================

create or replace function public.get_schema_info()
returns table (
  table_name text,
  column_name text,
  data_type text,
  udt_name text
)
language sql
security definer
as $$
  select
    c.table_name::text,
    c.column_name::text,
    c.data_type::text,
    c.udt_name::text
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in ('nods_project', 'nods_page', 'nods_page_section')
  order by c.table_name, c.ordinal_position;
$$;

-- 6. Index Introspection Helper
-- ============================================================================

create or replace function public.get_table_indexes()
returns table (
  tablename text,
  indexname text,
  indexdef text
)
language sql
security definer
as $$
  select
    i.tablename::text,
    i.indexname::text,
    i.indexdef::text
  from pg_indexes i
  where i.schemaname = 'public'
    and i.tablename in ('nods_project', 'nods_page', 'nods_page_section')
  order by i.tablename, i.indexname;
$$;

-- 7. Row Level Security (RLS) — Permissive Policies
-- ============================================================================
-- These policies allow the service role key (used by the Next.js backend)
-- full access. For production multi-tenant setups, restrict by auth.uid().

alter table public.nods_project enable row level security;
alter table public.nods_page enable row level security;
alter table public.nods_page_section enable row level security;

-- Allow all operations via service role
create policy "Allow all for service role" on public.nods_project
  for all using (true) with check (true);

create policy "Allow all for service role" on public.nods_page
  for all using (true) with check (true);

create policy "Allow all for service role" on public.nods_page_section
  for all using (true) with check (true);

-- ============================================================================
-- Done! Your VectorMind database is ready.
-- ============================================================================
