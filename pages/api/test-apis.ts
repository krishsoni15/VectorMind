// Diagnostic endpoint to test all API keys
import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const geminiKey = process.env.GEMINI_API_KEY
  const cohereKey = process.env.COHERE_API_KEY
  const results: any = { gemini: {}, cohere: {}, supabase: {} }

  // Test Gemini Embedding
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text: 'test' }] },
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: 768
        })
      }
    )
    const d = await r.json()
    results.gemini.embedding = r.ok
      ? { ok: true, dim: d.embedding?.values?.length }
      : { ok: false, status: r.status, error: d }
  } catch (e: any) {
    results.gemini.embedding = { ok: false, error: e.message }
  }

  // Test Gemini Chat
  try {
    const start = Date.now()
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say hi' }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 20 }
        })
      }
    )
    const d = await r.json()
    results.gemini.chat = r.ok
      ? { ok: true, response: d.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 50), latencyMs: Date.now() - start }
      : { ok: false, status: r.status, error: d }
  } catch (e: any) {
    results.gemini.chat = { ok: false, error: e.message }
  }

  // Test Cohere Embedding
  if (cohereKey) {
    try {
      const r = await fetch('https://api.cohere.com/v1/embed', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cohereKey}`,
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify({
          texts: ['test'],
          model: 'embed-english-v3.0',
          input_type: 'search_document'
        })
      })
      const d = await r.json()
      results.cohere.embedding = r.ok
        ? { ok: true, dim: d.embeddings?.[0]?.length }
        : { ok: false, status: r.status, error: d }
    } catch (e: any) {
      results.cohere.embedding = { ok: false, error: e.message }
    }

    // Test Cohere Chat (v2 API with command-a)
    try {
      const start = Date.now()
      const r = await fetch('https://api.cohere.com/v2/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cohereKey}`,
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify({
          model: 'command-a-03-2025',
          messages: [{ role: 'user', content: 'Say hi' }],
          temperature: 0.1,
          max_tokens: 20
        })
      })
      const d = await r.json()
      results.cohere.chat = r.ok
        ? { ok: true, model: 'command-a-03-2025', response: d.message?.content?.[0]?.text?.slice(0, 50), latencyMs: Date.now() - start }
        : { ok: false, status: r.status, error: d }
    } catch (e: any) {
      results.cohere.chat = { ok: false, error: e.message }
    }
  } else {
    results.cohere = { error: 'COHERE_API_KEY not set' }
  }

  // Test Groq
  const groqKey = process.env.GROQ_API_KEY
  if (groqKey) {
    try {
      const start = Date.now()
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Say hi' }],
          temperature: 0.1,
          max_tokens: 20
        })
      })
      const d = await r.json()
      results.groq = r.ok
        ? { ok: true, model: 'llama-3.3-70b-versatile', response: d.choices?.[0]?.message?.content?.slice(0, 50), latencyMs: Date.now() - start }
        : { ok: false, status: r.status, error: d }
    } catch (e: any) {
      results.groq = { ok: false, error: e.message }
    }
  } else {
    results.groq = { error: 'GROQ_API_KEY not set — get free key at console.groq.com' }
  }

  const openaiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY
  if (openaiKey) {
    try {
      const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: 'test' }),
      })
      const d = await r.json()
      results.openai = results.openai || {}
      results.openai.embedding = r.ok
        ? { ok: true, dim: d.data?.[0]?.embedding?.length }
        : { ok: false, status: r.status, error: d }
    } catch (e: any) {
      results.openai = { embedding: { ok: false, error: e.message } }
    }

    try {
      const start = Date.now()
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say hi' }],
          max_tokens: 20,
        }),
      })
      const d = await r.json()
      results.openai.chat = r.ok
        ? { ok: true, response: d.choices?.[0]?.message?.content?.slice(0, 50), latencyMs: Date.now() - start }
        : { ok: false, status: r.status, error: d }
    } catch (e: any) {
      results.openai = { ...results.openai, chat: { ok: false, error: e.message } }
    }
  } else {
    results.openai = { error: 'OPENAI_API_KEY not set' }
  }

  // Test Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (supabaseUrl && supabaseKey) {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
    
    // Check tables exist
    try {
      const { data: projects, error: pErr } = await supabase.from('nods_project').select('id').limit(1)
      results.supabase.projects = pErr ? { ok: false, error: pErr.message } : { ok: true, count: projects?.length }
    } catch (e: any) {
      results.supabase.projects = { ok: false, error: e.message }
    }

    try {
      const { data: pages, error: pgErr } = await supabase.from('nods_page').select('id').limit(1)
      results.supabase.pages = pgErr ? { ok: false, error: pgErr.message } : { ok: true, count: pages?.length }
    } catch (e: any) {
      results.supabase.pages = { ok: false, error: e.message }
    }

    let detectedDimension = 768
    try {
      const { data: sections, error: sErr } = await supabase
        .from('nods_page_section')
        .select('id, embedding')
        .not('embedding', 'is', null)
        .limit(1)
      
      results.supabase.sections = sErr ? { ok: false, error: sErr.message } : { ok: true, count: sections?.length }
      
      if (sections?.[0]?.embedding) {
        const emb = sections[0].embedding
        if (Array.isArray(emb)) {
          detectedDimension = emb.length
        } else if (typeof emb === 'string') {
          try {
            const parsed = JSON.parse(emb)
            if (Array.isArray(parsed)) detectedDimension = parsed.length
          } catch {
            const match = emb.match(/,/g)
            if (match) detectedDimension = match.length + 1
          }
        }
      }
    } catch (e: any) {
      results.supabase.sections = { ok: false, error: e.message }
    }

    // Check hybrid_search function exists using the correct dynamic dimension
    try {
      const { error: hsErr } = await supabase.rpc('hybrid_search', {
        query_embedding: Array(detectedDimension).fill(0),
        query_text: 'test',
        p_project_id: '00000000-0000-0000-0000-000000000000',
        match_count: 1,
        similarity_threshold: 0.9
      })
      results.supabase.hybrid_search = hsErr 
        ? { ok: false, error: hsErr.message }
        : { ok: true }
    } catch (e: any) {
      results.supabase.hybrid_search = { ok: false, error: e.message }
    }

    // Check schema for embedding column
    try {
      const { data: schemaInfo } = await supabase.rpc('get_schema_info')
      const embCol = schemaInfo?.find((c: any) => c.column_name === 'embedding')
      results.supabase.embedding_column = embCol || 'NOT FOUND'
    } catch {
      results.supabase.embedding_column = 'get_schema_info function missing'
    }
  } else {
    results.supabase = { error: 'Supabase env vars not set' }
  }

  results.envKeys = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    COHERE_API_KEY: !!process.env.COHERE_API_KEY,
    GROQ_API_KEY: !!process.env.GROQ_API_KEY,
    OPENAI_API_KEY: !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY),
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  }

  return res.status(200).json(results)
}
