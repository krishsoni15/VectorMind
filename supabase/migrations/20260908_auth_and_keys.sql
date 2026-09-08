-- Migration: Auth and User Provider Keys
-- Date: 2026-09-08

-- 1. Create table for user personal AI provider keys
CREATE TABLE IF NOT EXISTS user_provider_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('gemini', 'openai', 'groq', 'cohere')),
    encrypted_api_key text NOT NULL,
    key_last4 text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(user_id, provider)
);

-- 2. Add user_id to existing workspace and document tables (nullable for backward compatibility)
ALTER TABLE nods_project ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE nods_page ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 3. Enable RLS on user_provider_keys
ALTER TABLE user_provider_keys ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy: Users can manage only their own keys
DROP POLICY IF EXISTS "Users can manage own keys" ON user_provider_keys;
CREATE POLICY "Users can manage own keys"
  ON user_provider_keys FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Update RLS policies on nods_project and nods_page for user isolation + unowned fallback
DROP POLICY IF EXISTS "Users see own or unowned projects" ON nods_project;
CREATE POLICY "Users see own or unowned projects"
  ON nods_project FOR ALL
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users see own or unowned pages" ON nods_page;
CREATE POLICY "Users see own or unowned pages"
  ON nods_page FOR ALL
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (true);
