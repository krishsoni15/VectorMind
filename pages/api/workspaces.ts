import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { withValidation, WorkspaceRequestSchema } from '../../lib/validateRequest'
import { withRateLimit } from '../../lib/rateLimiter'
import { getServerUserInfo, getUserTag, formatProjectForUser } from '../../lib/supabase'
import { z } from 'zod'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const supabaseAnonKey = (serviceKey && !serviceKey.includes('your_')) ? serviceKey : (anonKey || '')

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
    const userInfo = await getServerUserInfo(req)
    const tag = getUserTag(userInfo.email)

    if (req.method === 'GET') {
      const { data: projects, error } = await supabase
        .from('nods_project')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      let userProjects = (projects || []).filter((p: any) => p.name && p.name.startsWith(tag))
      if (userInfo.isGuest && userProjects.length === 0) {
        userProjects = (projects || []).filter((p: any) => !p.name || !p.name.startsWith('[usr:'))
      }

      if (userProjects.length === 0) {
        const defaultTaggedName = `${tag} Default Workspace`
        let newProj = null
        try {
          const result = await supabase
            .from('nods_project')
            .insert({
              name: defaultTaggedName,
              embedding_provider: 'cohere',
              chat_provider: 'groq',
              provider: 'cohere',
            })
            .select()
            .single()
          newProj = result.data
        } catch (e) { }

        if (newProj) {
          userProjects = [newProj]
        } else {
          userProjects = [{
            id: '00000000-0000-0000-0000-000000000001',
            name: defaultTaggedName,
            created_at: new Date().toISOString(),
            provider: 'cohere',
            embedding_provider: 'cohere',
            chat_provider: 'groq'
          }]
        }
      }

      const formatted = userProjects.map((p: any) => formatProjectForUser(p, userInfo.email))
      return res.status(200).json(formatted)
    }

    if (req.method === 'POST') {
      const { name, embedding_provider, chat_provider } = data
      if (!name) return res.status(400).json({ error: 'Workspace name is required' })

      const cleanName = name.replace(/^\[usr:[^\]]+\]\s*/, '').trim()
      const taggedName = `${tag} ${cleanName}`

      const insertPayload: any = {
        name: taggedName,
        embedding_provider: embedding_provider || 'cohere',
        chat_provider: chat_provider || 'groq',
        provider: embedding_provider || 'cohere',
      }

      const { data: project, error: dbError } = await supabase
        .from('nods_project')
        .insert(insertPayload)
        .select()
        .single()

      if (dbError) throw dbError
      return res.status(200).json(formatProjectForUser(project, userInfo.email))
    }

    if (req.method === 'PUT') {
      const { id, name, embedding_provider, chat_provider } = data
      if (!id) return res.status(400).json({ error: 'Workspace ID is required for update' })

      const updateData: any = {}
      if (name) {
        const cleanName = name.replace(/^\[usr:[^\]]+\]\s*/, '').trim()
        updateData.name = `${tag} ${cleanName}`
      }
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
      return res.status(200).json(formatProjectForUser(project, userInfo.email))
    }

    if (req.method === 'DELETE') {
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
