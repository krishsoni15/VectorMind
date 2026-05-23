-- ═══════════════════════════════════════════════════════════════════════════
-- VECTORMIND v6 — FIX SCHEMA CACHE FOR chat_provider
-- Run this in Supabase SQL Editor to fix the "chat_provider not found" error
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Ensure columns exist
ALTER TABLE nods_project ADD COLUMN IF NOT EXISTS embedding_provider text DEFAULT 'cohere';
ALTER TABLE nods_project ADD COLUMN IF NOT EXISTS chat_provider text DEFAULT 'groq';

-- 2. Backfill any NULL values
UPDATE nods_project SET embedding_provider = COALESCE(embedding_provider, provider, 'cohere');
UPDATE nods_project SET chat_provider = COALESCE(chat_provider, 'groq');

-- 3. Force PostgREST schema cache reload
-- This is the critical fix! PostgREST caches the schema and doesn't see new columns.
NOTIFY pgrst, 'reload schema';

-- ✅ Done! The chat_provider column should now be visible to the API.
