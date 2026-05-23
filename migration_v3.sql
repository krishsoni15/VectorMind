-- VectorMind V3: Multi-Provider Support (Gemini & Cohere)

-- 1. Add provider selection to projects
ALTER TABLE nods_project ADD COLUMN IF NOT EXISTS provider text DEFAULT 'gemini';

-- 2. Allow any size vector in sections to support both Gemini (768d) and Cohere (1024d)
ALTER TABLE nods_page_section ALTER COLUMN embedding TYPE vector;

-- 3. Rebuild Hybrid Search to accept generic vector (no dimension limit)
DROP FUNCTION IF EXISTS hybrid_search(vector(768), text, uuid, integer, double precision);
DROP FUNCTION IF EXISTS hybrid_search(vector, text, uuid, integer, double precision);

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
