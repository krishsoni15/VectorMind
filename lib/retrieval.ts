import { SupabaseClient } from '@supabase/supabase-js'
import { generateEmbedding, type EmbeddingProviderId } from './providers'

export interface RetrievalChunk {
  id: string | number
  content: string
  heading_context: string
  page_id: number | string
  similarity: number
}

export interface RetrievalResult {
  chunks: RetrievalChunk[]
  query_variants: string[]
}

// Ensure you have Groq API key in your environment
function getGroqKey(): string | undefined {
  return process.env.GROQ_API_KEY || process.env.GROQ_KEY
}

/**
 * Step 1: Multi-query expansion using Groq
 */
async function expandQueryGroq(query: string): Promise<string[]> {
  const key = getGroqKey()
  if (!key) {
    console.warn('[Retrieval] Missing Groq API key. Falling back to single query.')
    return [query]
  }

  const prompt = "You are a query expansion assistant. Given a user question, generate 3 alternative phrasings that capture the same intent but use different vocabulary. Return ONLY a JSON array of 3 strings, nothing else."

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: query }
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    })

    if (!res.ok) {
      console.error(`[Retrieval] Groq expansion failed with status: ${res.status}`)
      return [query]
    }
    
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || '[]'
    
    // Clean potential markdown blocks
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    
    if (Array.isArray(parsed)) {
      // Return original + 3 variants
      return [query, ...parsed.slice(0, 3)]
    }
    return [query]
  } catch (error) {
    console.error('[Retrieval] Query expansion error, falling back to single query:', error)
    return [query]
  }
}

/**
 * Helper: Basic hash for content deduplication
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString(16)
}

/**
 * Step 3: Reciprocal Rank Fusion (RRF)
 */
function rrfFusion(resultLists: RetrievalChunk[][], k = 60): RetrievalChunk[] {
  const scores = new Map<string, { rrfScore: number; item: RetrievalChunk }>()

  for (const list of resultLists) {
    list.forEach((item, index) => {
      // Deduplicate chunks by content hash
      const hash = simpleHash(item.content)
      const existing = scores.get(hash)
      const rank = index + 1 // 1-indexed rank
      const score = 1 / (k + rank)

      if (existing) {
        existing.rrfScore += score
        // Keep the item instance that had the highest raw similarity
        if (item.similarity > existing.item.similarity) {
          existing.item = item
        }
      } else {
        scores.set(hash, { rrfScore: score, item })
      }
    })
  }

  // Sort by RRF score descending
  return Array.from(scores.values())
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .map(val => val.item)
}

/**
 * Step 4: Maximal Marginal Relevance (MMR)
 */
function mmrFilter(items: RetrievalChunk[], lambda = 0.7, topK = 8): RetrievalChunk[] {
  if (items.length === 0) return []
  
  // Always select the highest RRF-scored chunk first
  const selected: RetrievalChunk[] = [items[0]]
  const remaining = items.slice(1)

  while (selected.length < topK && remaining.length > 0) {
    let bestIdx = 0
    let bestScore = -Infinity

    remaining.forEach((item, i) => {
      const relevance = item.similarity || 0
      
      // Calculate max similarity with already selected items.
      // Since we don't have vector embeddings in memory here, we use a simple heuristic:
      // If they share the same page_id, we consider them highly similar (0.8).
      // Otherwise, we consider them somewhat distinct (0.1).
      const maxSim = Math.max(...selected.map(s => s.page_id === item.page_id ? 0.8 : 0.1))
      
      const score = lambda * relevance - (1 - lambda) * maxSim
      if (score > bestScore) {
        bestScore = score
        bestIdx = i
      }
    })

    selected.push(remaining[bestIdx])
    remaining.splice(bestIdx, 1)
  }

  return selected
}

/**
 * Main Retrieval Pipeline
 */
export async function executeMultiQueryRetrieval(
  supabase: SupabaseClient,
  query: string,
  projectId: string,
  embeddingProvider: EmbeddingProviderId
): Promise<RetrievalResult> {
  
  // 1. Query Expansion (Original + 3 Variants)
  const queryVariants = await expandQueryGroq(query)

  // 2. Parallel Embedding
  const embeddings = await Promise.all(
    queryVariants.map(q => generateEmbedding(q, embeddingProvider, 'query'))
  )

  // 3. Parallel Vector Search (pgvector)
  const searchPromises = embeddings.map(async (emb, idx) => {
    const textVariant = queryVariants[idx]
    
    // Each search returns top 6 chunks
    const { data, error } = await supabase.rpc('hybrid_search', {
      query_embedding: emb,
      query_text: textVariant,
      p_project_id: projectId,
      match_count: 6,
      similarity_threshold: 0.1,
    })

    if (error) {
      console.error(`[Retrieval] Search failed for variant "${textVariant}":`, error)
      return []
    }
    return (data || []) as RetrievalChunk[]
  })

  const allResultLists = await Promise.all(searchPromises)

  // 4. RRF Fusion (deduplicated by content hash)
  const fusedChunks = rrfFusion(allResultLists, 60)

  // 5. MMR Deduplication (target top 8)
  const finalChunks = mmrFilter(fusedChunks, 0.7, 8)

  return {
    chunks: finalChunks,
    query_variants: queryVariants
  }
}
