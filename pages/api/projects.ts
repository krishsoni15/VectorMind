import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
      const { name, embedding_provider, chat_provider } = req.body
      if (!name) return res.status(400).json({ error: 'Project name is required' })

      let project = null
      let dbError = null
      try {
        const result = await supabase
          .from('nods_project')
          .insert({
            name,
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
              name,
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
                name,
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

      if (project) {
        project.embedding_provider = project.embedding_provider || project.provider || embedding_provider || 'cohere'
        project.chat_provider = project.chat_provider || chat_provider || 'groq'
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
      const { id, embedding_provider, chat_provider } = req.body
      if (!id) return res.status(400).json({ error: 'ID is required' })

      const updateData: any = {}
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
        if (embedding_provider) {
          try {
            const fallback = await supabase
              .from('nods_project')
              .update({ embedding_provider, provider: embedding_provider })
              .eq('id', id)
              .select('id, name, created_at, provider, embedding_provider')
              .single()
            data = fallback.data
            dbError = fallback.error
          } catch (e: any) {
            dbError = e
          }

          const fallbackErrMsg = dbError?.message || ''
          if (dbError && (fallbackErrMsg.includes('embedding_provider') || fallbackErrMsg.includes('Could not find') || fallbackErrMsg.includes('column'))) {
            try {
              const fallback = await supabase
                .from('nods_project')
                .update({ provider: embedding_provider })
                .eq('id', id)
                .select('id, name, created_at, provider')
                .single()
              data = fallback.data
              dbError = fallback.error
            } catch (e: any) {
              dbError = e
            }
          }
        } else {
          // chat_provider only update: bypass DB and return success for client local storage
          return res.status(200).json({ id, chat_provider, _localOnly: true })
        }
      }

      if (data) {
        data.embedding_provider = data.embedding_provider || data.provider || embedding_provider || 'cohere'
        data.chat_provider = data.chat_provider || chat_provider || 'groq'
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
