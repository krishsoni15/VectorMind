-- Migration: Update Vector Index to HNSW (Fixed for Mixed Dimensions)

-- Since your database contains both 768-dimensional (Gemini) and 1024-dimensional (Cohere) vectors,
-- we cannot constrain the entire column to 768. 
-- Instead, we leave the column as generic "vector" and create TWO partial HNSW indexes.

-- 1. Drop existing indexes (if any)
DROP INDEX IF EXISTS nods_page_section_embedding_idx;
DROP INDEX IF EXISTS nods_page_section_embedding_hnsw_idx;
DROP INDEX IF EXISTS nods_page_section_embedding_hnsw_768_idx;
DROP INDEX IF EXISTS nods_page_section_embedding_hnsw_1024_idx;

-- 2. Create partial HNSW index for 768-dimensional vectors (Gemini)
CREATE INDEX nods_page_section_embedding_hnsw_768_idx 
ON nods_page_section 
USING hnsw ((embedding::vector(768)) vector_ip_ops) 
WITH (m=16, ef_construction=64)
WHERE vector_dims(embedding) = 768;

-- 3. Create partial HNSW index for 1024-dimensional vectors (Cohere)
CREATE INDEX nods_page_section_embedding_hnsw_1024_idx 
ON nods_page_section 
USING hnsw ((embedding::vector(1024)) vector_ip_ops) 
WITH (m=16, ef_construction=64)
WHERE vector_dims(embedding) = 1024;

-- 4. Update the hybrid_search function to utilize the new partial indexes dynamically
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
DECLARE
  q_dim int;
BEGIN
  q_dim := vector_dims(query_embedding);

  IF q_dim = 768 THEN
    RETURN QUERY
    WITH semantic AS (
      SELECT s.id, s.content, s.heading_context, s.page_id,
             1 - ((s.embedding::vector(768)) <=> (query_embedding::vector(768))) AS sim,
             ROW_NUMBER() OVER (ORDER BY (s.embedding::vector(768)) <=> (query_embedding::vector(768))) AS rank
      FROM nods_page_section s
      JOIN nods_page p ON s.page_id = p.id
      WHERE vector_dims(s.embedding) = 768
        AND 1 - ((s.embedding::vector(768)) <=> (query_embedding::vector(768))) > similarity_threshold
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
  
  ELSIF q_dim = 1024 THEN
    RETURN QUERY
    WITH semantic AS (
      SELECT s.id, s.content, s.heading_context, s.page_id,
             1 - ((s.embedding::vector(1024)) <=> (query_embedding::vector(1024))) AS sim,
             ROW_NUMBER() OVER (ORDER BY (s.embedding::vector(1024)) <=> (query_embedding::vector(1024))) AS rank
      FROM nods_page_section s
      JOIN nods_page p ON s.page_id = p.id
      WHERE vector_dims(s.embedding) = 1024
        AND 1 - ((s.embedding::vector(1024)) <=> (query_embedding::vector(1024))) > similarity_threshold
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
  
  ELSE
    -- Fallback for unhandled dimensions (performs unindexed exact search)
    RETURN QUERY
    WITH semantic AS (
      SELECT s.id, s.content, s.heading_context, s.page_id,
             1 - (s.embedding <=> query_embedding) AS sim,
             ROW_NUMBER() OVER (ORDER BY s.embedding <=> query_embedding) AS rank
      FROM nods_page_section s
      JOIN nods_page p ON s.page_id = p.id
      WHERE s.embedding IS NOT NULL
        AND vector_dims(s.embedding) = q_dim
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
  END IF;
END;
$$;

-- 5. Update statistics
ANALYZE nods_page_section;
