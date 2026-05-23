// VECTORMIND — documents.ts
// Document Library API: GET (list by projectId) and DELETE (remove by id)
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase not configured', step: 'config' })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    if (req.method === 'GET') {
      const { projectId } = req.query
      
      let query = supabase
        .from('nods_page')
        .select('id, path, checksum, meta, project_id, nods_page_section(id)')
        .order('id', { ascending: false })

      if (projectId && typeof projectId === 'string') {
        query = query.eq('project_id', projectId)
      }

      const { data: pages, error } = await query

      if (error) {
        throw error
      }

      const formattedPages = (pages || []).map((page: any) => ({
        id: String(page.id),
        path: page.path,
        checksum: page.checksum,
        meta: page.meta,
        projectId: page.project_id,
        sectionCount: page.nods_page_section ? page.nods_page_section.length : 0,
      }))

      return res.status(200).json(formattedPages)
    }

    if (req.method === 'DELETE') {
      const { id } = req.query

      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Document ID is required', step: 'validation' })
      }

      const ids = id.split(',')

      // First get documents to find storage URLs
      const { data: pages } = await supabase
        .from('nods_page')
        .select('meta')
        .in('id', ids)
      
      const storagePaths = (pages || [])
        .map((p: any) => p.meta?.storagePath)
        .filter(Boolean)

      if (storagePaths.length > 0) {
        // Attempt to delete from storage bucket
        await supabase.storage.from('documents').remove(storagePaths)
      }

      // Delete the records (cascades to nods_page_section via ON DELETE CASCADE)
      const { error } = await supabase
        .from('nods_page')
        .delete()
        .in('id', ids)

      if (error) {
        throw error
      }

      return res.status(200).json({ success: true })
    }

    res.setHeader('Allow', ['GET', 'DELETE'])
    return res.status(405).json({ error: `Method ${req.method} not allowed`, step: 'validation' })
  } catch (err: any) {
    console.error('[VectorMind] Documents API error:', err)
    return res.status(500).json({
      error: err.message || 'Failed to process request',
      step: 'database'
    })
  }
}
