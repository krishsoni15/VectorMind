import type { NextApiRequest, NextApiResponse } from 'next'
import fs from 'fs'
import path from 'path'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const openaiKey = process.env.OPENAI_API_KEY
  const diagPath = path.join(process.cwd(), 'scratch/openai_diag.json')
  
  const results: any = {
    hasKey: !!openaiKey,
    keyLength: openaiKey ? openaiKey.length : 0,
    keyPrefix: openaiKey ? openaiKey.substring(0, 10) : '',
    embedding: null,
    chat: null
  }
  
  if (openaiKey) {
    // Test Embedding
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
      results.embedding = {
        ok: r.ok,
        status: r.status,
        body: d
      }
    } catch (e: any) {
      results.embedding = { ok: false, error: e.message }
    }

    // Test Chat
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'Say hi' }],
          max_tokens: 10,
        }),
      })
      const d = await r.json()
      results.chat = {
        ok: r.ok,
        status: r.status,
        body: d
      }
    } catch (e: any) {
      results.chat = { ok: false, error: e.message }
    }
  }
  
  // Write to scratch
  try {
    fs.mkdirSync(path.dirname(diagPath), { recursive: true })
    fs.writeFileSync(diagPath, JSON.stringify(results, null, 2))
  } catch (e: any) {
    console.error('Failed to write diag file:', e)
  }
  
  return res.status(200).json(results)
}
