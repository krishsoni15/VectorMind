// VECTORMIND — vector-search.ts
// Pipeline: HyDE → Embed → Hybrid Search → RRF → MMR → Confidence → Pack → Stream
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import GPT3Tokenizer from 'gpt3-tokenizer'
import {
  generateEmbedding, generateEmbeddingsBatch, expandQueryHyDE, streamChatResponse,
  EMBEDDING_PROVIDERS, CHAT_PROVIDERS, isProviderAvailable,
  type EmbeddingProviderId, type ChatProviderId
} from '../../lib/providers'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

// ─── RRF Fusion ─────────────────────────────────────────────────────────────────

function rrfFusion(resultLists: any[][]): any[] {
  const scores = new Map<string, { score: number; item: any }>()
  for (const list of resultLists) {
    list.forEach((item: any, rank: number) => {
      const key = String(item.id)
      const existing = scores.get(key) || { score: 0, item }
      existing.score += 1 / (60 + rank)
      scores.set(key, existing)
    })
  }
  return Array.from(scores.values()).sort((a, b) => b.score - a.score).map(v => v.item)
}

// ─── MMR ─────────────────────────────────────────────────────────────────────────

function mmrFilter(items: any[], lambda = 0.7, k = 20): any[] {
  if (items.length === 0) return []
  const selected: any[] = [items[0]]
  const remaining = items.slice(1)
  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0, bestScore = -Infinity
    remaining.forEach((item: any, i: number) => {
      const relevance = item.similarity || 0
      const maxSim = Math.max(...selected.map((s: any) => s.page_id === item.page_id ? 0.8 : 0.1))
      const score = lambda * relevance - (1 - lambda) * maxSim
      if (score > bestScore) { bestScore = score; bestIdx = i }
    })
    selected.push(remaining[bestIdx])
    remaining.splice(bestIdx, 1)
  }
  return selected
}

function computeConfidence(items: any[]): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (!items.length) return 'LOW'
  const top = items[0].similarity || 0
  return top >= 0.75 ? 'HIGH' : top >= 0.35 ? 'MEDIUM' : 'LOW'
}

function packContext(items: any[], maxTokens = 15000): string {
  const tokenizer = new GPT3Tokenizer({ type: 'gpt3' })
  let context = '', total = 0
  for (const item of items) {
    const chunk = `[Source: ${item.page_id} | Score: ${((item.similarity || 0) * 100).toFixed(1)}%]\n${item.content}\n\n`
    const tokenCount = tokenizer.encode(chunk).bpe.length
    if (total + tokenCount > maxTokens) break
    context += chunk
    total += tokenCount
  }
  return context
}

// ─── Main Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Supabase not configured' })
    }

    const { prompt: query, chatHistory, projectId, chatProvider: bodyChatProvider, embeddingProvider: bodyEmbeddingProvider, selectedFileIds } = req.body as {
      prompt: string; projectId: string
      chatHistory?: Array<{ role: string; text: string }>
      chatProvider?: string
      embeddingProvider?: string
      selectedFileIds?: string[]
    }

    if (!projectId) return res.status(400).json({ error: 'Project ID required' })
    if (!query?.trim()) return res.status(400).json({ error: 'Query required' })

    const sanitizedQuery = query.trim()

    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'no-cache, no-transform')

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Get project providers
    let embedProvider = (bodyEmbeddingProvider || 'cohere') as EmbeddingProviderId
    let chatProvider = (bodyChatProvider || 'groq') as ChatProviderId

    try {
      const { data: proj } = await supabase.from('nods_project').select('embedding_provider, chat_provider').eq('id', projectId).single()
      if (proj) {
        if (proj.embedding_provider && !bodyEmbeddingProvider) embedProvider = proj.embedding_provider as EmbeddingProviderId
        if (proj.chat_provider && !bodyChatProvider) chatProvider = proj.chat_provider as ChatProviderId
      }
    } catch (e) {
      console.warn('[VectorMind] Safe bypass of project lookup schema error:', e)
    }

    // Auto-fallback if keys missing
    if (!isProviderAvailable(EMBEDDING_PROVIDERS[embedProvider].keyEnv)) {
      const fb = Object.values(EMBEDDING_PROVIDERS).find(p => isProviderAvailable(p.keyEnv))
      if (!fb) { res.write('Error: No embedding API key configured.'); return res.end() }
      embedProvider = fb.id
    }
    if (!isProviderAvailable(CHAT_PROVIDERS[chatProvider].keyEnv)) {
      const fb = Object.values(CHAT_PROVIDERS).find(p => isProviderAvailable(p.keyEnv))
      if (!fb) { res.write('Error: No chat API key configured.'); return res.end() }
      chatProvider = fb.id
    }

    // HyDE expansion
    const allQueries = await expandQueryHyDE(sanitizedQuery, chatProvider)
    console.log(`[VectorMind] Queries (${allQueries.length}):`, allQueries)

    // Embed queries using high-performance batching
    let queryEmbeddings: number[][] = []
    try {
      queryEmbeddings = await generateEmbeddingsBatch(allQueries, embedProvider, 'query')
    } catch (e: any) {
      console.error('[VectorMind] Query batch embedding failed:', e.message)
    }

    if (queryEmbeddings.length === 0) {
      res.write("Couldn't process your query. Please try again.")
      return res.end()
    }

    // Hybrid search
    const allResultLists: any[][] = []
    for (let i = 0; i < queryEmbeddings.length; i++) {
      const { data, error } = await supabase.rpc('hybrid_search', {
        query_embedding: queryEmbeddings[i],
        query_text: allQueries[i] || sanitizedQuery,
        p_project_id: projectId,
        match_count: 20,
        similarity_threshold: 0.1,
      })
      if (error) { console.error(`[VectorMind] Search error ${i}:`, error); continue }
      
      let filteredData = data || []
      if (selectedFileIds && selectedFileIds.length > 0) {
        filteredData = filteredData.filter((item: any) => selectedFileIds.includes(String(item.page_id)))
      }
      if (filteredData.length > 0) allResultLists.push(filteredData)
    }

    // RRF + MMR + Confidence
    const fusedResults = rrfFusion(allResultLists)
    const diverseResults = mmrFilter(fusedResults, 0.7, 20)
    const confidence = computeConfidence(diverseResults)

    if (diverseResults.length === 0) {
      res.write("I couldn't find relevant information in the indexed documents.")
      return res.end()
    }

    console.log(`[VectorMind] ${diverseResults.length} results. ${confidence} confidence. Top: ${(diverseResults[0]?.similarity || 0).toFixed(4)}`)

    const packedContext = packContext(diverseResults, 15000)

    // Resolve sources
    const pageIds = Array.from(new Set(diverseResults.map((r: any) => r.page_id)))
    const { data: pages } = await supabase.from('nods_page').select('id, path, meta').in('id', pageIds)
    const sourceMap = new Map<number, string>()
    pages?.forEach((p: any) => sourceMap.set(p.id, p.meta?.filename || p.path?.split('/').pop() || 'doc'))
    const sourceIds = Array.from(new Set(diverseResults.map((r: any) => sourceMap.get(r.page_id) || 'doc')))

    // Build system prompt
    const systemPrompt = `You are VectorMind, an intelligent document assistant.
Answer the user's question using ONLY the information in the CONTEXT section below.
If the context does not contain enough information to answer, say: "I don't have enough information in the indexed documents to answer that."
Do not make up facts. Cite sources when possible.
Confidence level: ${confidence}

CONTEXT:
${packedContext}`

    // Send metadata prefix + stream response
    res.write(`[SOURCES:${JSON.stringify(sourceIds)}]\n[CONFIDENCE:${confidence}:${(diverseResults[0]?.similarity || 0).toFixed(4)}]\n`)

    await streamChatResponse(
      systemPrompt,
      sanitizedQuery,
      chatHistory || [],
      chatProvider,
      (text) => res.write(text)
    )

    res.end()
  } catch (err: any) {
    console.error('[VectorMind] Search error:', err)
    if (res.headersSent) {
      try { res.write(`\n\nError: ${err.message}`); res.end() } catch {}
      return
    }
    return res.status(500).json({ error: err.message || 'Search failed' })
  }
}
