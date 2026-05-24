import { Redis } from '@upstash/redis'
import { Index } from '@upstash/vector'

export const CACHE_SIMILARITY_THRESHOLD = 0.92

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || 'https://dummy-url.upstash.io',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || 'dummy-token'
})

const vector = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL || 'https://dummy-url.upstash.io',
  token: process.env.UPSTASH_VECTOR_REST_TOKEN || 'dummy-token'
})

export interface CachedResult {
  answer: string
  citations: any[]
}

export async function getCachedAnswer(queryEmbedding: number[], workspaceId?: string): Promise<CachedResult | null> {
  try {
    if (!process.env.UPSTASH_VECTOR_REST_URL) return null

    const results = await vector.query({
      vector: queryEmbedding,
      topK: 1,
      includeMetadata: true
    })
    
    if (results && results.length > 0) {
      const match = results[0]
      // Enforce workspace isolation
      if (workspaceId && match.metadata?.workspaceId && match.metadata.workspaceId !== workspaceId) {
        console.log(`[Cache] MISS - Found match but for different workspace`)
        return null
      }

      if (match.score >= CACHE_SIMILARITY_THRESHOLD) {
        console.log(`[Cache] HIT [${new Date().toISOString()}] - Vector ID: ${match.id} | Score: ${match.score.toFixed(3)}`)
        const cachedPayload = await redis.get<CachedResult>(`cache:${match.id}`)
        if (cachedPayload) {
          return cachedPayload
        }
      } else {
        console.log(`[Cache] MISS [${new Date().toISOString()}] - Nearest Score: ${match.score.toFixed(3)} (Threshold: ${CACHE_SIMILARITY_THRESHOLD})`)
      }
    } else {
      console.log(`[Cache] MISS [${new Date().toISOString()}] - No vectors found`)
    }
    return null
  } catch (error) {
    console.error('[Cache] Query error:', error)
    return null
  }
}

export async function setCachedAnswer(queryEmbedding: number[], answer: string, citations: any[], workspaceId?: string): Promise<void> {
  try {
    if (!process.env.UPSTASH_VECTOR_REST_URL) return

    const id = Math.random().toString(36).substring(2, 15)
    
    // Store in Upstash Vector with metadata
    await vector.upsert([{
      id,
      vector: queryEmbedding,
      metadata: { workspaceId: workspaceId || 'default' }
    }])
    
    // Store full payload in Redis with 24 hours TTL
    await redis.setex(`cache:${id}`, 24 * 60 * 60, { answer, citations })
    
    if (workspaceId) {
      await redis.sadd(`workspace:${workspaceId}:cache_ids`, id)
    }
    console.log(`[Cache] SET [${new Date().toISOString()}] - Vector ID: ${id}`)
  } catch (error) {
    console.error('[Cache] Set error:', error)
  }
}

export async function invalidateWorkspaceCache(workspaceId: string): Promise<void> {
  try {
    if (!process.env.UPSTASH_VECTOR_REST_URL) return

    const keys = await redis.smembers(`workspace:${workspaceId}:cache_ids`)
    if (keys.length > 0) {
      // Invalidate vectors
      await vector.delete(keys)
      
      // Invalidate redis payloads
      const redisKeys = keys.map(id => `cache:${id}`)
      await redis.del(...redisKeys)
      
      // Remove set
      await redis.del(`workspace:${workspaceId}:cache_ids`)
      console.log(`[Cache] INVALIDATED [${new Date().toISOString()}] - Workspace: ${workspaceId} (${keys.length} entries)`)
    }
  } catch (error) {
    console.error('[Cache] Invalidation error:', error)
  }
}
