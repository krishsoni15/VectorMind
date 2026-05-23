import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const id = req.query.id as string
  if (!id) return res.status(400).json({ error: 'Missing project ID' })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Missing database credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    if (req.method === 'PATCH') {
      const { name } = req.body
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Missing project name' })
      }
      const { data, error } = await supabase
        .from('nods_project')
        .update({ name: name.trim() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return res.status(200).json(data)
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
