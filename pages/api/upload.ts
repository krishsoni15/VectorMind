// VECTORMIND — upload.ts
// Pipeline: Validate → Decode → Extract → Sanitize → Dedup → Chunk → Token Limit → Embed → Insert
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import GPT3Tokenizer from 'gpt3-tokenizer'
import { generateEmbeddingsBatch, EMBEDDING_PROVIDERS, isProviderAvailable, type EmbeddingProviderId } from '../../lib/providers'

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

// ─── Hierarchical Chunking ──────────────────────────────────────────────────────

function hierarchicalChunk(text: string): string[] {
  const headingParts = text.split(/^#{1,3}\s/m)
  if (headingParts.length >= 2) {
    const filtered = headingParts.map(p => p.trim()).filter(p => p.length > 0)
    const valid = filtered.every(c => c.length >= 150 && c.length <= 2500)
    if (valid && filtered.length >= 2) return filtered
  }
  const paragraphs = text.split('\n\n').map(p => p.trim()).filter(p => p.length > 0)
  if (paragraphs.length >= 2) {
    const merged: string[] = []
    let current = ''
    for (const para of paragraphs) {
      if (current.length + para.length + 2 > 2500 && current.length > 0) {
        merged.push(current.trim())
        current = para
      } else {
        current += (current ? '\n\n' : '') + para
      }
    }
    if (current.trim()) merged.push(current.trim())
    const valid = merged.every(c => c.length >= 150 && c.length <= 2500)
    if (valid && merged.length >= 2) return merged
  }
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0)
  if (sentences.length >= 2) {
    const chunks: string[] = []
    let current = ''
    for (const s of sentences) {
      if (current.length + s.length + 1 > 800 && current.length > 0) {
        chunks.push(current.trim())
        current = s
      } else {
        current += (current ? ' ' : '') + s
      }
    }
    if (current.trim()) chunks.push(current.trim())
    const valid = chunks.every(c => c.length >= 150 && c.length <= 2500)
    if (valid && chunks.length >= 2) return chunks
  }
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    const end = Math.min(i + 1000, text.length)
    const chunk = text.slice(i, end).trim()
    if (chunk) chunks.push(chunk)
    if (end >= text.length) break
    i += 800
  }
  return chunks.length > 0 ? chunks : [text]
}

// ─── Token Enforcement ──────────────────────────────────────────────────────────

function enforceTokenLimit(chunks: string[], maxTokens = 800): string[] {
  const tokenizer = new GPT3Tokenizer({ type: 'gpt3' })
  return chunks.flatMap(chunk => {
    const tokens = tokenizer.encode(chunk)
    if (tokens.bpe.length <= maxTokens) return [chunk]
    const sentences = chunk.match(/[^.!?]+[.!?]+/g) || [chunk]
    const sub: string[] = []
    let current = ''
    for (const s of sentences) {
      const testTokens = tokenizer.encode(current + s)
      if (testTokens.bpe.length > maxTokens) {
        if (current) sub.push(current.trim())
        current = s
      } else {
        current += ' ' + s
      }
    }
    if (current.trim()) sub.push(current.trim())
    return sub.length ? sub : [chunk.slice(0, 3000)]
  })
}

function findNearestHeading(fullText: string, chunk: string): string {
  const chunkStart = fullText.indexOf(chunk.substring(0, 50))
  if (chunkStart === -1) return 'Document Section'
  const textBefore = fullText.substring(0, chunkStart)
  const headingRegex = /^#{1,3}\s+(.+)$/gm
  let lastHeading = ''
  let match
  while ((match = headingRegex.exec(textBefore)) !== null) {
    lastHeading = match[1].trim()
  }
  return lastHeading || 'Document Section'
}

function determineChunkLevel(text: string): number {
  const headingParts = text.split(/^#{1,3}\s/m).filter(p => p.trim().length > 0)
  if (headingParts.length >= 2 && headingParts.every(c => c.trim().length >= 150 && c.trim().length <= 2500)) return 1
  const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0)
  if (paragraphs.length >= 2) return 2
  const sentences = text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0)
  if (sentences.length >= 2) return 3
  return 4
}

// ─── Main Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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
    const { filename, base64, projectId, embeddingProvider: bodyEmbeddingProvider } = req.body

    if (!projectId || typeof projectId !== 'string') return res.status(400).json({ error: 'Project ID required', step: 'validation' })
    if (!filename || typeof filename !== 'string') return res.status(400).json({ error: 'Filename required', step: 'validation' })
    if (!base64 || typeof base64 !== 'string') return res.status(400).json({ error: 'Base64 data required', step: 'validation' })

    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase()
    if (!['.pdf', '.md', '.txt', '.json', '.docx'].includes(ext)) {
      return res.status(400).json({ error: `Unsupported file: ${ext}`, step: 'validation' })
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
      if (!fallback) return res.status(500).json({ error: 'No embedding API key configured', step: 'config' })
      console.warn(`[VectorMind] ${embeddingProvider} key missing, falling back to ${fallback.id}`)
      embeddingProvider = fallback.id
    }

    // Decode base64
    let buffer: Buffer
    try { buffer = Buffer.from(base64, 'base64') }
    catch (e: any) { return res.status(400).json({ error: `Decode failed: ${e.message}`, step: 'decode' }) }

    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: `File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB max 10MB`, step: 'validation' })
    }

    // Extract text
    let rawText = ''
    if (ext === '.pdf') {
      try {
        const { extractText, getDocumentProxy } = await import('unpdf')
        const pdf = await getDocumentProxy(new Uint8Array(buffer))
        const { text } = await extractText(pdf, { mergePages: true })
        rawText = text
      } catch (e: any) {
        return res.status(400).json({ error: `PDF parse failed: ${e.message}`, step: 'pdf_parse' })
      }
    } else if (ext === '.docx') {
      try {
        // Write the DOCX buffer to a temporary file in the scratch directory
        const scratchDir = path.join(process.cwd(), 'scratch')
        if (!fs.existsSync(scratchDir)) {
          fs.mkdirSync(scratchDir, { recursive: true })
        }
        const tempPath = path.join(scratchDir, `temp_${Date.now()}.docx`)
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
        return res.status(400).json({ error: `.docx extraction failed: ${e.message}`, step: 'docx_parse' })
      }
    } else {
      rawText = buffer.toString('utf-8')
    }
    if (!rawText.trim()) return res.status(400).json({ error: 'No extractable text', step: 'extraction' })

    const sanitizedText = sanitizeText(rawText)

    // Storage upload
    let storageUrl = null, storagePath = null
    try {
      const { data: sd, error: se } = await supabase.storage.from('documents')
        .upload(`${projectId}/${Date.now()}_${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}`, buffer, {
          contentType: ext === '.pdf' 
            ? 'application/pdf' 
            : ext === '.docx' 
              ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
              : 'text/plain', 
          upsert: true
        })
      if (!se && sd) {
        storagePath = sd.path
        storageUrl = supabase.storage.from('documents').getPublicUrl(storagePath).data.publicUrl
      }
    } catch (e) { console.warn('[VectorMind] Storage:', e) }

    // Dedup
    const checksum = crypto.createHash('sha256').update(sanitizedText).digest('hex')
    const { data: existing } = await supabase.from('nods_page').select('id').eq('checksum', checksum).eq('project_id', projectId).single()
    if (existing) return res.status(200).json({ message: 'Already indexed', skipped: true })

    // Chunk
    let chunks = hierarchicalChunk(sanitizedText)
    const chunkLevel = determineChunkLevel(sanitizedText)
    chunks = enforceTokenLimit(chunks)
    console.log(`[VectorMind] "${filename}": ${chunks.length} chunks (L${chunkLevel}) via ${embeddingProvider}`)

    // Write headers for NDJSON streaming
    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    })

    const sendStreamEvent = (data: any) => {
      res.write(JSON.stringify(data) + '\n')
    }

    sendStreamEvent({ status: 'started', chunksTotal: chunks.length })

    // Embed all chunks using high-performance batching
    let embeddings: number[][] = []
    const failedChunks: number[] = []
    try {
      embeddings = await generateEmbeddingsBatch(chunks, embeddingProvider, 'document')
      
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
    const { data: page, error: pageError } = await supabase.from('nods_page')
      .insert({ project_id: projectId, path: filename, checksum, meta: { filename, size: sanitizedText.length, storageUrl, storagePath } })
      .select().single()
    if (pageError || !page) {
      sendStreamEvent({ status: 'error', error: `Page insert: ${pageError?.message || 'Failed'}` })
      res.end()
      return
    }

    // Insert sections
    let chunksIndexed = 0
    const insertErrors: string[] = []
    for (let i = 0; i < chunks.length; i++) {
      if (failedChunks.includes(i) || embeddings[i].length === 0) continue
      const { error: secErr } = await supabase.from('nods_page_section').insert({
        page_id: page.id, content: chunks[i], embedding: embeddings[i],
        heading_context: findNearestHeading(sanitizedText, chunks[i]), chunk_level: chunkLevel
      })
      if (secErr) { insertErrors.push(`chunk ${i}: ${secErr.message}`) } else { chunksIndexed++ }
    }

    if (chunksIndexed === 0 && chunks.length > 0) {
      sendStreamEvent({ status: 'error', error: `Insert failed: ${insertErrors[0] || 'Unknown'}` })
      res.end()
      return
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

export const config = { api: { bodyParser: { sizeLimit: '50mb' } } }
