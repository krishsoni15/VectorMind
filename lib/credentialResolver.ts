import { getAdminSupabase } from './supabase'
import { decrypt } from './encryption'

export type AIProvider = 'gemini' | 'openai' | 'groq' | 'cohere'

const ENV_KEY_MAP: Record<AIProvider, string> = {
  gemini: 'GEMINI_API_KEY',
  openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY',
  cohere: 'COHERE_API_KEY',
}

interface ResolveCredentialOptions {
  userId?: string | null
  provider: AIProvider
}

/**
 * Resolves the API key for a provider.
 * Checks user's stored encrypted API key first, then falls back to server env vars.
 */
export async function getProviderCredential({
  userId,
  provider,
}: ResolveCredentialOptions): Promise<string | null> {
  const normalizedProvider = provider.toLowerCase() as AIProvider

  // 1. If user is authenticated, check database for personal key
  if (userId) {
    try {
      const supabase = getAdminSupabase()
      const { data, error } = await supabase
        .from('user_provider_keys')
        .select('encrypted_api_key')
        .eq('user_id', userId)
        .eq('provider', normalizedProvider)
        .single()

      if (!error && data?.encrypted_api_key) {
        const decryptedKey = decrypt(data.encrypted_api_key)
        if (decryptedKey) {
          return decryptedKey
        }
      }
    } catch (err) {
      console.error(`Error fetching user API key for provider ${provider}:`, err)
    }
  }

  // 2. Fallback to server environment variables
  const envVarName = ENV_KEY_MAP[normalizedProvider]
  if (envVarName && process.env[envVarName]) {
    return process.env[envVarName] || null
  }

  return null
}
