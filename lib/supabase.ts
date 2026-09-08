import { createClient } from '@supabase/supabase-js'
import type { NextApiRequest } from 'next'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl) {
  console.warn('NEXT_PUBLIC_SUPABASE_URL is not set in environment variables.')
}

// Client-side browser Supabase instance
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)

// Server-side admin Supabase instance (bypasses RLS for backend operations)
export const getAdminSupabase = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase URL or Service Role Key missing in environment variables.')
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Helper to extract the authenticated user from Next.js API requests
export async function getServerUser(req: NextApiRequest) {
  try {
    const authHeader = req.headers.authorization
    let token: string | null = null

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    } else if (req.cookies['sb-access-token']) {
      token = req.cookies['sb-access-token']
    }

    if (!token) {
      return null
    }

    const adminSupabase = getAdminSupabase()
    const { data: { user }, error } = await adminSupabase.auth.getUser(token)

    if (error || !user) {
      return null
    }

    return user
  } catch (err) {
    console.error('Error verifying server user:', err)
    return null
  }
}

export interface ServerUserInfo {
  id: string
  email: string
  name: string
  isGuest: boolean
}

export async function getServerUserInfo(req: NextApiRequest): Promise<ServerUserInfo> {
  try {
    const user = await getServerUser(req)
    if (user && user.email) {
      return {
        id: user.id,
        email: user.email.toLowerCase(),
        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0],
        isGuest: false,
      }
    }
  } catch (e) {
    // Ignore error, fallback to headers
  }

  const headerEmail = (req.headers['x-user-email'] as string)?.trim().toLowerCase()
  const headerName = (req.headers['x-user-name'] as string)?.trim()
  const headerIsGuest = req.headers['x-user-is-guest'] === 'true'

  if (headerEmail && !headerIsGuest && headerEmail !== 'guest' && headerEmail !== 'guest@vectormind.ai') {
    return {
      id: `user_${headerEmail}`,
      email: headerEmail,
      name: headerName || headerEmail.split('@')[0],
      isGuest: false,
    }
  }

  return {
    id: 'guest',
    email: 'guest@vectormind.ai',
    name: 'Guest User',
    isGuest: true,
  }
}

export function getUserTag(email: string): string {
  return `[usr:${email.trim().toLowerCase()}]`
}

export function formatProjectForUser(project: any, userEmail: string) {
  if (!project) return project
  const tag = getUserTag(userEmail)
  let cleanName = project.name || 'Workspace'
  if (cleanName.startsWith(tag)) {
    cleanName = cleanName.substring(tag.length).trim()
  } else if (cleanName.startsWith('[usr:')) {
    cleanName = cleanName.replace(/^\[usr:[^\]]+\]\s*/, '')
  }
  return {
    ...project,
    name: cleanName || 'Workspace',
    user_email: userEmail,
  }
}

