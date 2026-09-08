import type { NextApiRequest, NextApiResponse } from 'next'
import { getServerUser, getAdminSupabase } from '@/lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await getServerUser(req)
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const supabase = getAdminSupabase()
    
    // Fetch user's stored provider keys metadata
    const { data: userKeys, error } = await supabase
      .from('user_provider_keys')
      .select('provider, key_last4, updated_at')
      .eq('user_id', user.id)

    if (error) {
      console.error('Error fetching user keys:', error)
    }

    const providersList = ['gemini', 'openai', 'groq', 'cohere']
    const providerStatus: Record<string, { configured: boolean; key_last4: string | null; source: 'personal' | 'env' | 'none' }> = {}

    providersList.forEach((provider) => {
      const userKey = userKeys?.find((k: any) => k.provider === provider)
      const envKeyName = `${provider.toUpperCase()}_API_KEY`
      const hasEnvKey = !!process.env[envKeyName]

      if (userKey) {
        providerStatus[provider] = {
          configured: true,
          key_last4: userKey.key_last4 || null,
          source: 'personal',
        }
      } else if (hasEnvKey) {
        providerStatus[provider] = {
          configured: true,
          key_last4: null,
          source: 'env',
        }
      } else {
        providerStatus[provider] = {
          configured: false,
          key_last4: null,
          source: 'none',
        }
      }
    })

    return res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      },
      providerKeys: providerStatus,
    })
  } catch (err: any) {
    console.error('Error in /api/auth/user:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
