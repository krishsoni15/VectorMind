import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'

// Use the legacy pdfjs build which does NOT require browser DOM APIs (DOMMatrix etc.)
// The standard pdfjs-dist build crashes on Vercel/Node because it needs DOMMatrix
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

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

  // Set up SSE headers for real-time progress streaming
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const sendProgress = (step: string, progress: number, detail?: string) => {
    const data = JSON.stringify({ step, progress, detail })
    res.write(`data: ${data}\n\n`)
  }

  const sendResult = (success: boolean, data: any) => {
    res.write(`data: ${JSON.stringify({ done: true, success, ...data })}\n\n`)
    res.end()
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

  try {
    sendProgress('Decoding file', 5)
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
      sendProgress('Parsing PDF', 10, `Extracting text from ${filename}`)
      try {
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
        const pdfDoc = await loadingTask.promise
        const pageTexts: string[] = []
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          sendProgress('Parsing PDF', 10 + Math.round((i / pdfDoc.numPages) * 15), `Page ${i} of ${pdfDoc.numPages}`)
          const page = await pdfDoc.getPage(i)
          const tokenizedText = await page.getTextContent()
          const pageText = tokenizedText.items
            // @ts-ignore
            .map((item: any) => item.str)
            .join(' ')
          pageTexts.push(pageText)
        }
        content = pageTexts.join('\n\n')
        await pdfDoc.destroy()
      } catch (err: any) {
        throw new Error(`Failed to parse PDF file: ${err.message}`)
      }
    } else {
      sendProgress('Reading file', 15, `Decoding ${filename}`)
      content = buffer.toString('utf-8')
    }

    // Sanitize null bytes (\u0000) and escaped null strings to prevent database errors
    const sanitizedContent = content.replace(/\u0000/g, '').replace(/\\u0000/g, '')

    sendProgress('Chunking text', 30, `Splitting into sections...`)
    const checksum = createHash('sha256').update(sanitizedContent).digest('hex')
    const documentPath = `uploaded/${filename}`

    // 1. Delete existing page record if it already exists (cascades to page sections)
    await supabaseClient
      .from('nods_page')
      .delete()
      .eq('path', documentPath)

    sendProgress('Creating record', 35, 'Saving document metadata')

    // 2. Insert parent page row
    const { data: page, error: pageError } = await supabaseClient
      .from('nods_page')
      .insert({
        path: documentPath,
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
    sendProgress('Chunking text', 40, `Created ${chunks.length} chunks`)

    // Helper: embed a single chunk with retry + exponential backoff for 429 rate limits
    const embedWithRetry = async (text: string, chunkIndex: number, maxRetries = 3): Promise<number[]> => {
      const sanitizedChunk = text.replace(/\n/g, ' ')
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'models/gemini-embedding-2',
              content: { parts: [{ text: sanitizedChunk }] },
              taskType: 'RETRIEVAL_DOCUMENT',
              outputDimensionality: 768,
            }),
          }
        )

        if (response.status === 429 && attempt < maxRetries) {
          // Parse retry delay from response, default to exponential backoff
          let waitMs = (attempt + 1) * 15000 // 15s, 30s, 45s
          try {
            const errBody = await response.json()
            const retryDelay = errBody?.error?.details?.find((d: any) => d.retryDelay)?.retryDelay
            if (retryDelay) {
              const seconds = parseInt(retryDelay, 10)
              if (!isNaN(seconds)) waitMs = (seconds + 2) * 1000
            }
          } catch {}
          sendProgress('Rate limited', 40 + Math.round((chunkIndex / chunks.length) * 50),
            `API rate limit hit — waiting ${Math.ceil(waitMs / 1000)}s before retrying chunk ${chunkIndex + 1}`)
          await new Promise(r => setTimeout(r, waitMs))
          continue
        }

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Embedding API error for chunk ${chunkIndex + 1}: ${response.status} - ${errorText}`)
        }

        const data = await response.json()
        const embedding = data.embedding?.values
        if (!embedding) {
          throw new Error(`No embedding returned for chunk ${chunkIndex + 1}`)
        }
        return embedding
      }
      throw new Error(`Embedding failed for chunk ${chunkIndex + 1} after ${maxRetries} retries`)
    }

    // Process embeddings in small batches of 5 with a delay between batches
    // to stay under the Gemini free-tier limit of 100 requests/minute
    const batchSize = 5
    const interBatchDelayMs = 1500
    const sectionsToInsert: any[] = []

    for (let i = 0; i < chunks.length; i += batchSize) {
      const currentBatch = chunks.slice(i, i + batchSize)
      const batchEnd = Math.min(i + batchSize, chunks.length)
      const embeddingProgress = 40 + Math.round((i / chunks.length) * 50)
      sendProgress('Embedding', embeddingProgress, `Vectorizing chunks ${i + 1}–${batchEnd} of ${chunks.length}`)

      const batchResults = await Promise.all(
        currentBatch.map(async (chunk, batchIndex) => {
          const globalIndex = i + batchIndex
          const embedding = await embedWithRetry(chunk, globalIndex)
          const tokenCount = Math.ceil(chunk.length / 4)
          return {
            page_id: page.id,
            slug: `section-${globalIndex + 1}`,
            heading: `Section ${globalIndex + 1}`,
            content: chunk,
            token_count: tokenCount,
            embedding,
          }
        })
      )

      sectionsToInsert.push(...batchResults)

      // Pause between batches to stay under 100 req/min
      if (i + batchSize < chunks.length) {
        await new Promise(r => setTimeout(r, interBatchDelayMs))
      }
    }

    // Bulk-insert all sections in one call
    sendProgress('Finalizing', 90, 'Saving embeddings to database')
    const { error: sectionError } = await supabaseClient
      .from('nods_page_section')
      .insert(sectionsToInsert)

    if (sectionError) {
      throw new Error(`Failed to insert sections to database: ${sectionError.message}`)
    }

    // 5. Update checksum upon successful completion
    sendProgress('Finalizing', 95, 'Updating search index')
    const { error: updateError } = await supabaseClient
      .from('nods_page')
      .update({ checksum })
      .eq('id', page.id)

    if (updateError) {
      throw updateError
    }

    sendResult(true, {
      filename,
      chunks: chunks.length,
    })
  } catch (err: any) {
    console.error('Error during file upload indexing:', err)
    sendResult(false, { error: err.message || 'An error occurred during indexing' })
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
}

