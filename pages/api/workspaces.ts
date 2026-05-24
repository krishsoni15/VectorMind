import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withValidation, WorkspaceRequestSchema } from '../../lib/validateRequest'
import { withRateLimit } from '../../lib/rateLimiter'
import { z } from 'zod'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

async function workspacesHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  data: z.infer<typeof WorkspaceRequestSchema>
) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase not configured' })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    if (req.method === 'GET') {
      const { data: projects, error } = await supabase
        .from('nods_project')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return res.status(200).json(projects || [])
    }

    if (req.method === 'POST') {
      const { name, embedding_provider, chat_provider } = data
      if (!name) return res.status(400).json({ error: 'Workspace name is required' })

      const { data: project, error: dbError } = await supabase
        .from('nods_project')
        .insert({
          name,
          embedding_provider: embedding_provider || 'cohere',
          chat_provider: chat_provider || 'groq',
          provider: embedding_provider || 'cohere',
        })
        .select()
        .single()

      if (dbError) throw dbError
      return res.status(200).json(project)
    }

    if (req.method === 'PUT') {
      const { id, name, embedding_provider, chat_provider } = data
      if (!id) return res.status(400).json({ error: 'Workspace ID is required for update' })

      const updateData: any = {}
      if (name) updateData.name = name
      if (embedding_provider) {
        updateData.embedding_provider = embedding_provider
        updateData.provider = embedding_provider
      }
      if (chat_provider) updateData.chat_provider = chat_provider

      const { data: project, error: dbError } = await supabase
        .from('nods_project')
        .update(updateData)
        .eq('id', id)
        .select()
        .single()

      if (dbError) throw dbError
      return res.status(200).json(project)
    }

    if (req.method === 'DELETE') {
      // ID can come from query (validated via req.query in withValidation) or body
      const id = data.id || req.query.id as string
      if (!id) return res.status(400).json({ error: 'Workspace ID is required for deletion' })

      const { error } = await supabase.from('nods_project').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ success: true })
    }

    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  } catch (err: any) {
    console.error('[VectorMind] Workspaces API error:', err)
    return res.status(500).json({ error: err.message || 'Failed' })
  }
}

export default withRateLimit('workspaces', withValidation(WorkspaceRequestSchema, workspacesHandler))
