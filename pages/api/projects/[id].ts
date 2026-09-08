import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getServerUserInfo, getUserTag, formatProjectForUser } from '../../../lib/supabase'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const id = req.query.id as string
  const isValidUuid = (str?: string) => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
  if (!id || !isValidUuid(id)) return res.status(400).json({ error: 'Valid UUID project ID is required' })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing database credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const userInfo = await getServerUserInfo(req)
    const tag = getUserTag(userInfo.email)

    if (req.method === 'PATCH') {
      const { name } = req.body
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Missing project name' })
      }
      const cleanName = name.trim().replace(/^\[usr:[^\]]+\]\s*/, '')
      const taggedName = `${tag} ${cleanName}`

      const { data, error } = await supabase
        .from('nods_project')
        .update({ name: taggedName })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json(formatProjectForUser(data, userInfo.email))
    } else {
      const { error } = await supabase.from('nods_project').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ success: true })
    }
  } catch (error: any) {
    console.error('Project operation error:', error)
    return res.status(500).json({ error: error.message })
  }
}
