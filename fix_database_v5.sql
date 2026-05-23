-- ═══════════════════════════════════════════════════════════════════════════
-- VECTORMIND v5 — COMPLETE DATABASE SETUP
-- Run this ENTIRE script in Supabase SQL Editor
-- Supports: Gemini (768d) + Cohere (1024d) embeddings
-- Chat: Gemini + Cohere + Groq
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Projects table with separate embedding + chat provider
CREATE TABLE IF NOT EXISTS nods_project (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  provider text DEFAULT 'cohere',
  embedding_provider text DEFAULT 'cohere',
  chat_provider text DEFAULT 'groq'
);

-- Add new columns if they don't exist (safe for existing DBs)
ALTER TABLE nods_project ADD COLUMN IF NOT EXISTS embedding_provider text DEFAULT 'cohere';
ALTER TABLE nods_project ADD COLUMN IF NOT EXISTS chat_provider text DEFAULT 'groq';

-- Backfill: if existing projects only have 'provider', copy to embedding_provider
UPDATE nods_project SET embedding_provider = provider WHERE embedding_provider IS NULL AND provider IS NOT NULL;
UPDATE nods_project SET chat_provider = 'groq' WHERE chat_provider IS NULL;

-- 3. Pages table
CREATE TABLE IF NOT EXISTS nods_page (
  id bigserial PRIMARY KEY,
  project_id uuid REFERENCES nods_project(id) ON DELETE CASCADE,
  parent_page_id bigint REFERENCES nods_page(id),
  path text NOT NULL,
  checksum text,
  meta jsonb,
  type text,
  source text,
  created_at timestamptz DEFAULT now()
);

-- 4. Page sections table
CREATE TABLE IF NOT EXISTS nods_page_section (
  id bigserial PRIMARY KEY,
  page_id bigint NOT NULL REFERENCES nods_page(id) ON DELETE CASCADE,
  content text,
  heading text,
  slug text,
  heading_context text,
  chunk_level int DEFAULT 1,
  token_count int,
  fts tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  created_at timestamptz DEFAULT now()
);

-- 5. Fix embedding column: must be unrestricted vector (no dimension limit)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'nods_page_section' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE nods_page_section DROP COLUMN embedding CASCADE;
  END IF;
  ALTER TABLE nods_page_section ADD COLUMN embedding vector;
END $$;

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_nods_page_section_fts ON nods_page_section USING gin(fts);
CREATE INDEX IF NOT EXISTS idx_nods_page_project ON nods_page(project_id);

-- 7. Drop ALL old hybrid_search versions
DROP FUNCTION IF EXISTS hybrid_search(vector(768), text, uuid, integer, double precision);
DROP FUNCTION IF EXISTS hybrid_search(vector(1024), text, uuid, integer, double precision);
DROP FUNCTION IF EXISTS hybrid_search(vector, text, uuid, integer, double precision);

-- 8. Recreate hybrid_search (accepts any vector dimension)
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector,
  query_text text,
  p_project_id uuid,
  match_count int DEFAULT 20,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id bigint,
  content text,
  heading_context text,
  similarity float,
  page_id bigint
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  WITH semantic AS (
    SELECT s.id, s.content, s.heading_context, s.page_id,
           1 - (s.embedding <=> query_embedding) AS sim,
           ROW_NUMBER() OVER (ORDER BY s.embedding <=> query_embedding) AS rank
    FROM nods_page_section s
    JOIN nods_page p ON s.page_id = p.id
    WHERE s.embedding IS NOT NULL
      AND 1 - (s.embedding <=> query_embedding) > similarity_threshold
      AND p.project_id = p_project_id
    LIMIT 60
  ),
  keyword AS (
    SELECT s.id, s.content, s.heading_context, s.page_id,
           ts_rank(s.fts, websearch_to_tsquery('english', query_text)) AS sim,
           ROW_NUMBER() OVER (ORDER BY ts_rank(s.fts, websearch_to_tsquery('english', query_text)) DESC) AS rank
    FROM nods_page_section s
    JOIN nods_page p ON s.page_id = p.id
    WHERE s.fts @@ websearch_to_tsquery('english', query_text)
      AND p.project_id = p_project_id
    LIMIT 60
  ),
  rrf AS (
    SELECT COALESCE(se.id, kw.id) AS id,
           COALESCE(se.content, kw.content) AS content,
           COALESCE(se.heading_context, kw.heading_context) AS heading_context,
           COALESCE(se.page_id, kw.page_id) AS page_id,
           COALESCE(1.0/(60 + se.rank), 0) + COALESCE(1.0/(60 + kw.rank), 0) AS rrf_score,
           COALESCE(se.sim, 0) AS similarity
    FROM semantic se FULL OUTER JOIN keyword kw ON se.id = kw.id
  )
  SELECT r.id, r.content, r.heading_context, r.similarity, r.page_id
  FROM rrf r
  ORDER BY r.rrf_score DESC
  LIMIT match_count;
END;
$$;

-- 9. Debug helper functions
CREATE OR REPLACE FUNCTION get_schema_info()
RETURNS TABLE(column_name text, data_type text, udt_name text)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT c.column_name::text, c.data_type::text, c.udt_name::text
  FROM information_schema.columns c
  WHERE c.table_name = 'nods_page_section';
END;
$$;

CREATE OR REPLACE FUNCTION get_table_indexes()
RETURNS TABLE(indexname text, indexdef text)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT idx.indexname::text, idx.indexdef::text
  FROM pg_indexes idx
  WHERE idx.tablename = 'nods_page_section';
END;
$$;

-- 10. RLS policies (allow all for dev)
ALTER TABLE nods_project ENABLE ROW LEVEL SECURITY;
ALTER TABLE nods_page ENABLE ROW LEVEL SECURITY;
ALTER TABLE nods_page_section ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nods_project' AND policyname = 'Allow all on nods_project') THEN
    CREATE POLICY "Allow all on nods_project" ON nods_project FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nods_page' AND policyname = 'Allow all on nods_page') THEN
    CREATE POLICY "Allow all on nods_page" ON nods_page FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nods_page_section' AND policyname = 'Allow all on nods_page_section') THEN
    CREATE POLICY "Allow all on nods_page_section" ON nods_page_section FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ✅ Done! Setup your API keys and create a project in VectorMind.
