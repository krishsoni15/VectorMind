import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Supabase credentials are not configured' })
  }

  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: class {} as any,
    },
  })

  if (req.method === 'GET') {
    try {
      const { data: pages, error } = await supabaseClient
        .from('nods_page')
        .select('id, path, checksum, type, source, meta, nods_page_section(id)')
        .order('id', { ascending: false })

      if (error) {
        throw error
      }

      const formattedPages = pages.map((page: any) => ({
        id: page.id,
        path: page.path,
        checksum: page.checksum,
        type: page.type,
        source: page.source,
        meta: page.meta,
        sectionCount: page.nods_page_section ? page.nods_page_section.length : 0,
      }))

      return res.status(200).json(formattedPages)
    } catch (err: any) {
      console.error('Error fetching documents:', err)
      return res.status(500).json({ error: err.message || 'Failed to fetch documents' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.query

      if (!id) {
        return res.status(400).json({ error: 'Document ID is required' })
      }

      // Fetch the page details to get the file path/type
      const { data: page, error: fetchError } = await supabaseClient
        .from('nods_page')
        .select('path, type')
        .eq('id', id)
        .maybeSingle()

      if (fetchError) {
        throw fetchError
      }

      // Delete the record from Supabase (cascades to nods_page_section)
      const { error } = await supabaseClient
        .from('nods_page')
        .delete()
        .eq('id', id)

      if (error) {
        throw error
      }

      // If it is an uploaded file, delete its local preview copy from public/uploads
      if (page && page.type === 'uploaded' && page.path) {
        const filename = page.path.replace('uploaded/', '')
        const filePath = path.join(process.cwd(), 'public', 'uploads', filename)
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
          }
        } catch (fsErr) {
          console.error('Failed to delete local copy of uploaded file:', fsErr)
        }
      }

      return res.status(200).json({ success: true })
    } catch (err: any) {
      console.error('Error deleting document:', err)
      return res.status(500).json({ error: err.message || 'Failed to delete document' })
    }
  }

  res.setHeader('Allow', ['GET', 'DELETE'])
  return res.status(405).json({ error: `Method ${req.method} not allowed` })
}
