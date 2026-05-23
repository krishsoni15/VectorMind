-- VECTORMIND ULTRA — Database Migration
-- ========================================
-- This migration MUST be run BEFORE deploying any new code.
-- Paste this entire file into the Supabase SQL Editor and execute.
-- ========================================

-- 1. Ensure the embedding column is vector(768) for Gemini embeddings.
--    If the column is already vector(768), this is a safe no-op.
--    If it was vector(1536) from the OpenAI era, this will convert it.
ALTER TABLE public.nods_page_section
ALTER COLUMN embedding TYPE vector(768)
USING embedding::vector(768);

-- 2. Add new chunking metadata columns (safe to re-run — uses IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nods_page_section'
      AND column_name = 'chunk_level'
  ) THEN
    ALTER TABLE public.nods_page_section ADD COLUMN chunk_level integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nods_page_section'
      AND column_name = 'chunk_index'
  ) THEN
    ALTER TABLE public.nods_page_section ADD COLUMN chunk_index integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nods_page_section'
      AND column_name = 'heading_context'
  ) THEN
    ALTER TABLE public.nods_page_section ADD COLUMN heading_context text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'nods_page_section'
      AND column_name = 'page_number'
  ) THEN
    ALTER TABLE public.nods_page_section ADD COLUMN page_number integer;
  END IF;
END
$$;

-- 3. Update the hybrid_search function to return the new metadata columns.
--    We must drop the existing function first because the return type has changed.
DROP FUNCTION IF EXISTS public.hybrid_search(vector, text, int, float);
DROP FUNCTION IF EXISTS public.hybrid_search(vector, text, integer, double precision);

CREATE OR REPLACE FUNCTION public.hybrid_search(
  query_embedding vector(768),
  query_text text,
  match_count int DEFAULT 10,
  match_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id bigint,
  page_id bigint,
  slug text,
  heading text,
  content text,
  similarity float,
  rrf_score float,
  chunk_level integer,
  heading_context text,
  page_number integer,
  token_count integer
)
LANGUAGE plpgsql AS $$
DECLARE
  cleaned_query text;
BEGIN
  -- Clean up the input query text by trimming whitespace
  cleaned_query := trim(query_text);

  RETURN QUERY
  WITH semantic_results AS (
    -- Get semantic results ranked by vector distance (pgvector negative dot product <#>)
    SELECT nods_page_section.id,
           row_number() OVER (ORDER BY nods_page_section.embedding <#> query_embedding ASC) AS rank
    FROM nods_page_section
    WHERE (nods_page_section.embedding <#> query_embedding) * -1 > match_threshold
  ),
  keyword_results AS (
    -- Get full-text keyword results ranked by ts_rank
    SELECT nods_page_section.id,
           row_number() OVER (ORDER BY ts_rank(fts, websearch_to_tsquery('english', cleaned_query)) DESC) AS rank
    FROM nods_page_section
    WHERE cleaned_query <> '' AND fts @@ websearch_to_tsquery('english', cleaned_query)
  )
  SELECT
    n.id,
    n.page_id,
    n.slug,
    n.heading,
    n.content,
    (n.embedding <#> query_embedding) * -1 AS similarity,
    -- Reciprocal Rank Fusion formula: 1 / (60 + rank)
    (coalesce(1.0 / (60.0 + s.rank), 0.0) + coalesce(1.0 / (60.0 + k.rank), 0.0))::float AS rrf_score,
    n.chunk_level,
    n.heading_context,
    n.page_number,
    n.token_count
  FROM semantic_results s
  FULL OUTER JOIN keyword_results k ON s.id = k.id
  JOIN nods_page_section n ON n.id = coalesce(s.id, k.id)
  ORDER BY rrf_score DESC
  LIMIT match_count;
END;
$$;

-- 4. Update the match_page_sections function signature to match 768 dimensions
--    Drop the existing function first to avoid return type conflicts.
DROP FUNCTION IF EXISTS match_page_sections(vector, float, int, int);
DROP FUNCTION IF EXISTS match_page_sections(vector, double precision, integer, integer);

CREATE OR REPLACE FUNCTION match_page_sections(
  embedding vector(768),
  match_threshold float,
  match_count int,
  min_content_length int
)
RETURNS TABLE (
  id bigint,
  page_id bigint,
  slug text,
  heading text,
  content text,
  similarity float
)
LANGUAGE plpgsql AS $$
#variable_conflict use_variable
BEGIN
  RETURN QUERY
  SELECT
    nods_page_section.id,
    nods_page_section.page_id,
    nods_page_section.slug,
    nods_page_section.heading,
    nods_page_section.content,
    (nods_page_section.embedding <#> embedding) * -1 AS similarity
  FROM nods_page_section
  WHERE length(nods_page_section.content) >= min_content_length
    AND (nods_page_section.embedding <#> embedding) * -1 > match_threshold
  ORDER BY nods_page_section.embedding <#> embedding
  LIMIT match_count;
END;
$$;

-- 5. Ensure GIN index on fts column exists (idempotent)
CREATE INDEX IF NOT EXISTS nods_page_section_fts_idx
ON public.nods_page_section USING gin(fts);

-- 6. Create an HNSW index on the embedding column for faster vector search
--    (Only created if it doesn't already exist)
CREATE INDEX IF NOT EXISTS nods_page_section_embedding_idx
ON public.nods_page_section USING hnsw(embedding vector_ip_ops);
