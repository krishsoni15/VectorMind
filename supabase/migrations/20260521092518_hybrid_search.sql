-- 1. Add full-text search tsvector column to nods_page_section
-- We use a nullable tsvector column to hold the tokenized data
ALTER TABLE public.nods_page_section ADD COLUMN IF NOT EXISTS fts tsvector;

-- 2. Create the trigger function to automatically update the fts column on insert or update
-- It coalesces heading and content so that both fields are indexed and searchable,
-- and handles potentially null fields gracefully.
CREATE OR REPLACE FUNCTION public.nods_page_section_fts_trigger()
RETURNS trigger AS $$
BEGIN
  NEW.fts := to_tsvector('english', coalesce(NEW.heading, '') || ' ' || coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Bind the trigger to the nods_page_section table
-- This trigger will fire BEFORE any INSERT or UPDATE operation on any row,
-- ensuring the fts search vector is always perfectly in sync with the section's contents.
CREATE OR REPLACE TRIGGER trg_nods_page_section_fts
BEFORE INSERT OR UPDATE ON public.nods_page_section
FOR EACH ROW
EXECUTE FUNCTION public.nods_page_section_fts_trigger();

-- 4. Backfill existing page sections
-- This will compile the search vectors for all documents already stored in the system.
UPDATE public.nods_page_section
SET fts = to_tsvector('english', coalesce(heading, '') || ' ' || coalesce(content, ''));

-- 5. Create a GIN index on the fts column
-- GIN (Generalized Inverted Index) makes full-text search queries extremely fast,
-- even across hundreds of thousands of document chunks.
CREATE INDEX IF NOT EXISTS nods_page_section_fts_idx ON public.nods_page_section USING gin(fts);

-- 6. Create the new hybrid_search RPC function
-- This combines semantic matching (pgvector dot product operator <#>) and full-text keyword matching
-- (tsvector @@ tsquery) and fuses their ranked lists using Reciprocal Rank Fusion (RRF).
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
  rrf_score float
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
    -- We use websearch_to_tsquery because it handles user input in a Google-like fashion,
    -- allowing phrases in quotes, operators like OR/AND, and ignoring syntax errors.
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
    -- If present in only one set, the other set contributes 0.0
    (coalesce(1.0 / (60.0 + s.rank), 0.0) + coalesce(1.0 / (60.0 + k.rank), 0.0))::float AS rrf_score
  FROM semantic_results s
  FULL OUTER JOIN keyword_results k ON s.id = k.id
  JOIN nods_page_section n ON n.id = coalesce(s.id, k.id)
  ORDER BY rrf_score DESC
  LIMIT match_count;
END;
$$;
