// VECTORMIND — upload.ts
// Pipeline: Validate → Decode → Extract → Sanitize → Dedup → Chunk → Token Limit → Embed → Insert
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { generateEmbeddingsBatch, EMBEDDING_PROVIDERS, isProviderAvailable, type EmbeddingProviderId } from '../../lib/providers'
import { invalidateWorkspaceCache } from '../../lib/semanticCache'
import { recursiveCharacterChunker } from '../../lib/chunker'
import { withValidation, UploadRequestSchema } from '../../lib/validateRequest'
import { withRateLimit } from '../../lib/rateLimiter'
import { z } from 'zod'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

// ─── Text Sanitization ──────────────────────────────────────────────────────────

function sanitizeText(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .replace(/\x00/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}



// ─── Main Handler ────────────────────────────────────────────────────────────────

async function uploadHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  data: z.infer<typeof UploadRequestSchema>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Method ${req.method} not allowed`, step: 'validation' })
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({ error: 'Supabase not configured', step: 'config' })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const { filename, base64, projectId: bodyProjectId, workspaceId, embeddingProvider: bodyEmbeddingProvider } = data
    const projectId = (bodyProjectId || workspaceId) as string

    // Write headers for NDJSON streaming IMMEDIATELY so the client knows connection is alive
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Content-Encoding': 'none',
    })
    res.flushHeaders()

    const sendStreamEvent = (data: any) => {
      res.write(JSON.stringify(data) + '\n')
      if (typeof (res as any).flush === 'function') {
        (res as any).flush()
      }
    }

    const heartbeatInterval = setInterval(() => {
      sendStreamEvent({ status: 'ping' })
    }, 2000)

    const originalEnd = res.end
    res.end = function (this: any, ...args: any[]) {
      clearInterval(heartbeatInterval)
      return originalEnd.apply(this, args as any)
    } as any

    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase()
    if (!['.pdf', '.md', '.txt', '.json', '.docx', '.csv', '.py', '.ts'].includes(ext)) {
      sendStreamEvent({ status: 'error', error: `Unsupported file: ${ext}`, step: 'validation' })
      return res.end()
    }

    // Get project config
    let embeddingProvider = (bodyEmbeddingProvider || 'cohere') as EmbeddingProviderId
    try {
      const { data: proj } = await supabase.from('nods_project').select('embedding_provider, chat_provider').eq('id', projectId).single()
      if (proj && proj.embedding_provider && !bodyEmbeddingProvider) {
        embeddingProvider = proj.embedding_provider as EmbeddingProviderId
      }
    } catch (e) {
      console.warn('[VectorMind] Safe bypass of project lookup schema error during upload:', e)
    }
    
    // Auto-fallback if selected provider's key is missing
    if (!isProviderAvailable(EMBEDDING_PROVIDERS[embeddingProvider].keyEnv)) {
      const fallback = Object.values(EMBEDDING_PROVIDERS).find(p => isProviderAvailable(p.keyEnv))
      if (!fallback) {
        sendStreamEvent({ status: 'error', error: 'No embedding API key configured', step: 'config' })
        return res.end()
      }
      console.warn(`[VectorMind] ${embeddingProvider} key missing, falling back to ${fallback.id}`)
      embeddingProvider = fallback.id
    }

    // Decode base64
    let buffer: Buffer
    try { buffer = Buffer.from(base64, 'base64') }
    catch (e: any) { 
      sendStreamEvent({ status: 'error', error: `Decode failed: ${e.message}`, step: 'decode' })
      return res.end()
    }

    if (buffer.length > 50 * 1024 * 1024) {
      sendStreamEvent({ status: 'error', error: `File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB max 50MB`, step: 'validation' })
      return res.end()
    }

    // Extract text
    sendStreamEvent({ status: 'info', message: 'Parsing document content...' })
    let rawText = ''
    if (ext === '.pdf') {
      try {
        const { extractText, getDocumentProxy } = await import('unpdf')
        const pdf = await getDocumentProxy(new Uint8Array(buffer))
        const { text } = await extractText(pdf, { mergePages: true })
        rawText = text
      } catch (e: any) {
        sendStreamEvent({ status: 'error', error: `PDF parse failed: ${e.message}`, step: 'pdf_parse' })
        return res.end()
      }
    } else if (ext === '.docx') {
      try {
        // Write the DOCX buffer to a temporary file in the OS temp directory (required for Vercel serverless)
        const tempPath = path.join(os.tmpdir(), `temp_${Date.now()}.docx`)
        fs.writeFileSync(tempPath, buffer)
        
        // Extract word/document.xml content
        const xml = await new Promise<string>((resolve, reject) => {
          // Fallback mechanism: First try system 'unzip', then try system 'python3'
          execFile('unzip', ['-p', tempPath, 'word/document.xml'], (err, stdout) => {
            if (!err) {
              resolve(stdout)
            } else {
              // Python3 fallback
              const pythonCmd = `import zipfile; print(zipfile.ZipFile("${tempPath}").read("word/document.xml").decode("utf-8"))`
              execFile('python3', ['-c', pythonCmd], (pErr, pStdout) => {
                if (!pErr) {
                  resolve(pStdout)
                } else {
                  reject(new Error(`Extraction failed. 'unzip' and 'python3' are not available: ${pErr.message}`))
                }
              })
            }
          })
        })
        
        // Clean up temp file
        try { fs.unlinkSync(tempPath) } catch {}
        
        // Parse the DOCX XML structure to retrieve paragraphs
        const paragraphMatches = xml.match(/<w:p[^>]*>.*?<\/w:p>/g)
        if (!paragraphMatches) {
          const tMatches = xml.match(/<w:t[^>]*>(.*?)<\/w:t>/g)
          if (!tMatches) throw new Error('No text runs found in document.xml')
          rawText = tMatches.map(m => m.replace(/<w:t[^>]*>|<\/w:t>/g, '')).join(' ')
        } else {
          rawText = paragraphMatches
            .map(pXml => {
              const tMatches = pXml.match(/<w:t[^>]*>(.*?)<\/w:t>/g)
              if (!tMatches) return ''
              return tMatches
                .map(m => m.replace(/<w:t[^>]*>|<\/w:t>/g, ''))
                .join('')
            })
            .filter(pText => pText.trim().length > 0)
            .map(pText => {
              return pText
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
            })
            .join('\n\n')
        }
      } catch (e: any) {
        sendStreamEvent({ status: 'error', error: `.docx extraction failed: ${e.message}`, step: 'docx_parse' })
        return res.end()
      }
    } else {
      rawText = buffer.toString('utf-8')
    }
    if (!rawText.trim()) {
      sendStreamEvent({ status: 'error', error: 'No extractable text found in document', step: 'extraction' })
      return res.end()
    }

    const sanitizedText = sanitizeText(rawText)

    // Storage upload
    sendStreamEvent({ status: 'info', message: 'Backing up to storage...' })
    let storageUrl = null, storagePath = null
    try {
      const uploadPromise = supabase.storage.from('documents')
        .upload(`${projectId}/${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`, buffer, {
          contentType: ext === '.pdf' 
            ? 'application/pdf' 
            : ext === '.docx' 
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
              : 'text/plain', 
          upsert: true
        })

      // 60 second timeout for storage upload so it doesn't block ingestion
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Storage upload timed out after 60s')), 60000))
      
      const result = await Promise.race([uploadPromise, timeoutPromise]) as any
      const sd = result?.data
      const se = result?.error

      if (!se && sd) {
        storagePath = sd.path
        storageUrl = supabase.storage.from('documents').getPublicUrl(storagePath).data.publicUrl
      }
    } catch (e: any) { 
      console.warn('[VectorMind] Storage upload skipped/failed:', e.message) 
    }

    // Dedup
    sendStreamEvent({ status: 'info', message: 'Checking database for duplicates...' })
    const checksum = crypto.createHash('sha256').update(sanitizedText).digest('hex')
    
    let existing = null
    try {
      // 1. Resolve naming collisions and self-heal corrupted/stuck ingestions
      const nameCheck = await supabase.from('nods_page').select('id, checksum, project_id').eq('path', filename).maybeSingle()
      if (nameCheck.data) {
        if (nameCheck.data.checksum === checksum && nameCheck.data.project_id === projectId) {
          existing = nameCheck.data
        } else {
          // Filename exists but content/project changed. Manually cascade delete sections first!
          const { error: secDelErr } = await supabase.from('nods_page_section').delete().eq('page_id', nameCheck.data.id)
          if (secDelErr) console.error('[VectorMind] Section manual cascade delete error:', secDelErr)

          const { error: pageDelErr } = await supabase.from('nods_page').delete().eq('id', nameCheck.data.id)
          if (pageDelErr) {
            throw new Error(`Failed to delete old ghost file: ${pageDelErr.message}`)
          }
        }
      }

      // 2. Check if identical content exists under a different filename
      if (!existing) {
        const checksumCheck = await supabase.from('nods_page').select('id').eq('checksum', checksum).eq('project_id', projectId).maybeSingle()
        if (checksumCheck.data) {
          existing = checksumCheck.data
        }
      }
    } catch (e: any) {
      sendStreamEvent({ status: 'error', error: `Database Check Failed: ${e.message}`, step: 'deduplication' })
      return res.end()
    }

    if (existing) {
      sendStreamEvent({ status: 'info', message: 'Document already exists, skipping...' })
      sendStreamEvent({ status: 'success', success: true, chunksIndexed: 0, filename, skipped: true })
      return res.end()
    }

    // Chunk
    sendStreamEvent({ status: 'info', message: 'Splitting into semantic chunks...' })
    await new Promise(resolve => setTimeout(resolve, 10)) // Yield event loop to flush stream to client
    let chunkerResults = recursiveCharacterChunker(sanitizedText, 400, 80)
    let chunks = chunkerResults.map(c => c.content)
    console.log(`[VectorMind] "${filename}": ${chunks.length} chunks via ${embeddingProvider}`)

    sendStreamEvent({ status: 'started', chunksTotal: chunks.length })

    // Embed all chunks using high-performance batching
    let embeddings: number[][] = []
    const failedChunks: number[] = []
    try {
      const embedPromise = generateEmbeddingsBatch(chunks, embeddingProvider, 'document')
      const embedTimeout = new Promise<number[][]>((_, reject) => setTimeout(() => reject(new Error('Embedding API timed out after 60 seconds')), 60000))
      embeddings = await Promise.race([embedPromise, embedTimeout])
      
      let actualProvider = embeddingProvider
      const firstDim = embeddings[0]?.length || 0
      if (embeddingProvider === 'gemini' && firstDim === 1024) {
        actualProvider = 'cohere'
        sendStreamEvent({
          status: 'warning',
          message: `Gemini failed, falling back to Cohere`
        })
      }

      // Stream all chunk events to keep the UI's gorgeous progress bar updating beautifully!
      for (let i = 0; i < chunks.length; i++) {
        sendStreamEvent({
          status: 'chunk',
          chunkIndex: i,
          total: chunks.length,
          provider: actualProvider,
          dim: firstDim
        })
      }
      console.log(`[VectorMind] Successfully batch embedded ${chunks.length} chunks via ${actualProvider}`)
    } catch (e: any) {
      console.error(`[VectorMind] Batch embedding failed:`, e.message)
      sendStreamEvent({ status: 'error', error: `Embedding failed: ${e.message}` })
      res.end()
      return
    }



    // Insert page
    let page: any = null
    let pageError: any = null
    try {
      const insertPromise = supabase.from('nods_page')
        .insert({ project_id: projectId, path: filename, checksum, meta: { filename, size: sanitizedText.length, storageUrl, storagePath } })
        .select().single()
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Page insert timed out (60s limit)')), 60000))
      
      const result = await Promise.race([insertPromise, timeoutPromise]) as any
      page = result?.data
      pageError = result?.error
    } catch (e: any) {
      pageError = e
    }

    if (pageError || !page) {
      console.error(`[VectorMind] Page insert failed:`, pageError || 'No page returned')
      sendStreamEvent({ status: 'error', error: `Page insert: ${pageError?.message || pageError || 'Failed'}` })
      res.end()
      return
    }

    // Insert sections in a single high-performance batch query
    let chunksIndexed = 0
    const insertErrors: string[] = []
    
    const sectionsToInsert = chunks
      .map((_, i) => {
        if (failedChunks.includes(i) || embeddings[i].length === 0) return null
        return {
          page_id: page.id,
          content: chunkerResults[i].content,
          embedding: embeddings[i],
          token_count: chunkerResults[i].tokenCount,
          heading_context: chunkerResults[i].metadata.heading || 'Document Section',
          chunk_level: 1
        }
      })
      .filter((item): item is NonNullable<typeof item> => !!item)

    if (sectionsToInsert.length > 0) {
      try {
        const insertPromise = supabase.from('nods_page_section').insert(sectionsToInsert)
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Batch section insert timed out (60s limit)')), 60000))
        
        const result = await Promise.race([insertPromise, timeoutPromise]) as any
        if (result && result.error) {
          throw new Error(result.error.message)
        }
        chunksIndexed = sectionsToInsert.length
      } catch (e: any) {
        console.error('[VectorMind] Batch section insert failed:', e.message)
        insertErrors.push(e.message)
        // Clean up the page since section insert failed
        await supabase.from('nods_page').delete().eq('id', page.id)
        sendStreamEvent({ status: 'error', error: `Section insertion failed: ${e.message}`, step: 'section_insert' })
        res.end()
        return
      }
    }

    if (chunksIndexed === 0 && chunks.length > 0) {
      sendStreamEvent({ status: 'error', error: `Insert failed: ${insertErrors[0] || 'Unknown'}` })
      res.end()
      return
    }

    if (chunksIndexed > 0) {
      await invalidateWorkspaceCache(projectId)
    }

    sendStreamEvent({
      status: 'success',
      success: true,
      chunksIndexed,
      filename,
      embeddingProvider,
      embeddingDim: embeddings[0]?.length || 0,
      ...(insertErrors.length > 0 ? { partialErrors: insertErrors } : {}),
      ...(failedChunks.length > 0 ? { failedEmbeddings: failedChunks.length } : {}),
    })
    res.end()
  } catch (err: any) {
    console.error('[VectorMind] Upload error:', err)
    try {
      res.write(JSON.stringify({ status: 'error', error: err.message || 'Upload failed' }) + '\n')
      res.end()
    } catch {}
  }
}

export default withRateLimit('upload', withValidation(UploadRequestSchema, uploadHandler))

export const config = { api: { bodyParser: { sizeLimit: '50mb' } } }
