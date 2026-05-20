import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
// @ts-ignore
import { PDFParse } from 'pdf-parse'

const geminiKey = process.env.GEMINI_API_KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function chunkText(text: string, chunkSize = 1000, overlap = 200): string[] {
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    let end = Math.min(i + chunkSize, text.length)
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end)
      if (lastSpace > i + chunkSize - overlap) {
        end = lastSpace
      }
    }
    const chunk = text.slice(i, end).trim()
    if (chunk) {
      chunks.push(chunk)
    }
    i = end - overlap
    if (i < 0) i = 0
    if (end >= text.length) break
  }
  return chunks
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  }

  if (!geminiKey || !supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'System credentials are not fully configured' })
  }

  const { filename, base64 } = req.body

  if (!filename || !base64) {
    return res.status(400).json({ error: 'Filename and base64 data are required' })
  }

  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      transport: class {},
    },
  })

  try {
    const buffer = Buffer.from(base64, 'base64')

    // Preserve copy of the uploaded file locally for PDF browser previews
    try {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads')
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true })
      }
      fs.writeFileSync(path.join(uploadsDir, filename), buffer)
    } catch (err) {
      console.error('Failed to save local file copy:', err)
    }

    let content = ''

    if (filename.toLowerCase().endsWith('.pdf')) {
      try {
        const parser = new PDFParse({ data: new Uint8Array(buffer) })
        const result = await parser.getText()
        content = result.text || ''
        await parser.destroy()
      } catch (err: any) {
        throw new Error(`Failed to parse PDF file: ${err.message}`)
      }
    } else {
      content = buffer.toString('utf-8')
    }

    // Sanitize null bytes (\u0000) and escaped null strings to prevent database errors
    const sanitizedContent = content.replace(/\u0000/g, '').replace(/\\u0000/g, '')

    const checksum = createHash('sha256').update(sanitizedContent).digest('hex')
    const path = `uploaded/${filename}`

    // 1. Delete existing page record if it already exists (cascades to page sections)
    await supabaseClient
      .from('nods_page')
      .delete()
      .eq('path', path)

    // 2. Insert parent page row
    const { data: page, error: pageError } = await supabaseClient
      .from('nods_page')
      .insert({
        path,
        type: 'uploaded',
        source: 'web_upload',
        meta: {
          filename,
          size: buffer.length,
          uploadedAt: new Date().toISOString(),
        },
        checksum: null, // Clear checksum until complete
      })
      .select()
      .single()

    if (pageError || !page) {
      throw new Error(`Failed to create page record: ${pageError?.message || 'Unknown error'}`)
    }

    // 3. Chunk text content
    const chunks = chunkText(sanitizedContent, 1000, 200)

    // 4. Generate embeddings and insert sections
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]
      const sanitizedChunk = chunk.replace(/\n/g, ' ')

      // Call Gemini Embedding API
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'models/gemini-embedding-2',
            content: {
              parts: [{ text: sanitizedChunk }],
            },
            taskType: 'RETRIEVAL_DOCUMENT',
            outputDimensionality: 768,
          }),
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gemini API error during embedding generation: ${response.status} - ${errorText}`)
      }

      const responseData = await response.json()
      const embedding = responseData.embedding?.values

      if (!embedding) {
        throw new Error('Failed to retrieve embedding values from Gemini API response')
      }

      const tokenCount = Math.ceil(chunk.length / 4)

      const { error: sectionError } = await supabaseClient
        .from('nods_page_section')
        .insert({
          page_id: page.id,
          slug: `section-${index + 1}`,
          heading: `Section ${index + 1}`,
          content: chunk,
          token_count: tokenCount,
          embedding,
        })

      if (sectionError) {
        throw new Error(`Failed to insert section ${index + 1}: ${sectionError.message}`)
      }
    }

    // 5. Update checksum upon successful completion
    const { error: updateError } = await supabaseClient
      .from('nods_page')
      .update({ checksum })
      .eq('id', page.id)

    if (updateError) {
      throw updateError
    }

    return res.status(200).json({
      success: true,
      filename,
      chunks: chunks.length,
    })
  } catch (err: any) {
    console.error('Error during file upload indexing:', err)
    return res.status(500).json({ error: err.message || 'An error occurred during indexing' })
  }
}
