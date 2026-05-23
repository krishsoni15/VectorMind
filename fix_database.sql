-- VECTORMIND DATABASE FIX

-- 1. Delete all existing chunks (they are broken anyway)
DELETE FROM nods_page_section;

-- 2. Drop the old search functions to prevent dependency errors
DROP FUNCTION IF EXISTS hybrid_search(vector(768), text, uuid, integer, double precision);
DROP FUNCTION IF EXISTS hybrid_search(vector, text, uuid, integer, double precision);

-- 3. Completely remove the old restricted 768-dimension column (CASCADE removes any hidden dependencies)
ALTER TABLE nods_page_section DROP COLUMN IF EXISTS embedding CASCADE;

-- 4. Add a new, unrestricted vector column that accepts ANY size (Gemini 768 or Cohere 1024)
ALTER TABLE nods_page_section ADD COLUMN embedding vector;

-- 5. Recreate the search function to use the new unrestricted vector
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
    WHERE 1 - (s.embedding <=> query_embedding) > similarity_threshold
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

-- 6. Helper functions to inspect schema (for debugging)
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
