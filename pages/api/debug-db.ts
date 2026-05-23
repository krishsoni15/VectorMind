import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase envs missing' })
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const { data: schemaInfo, error: schemaError } = await supabase.rpc('get_schema_info')
    const { data: indexInfo, error: indexError } = await supabase.rpc('get_table_indexes')
    
    // Count actual embeddings
    const { count: sectionCount } = await supabase
      .from('nods_page_section')
      .select('*', { count: 'exact', head: true })
    
    const { count: pageCount } = await supabase
      .from('nods_page')
      .select('*', { count: 'exact', head: true })

    const { count: projectCount } = await supabase
      .from('nods_project')
      .select('*', { count: 'exact', head: true })

    // Check if embedding column exists in schema
    const embeddingCol = schemaInfo?.find((c: any) => c.column_name === 'embedding')

    return res.status(200).json({
      status: embeddingCol ? 'OK' : 'NEEDS_MIGRATION',
      embeddingColumn: embeddingCol || 'MISSING - Run fix_database_v4.sql!',
      counts: {
        projects: projectCount,
        pages: pageCount,
        sections: sectionCount
      },
      schemaInfo,
      indexInfo,
      errors: {
        schema: schemaError,
        index: indexError
      },
      apiKeys: {
        gemini: process.env.GEMINI_API_KEY ? 'SET' : 'MISSING',
        cohere: process.env.COHERE_API_KEY ? 'SET' : 'MISSING',
      }
    })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
