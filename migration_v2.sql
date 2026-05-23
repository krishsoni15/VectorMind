-- VectorMind V2: Multi-Project & Storage Migration

-- 1. Create Projects Table
CREATE TABLE IF NOT EXISTS nods_project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Insert a "Default Project" to migrate existing data
INSERT INTO nods_project (id, name) 
VALUES ('00000000-0000-0000-0000-000000000000', 'Default Workspace')
ON CONFLICT DO NOTHING;

-- 2. Add project_id to nods_page
ALTER TABLE nods_page 
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES nods_project(id) ON DELETE CASCADE;

-- Set existing pages to the default project
UPDATE nods_page SET project_id = '00000000-0000-0000-0000-000000000000' WHERE project_id IS NULL;

-- Make project_id required moving forward
ALTER TABLE nods_page ALTER COLUMN project_id SET NOT NULL;

-- 3. Storage Bucket for PDF Previews
-- Note: You must run this if you want the PDF previews to work!
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to the bucket
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'documents');
CREATE POLICY "Anon Insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documents');

-- 4. Rebuild Hybrid Search to be Project-Aware
DROP FUNCTION IF EXISTS hybrid_search(vector, text, integer, double precision);

CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(768),
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
