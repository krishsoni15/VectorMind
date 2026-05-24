import { NextApiRequest, NextApiResponse } from 'next'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || 'https://dummy-url.upstash.io',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || 'dummy-token'
})

function getIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for']
  const ip = typeof forwarded === 'string' 
    ? forwarded.split(',')[0].trim() 
    : req.socket.remoteAddress || '127.0.0.1'
  return ip
}

interface RateLimitResponse {
  success: boolean
  limit: number
  remaining: number
  reset: number // In seconds
}

/**
 * Generic sliding window rate limiter
 */
async function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResponse> {
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    // Fail-open if Redis is not configured (e.g. local dev without config)
    return { success: true, limit, remaining: limit, reset: 0 }
  }

  const now = Date.now()
  const clearBefore = now - windowMs

  try {
    const p = redis.pipeline()
    // Add unique member to avoid duplicates if multiple requests hit at the exact same millisecond
    const member = `${now}-${Math.random().toString(36).substring(2, 6)}`
    
    p.zadd(key, { score: now, member })
    p.zremrangebyscore(key, 0, clearBefore)
    p.zcard(key)
    p.zrange(key, 0, 0, { withScores: true })
    p.expire(key, Math.ceil(windowMs / 1000) * 2)

    const results = await p.exec()
    const count = results[2] as number
    const oldestArray = results[3] as any[]

    let oldestTimestamp = now
    if (oldestArray && oldestArray.length > 0) {
      // In Upstash Redis pipeline output, ZRANGE withScores might return [member, score] or similar.
      // We safely find the score value.
      if (typeof oldestArray[1] === 'number') {
        oldestTimestamp = oldestArray[1]
      } else if (typeof oldestArray[0] === 'number') {
        oldestTimestamp = oldestArray[0]
      }
    }

    const isBlocked = count > limit
    const retryAfterMs = isBlocked ? (oldestTimestamp + windowMs - now) : 0
    const retryAfterSec = Math.ceil(retryAfterMs / 1000)

    return {
      success: !isBlocked,
      limit,
      remaining: Math.max(0, limit - count),
      reset: retryAfterSec
    }
  } catch (error) {
    console.error('[RateLimiter] Error evaluating rate limit:', error)
    // Fail open on Redis network error to prevent complete service denial
    return { success: true, limit, remaining: 1, reset: 0 }
  }
}

/**
 * Middleware wrapper to enforce rate limits on API handlers
 */
export function withRateLimit(
  limitType: 'chat' | 'upload' | 'workspaces',
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    let key = ''
    let limit = 100
    let windowMs = 60 * 1000 // default 1 minute

    if (limitType === 'chat') {
      // 30 requests/minute per IP
      const ip = getIp(req)
      key = `ratelimit:chat:${ip}`
      limit = 30
      windowMs = 60 * 1000 // 1 minute
    } else if (limitType === 'upload') {
      // 100 requests/hour per Workspace
      const workspaceId = req.body?.projectId || req.body?.workspaceId || req.query?.projectId || req.query?.workspaceId || 'global'
      key = `ratelimit:upload:${workspaceId}`
      limit = 100
      windowMs = 60 * 60 * 1000 // 1 hour
    } else if (limitType === 'workspaces') {
      // 60 requests/minute per IP for workspace CRUD
      const ip = getIp(req)
      key = `ratelimit:workspaces:${ip}`
      limit = 60
      windowMs = 60 * 1000 // 1 minute
    }

    const result = await rateLimit(key, limit, windowMs)

    res.setHeader('X-RateLimit-Limit', limit.toString())
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString())
    res.setHeader('X-RateLimit-Reset', result.reset.toString())

    if (!result.success) {
      res.setHeader('Retry-After', result.reset.toString())
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again in ${result.reset} seconds.`
      })
    }

    return await handler(req, res)
  }
}
