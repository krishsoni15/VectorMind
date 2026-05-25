import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { filename } = req.query

  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  
  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: 'Missing filename' })
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Attempt to download the file directly
  let { data, error } = await supabase.storage
    .from('documents')
    .download(filename)

  // Fallback: If not found, maybe it's in a folder with the active project ID?
  // We don't have the projectId here, so we just return a 404 with proper headers
  if (error || !data) {
    res.setHeader('Content-Type', 'text/html')
    return res.status(404).send(`
      <div style="font-family: sans-serif; padding: 2rem; text-align: center; color: #888;">
        <h2>File not found</h2>
        <p>The document could not be located in storage.</p>
        <p style="font-size: 0.8em; color: #aaa;">Error: ${error?.message || 'Unknown'}</p>
      </div>
    `)
  }

  // Convert Blob to Buffer and stream it back
  const arrayBuffer = await data.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Set appropriate content type
  const ext = filename.toLowerCase().split('.').pop()
  const contentTypes: Record<string, string> = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    csv: 'text/csv',
    html: 'text/html',
    xml: 'application/xml',
  }

  res.setHeader('Content-Type', contentTypes[ext || ''] || 'application/octet-stream')
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
  res.setHeader('Cache-Control', 'public, max-age=3600')
  return res.status(200).send(buffer)
}
