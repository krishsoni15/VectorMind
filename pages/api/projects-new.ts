import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { getServerUserInfo, getUserTag, formatProjectForUser } from '../../lib/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const supabaseAnonKey = (serviceKey && !serviceKey.includes('your_')) ? serviceKey : (anonKey || '')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

      if (error) {
        console.warn('[VectorMind] Projects GET warning:', error.message)
        return res.status(200).json([formatProjectForUser({
          id: '00000000-0000-0000-0000-000000000001',
          name: `${tag} Default Workspace`,
          created_at: new Date().toISOString(),
          provider: 'cohere',
          embedding_provider: 'cohere',
          chat_provider: 'groq'
        }, userInfo.email)])
      }

      let userProjects = (projects || []).filter((p: any) => p.name && p.name.startsWith(tag))

      // For guest users, if no tagged project exists, include untagged legacy projects
      if (userInfo.isGuest && userProjects.length === 0) {
        userProjects = (projects || []).filter((p: any) => !p.name || !p.name.startsWith('[usr:'))
      }

      // If user has 0 projects, create default workspace for this user in Supabase
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
        } catch (e) {}

        if (!newProj) {
          try {
            const result = await supabase
              .from('nods_project')
              .insert({
                name: defaultTaggedName,
                provider: 'cohere',
              })
              .select()
              .single()
            newProj = result.data
          } catch (e) {}
        }

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
      const { name, embedding_provider, chat_provider } = req.body
      if (!name) return res.status(400).json({ error: 'Project name is required' })

      const cleanName = name.replace(/^\[usr:[^\]]+\]\s*/, '').trim()
      const taggedName = `${tag} ${cleanName}`

      let project = null
      let dbError: any = null
      try {
        const result = await supabase
          .from('nods_project')
          .insert({
            name: taggedName,
            embedding_provider: embedding_provider || 'cohere',
            chat_provider: chat_provider || 'groq',
            provider: embedding_provider || 'cohere',
          })
          .select()
          .single()
        project = result.data
        dbError = result.error
      } catch (e: any) {
        dbError = e
      }

      const errMsg = dbError?.message || ''
      if (dbError && (errMsg.includes('chat_provider') || errMsg.includes('embedding_provider') || errMsg.includes('Could not find') || errMsg.includes('column'))) {
        try {
          const result = await supabase
            .from('nods_project')
            .insert({
              name: taggedName,
              embedding_provider: embedding_provider || 'cohere',
              provider: embedding_provider || 'cohere',
            })
            .select('id, name, created_at, provider, embedding_provider')
            .single()
          project = result.data
          dbError = result.error
        } catch (e: any) {
          dbError = e
        }

        const fallbackErrMsg = dbError?.message || ''
        if (dbError && (fallbackErrMsg.includes('embedding_provider') || fallbackErrMsg.includes('Could not find') || fallbackErrMsg.includes('column'))) {
          try {
            const result = await supabase
              .from('nods_project')
              .insert({
                name: taggedName,
                provider: embedding_provider || 'cohere',
              })
              .select('id, name, created_at, provider')
              .single()
            project = result.data
            dbError = result.error
          } catch (e: any) {
            dbError = e
          }
        }
      }

      if (dbError && (dbError.code === '42501' || errMsg.includes('row-level security'))) {
        console.warn('[VectorMind] RLS policy notice: Using fallback project object until SQL script is run in Supabase dashboard')
        project = {
          id: '00000000-0000-0000-0000-000000000001',
          name: taggedName,
          created_at: new Date().toISOString(),
          provider: embedding_provider || 'cohere',
          embedding_provider: embedding_provider || 'cohere',
          chat_provider: chat_provider || 'groq',
          _rlsFallback: true
        }
        dbError = null
      }

      if (project) {
        project.embedding_provider = project.embedding_provider || project.provider || embedding_provider || 'cohere'
        project.chat_provider = project.chat_provider || chat_provider || 'groq'
        project = formatProjectForUser(project, userInfo.email)
      }

      if (dbError && !project) throw dbError
      return res.status(200).json(project)
    }

    if (req.method === 'DELETE') {
      const { id } = req.query
      if (!id) return res.status(400).json({ error: 'Project ID is required' })

      const { error } = await supabase.from('nods_project').delete().eq('id', id)
      if (error) throw error
      return res.status(200).json({ success: true })
    }

    if (req.method === 'PUT') {
      const { id, name, embedding_provider, chat_provider } = req.body
      if (!id) return res.status(400).json({ error: 'ID is required' })

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

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'Nothing to update' })
      }

      let data = null
      let dbError = null

      try {
        const result = await supabase
          .from('nods_project')
          .update(updateData)
          .eq('id', id)
          .select()
          .single()
        data = result.data
        dbError = result.error
      } catch (e: any) {
        dbError = e
      }

      const errMsg = dbError?.message || ''
      if (dbError && (errMsg.includes('chat_provider') || errMsg.includes('embedding_provider') || errMsg.includes('Could not find') || errMsg.includes('column'))) {
        if (embedding_provider || updateData.name) {
          try {
            const fallback = await supabase
              .from('nods_project')
              .update(updateData)
              .eq('id', id)
              .select('id, name, created_at, provider, embedding_provider')
              .single()
            data = fallback.data
            dbError = fallback.error
          } catch (e: any) {
            dbError = e
          }
        } else {
          return res.status(200).json(formatProjectForUser({ id, chat_provider, _localOnly: true }, userInfo.email))
        }
      }

      if (data) {
        data.embedding_provider = data.embedding_provider || data.provider || embedding_provider || 'cohere'
        data.chat_provider = data.chat_provider || chat_provider || 'groq'
        data = formatProjectForUser(data, userInfo.email)
      }

      if (dbError && !data) throw dbError
      return res.status(200).json(data)
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE', 'PUT'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  } catch (err: any) {
    console.error('[VectorMind] Projects API error:', err)
    return res.status(500).json({ error: err.message || 'Failed' })
  }
}
