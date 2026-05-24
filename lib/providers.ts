// ══════════════════════════════════════════════════════════════════════════════
// VECTORMIND — Provider Registry
// Centralized config for all AI providers (Embedding + Chat)
// To add a new provider: add config + add case to embed/chat functions
// ══════════════════════════════════════════════════════════════════════════════

// ─── Types ───────────────────────────────────────────────────────────────────────

export type EmbeddingProviderId = 'gemini' | 'cohere' | 'openai'
export type ChatProviderId = 'gemini' | 'cohere' | 'groq' | 'openai'

export interface EmbeddingProviderConfig {
  id: EmbeddingProviderId
  name: string
  model: string
  dimension: number
  free: boolean
  freeLimit: string
  signupUrl: string
  keyEnv: string
}

export interface ChatProviderConfig {
  id: ChatProviderId
  name: string
  model: string
  free: boolean
  freeLimit: string
  signupUrl: string
  keyEnv: string
}

// ─── Provider Registry ───────────────────────────────────────────────────────────

export const EMBEDDING_PROVIDERS: Record<EmbeddingProviderId, EmbeddingProviderConfig> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    model: 'text-embedding-004',
    dimension: 768,
    free: true,
    freeLimit: '1500 RPD free',
    signupUrl: 'https://ai.google.dev',
    keyEnv: 'GEMINI_API_KEY',
  },
  cohere: {
    id: 'cohere',
    name: 'Cohere',
    model: 'embed-english-v3.0',
    dimension: 1024,
    free: true,
    freeLimit: '1000 calls/mo trial',
    signupUrl: 'https://dashboard.cohere.com',
    keyEnv: 'COHERE_API_KEY',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    model: 'text-embedding-3-small',
    dimension: 1536,
    free: false,
    freeLimit: 'Pay-as-you-go',
    signupUrl: 'https://platform.openai.com/api-keys',
    keyEnv: 'OPENAI_API_KEY',
  },
}

export const CHAT_PROVIDERS: Record<ChatProviderId, ChatProviderConfig> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    model: 'gemini-2.0-flash',
    free: true,
    freeLimit: '15 RPM free',
    signupUrl: 'https://ai.google.dev',
    keyEnv: 'GEMINI_API_KEY',
  },
  cohere: {
    id: 'cohere',
    name: 'Cohere',
    model: 'command-a-03-2025',
    free: true,
    freeLimit: '1000 calls/mo trial',
    signupUrl: 'https://dashboard.cohere.com',
    keyEnv: 'COHERE_API_KEY',
  },
  groq: {
    id: 'groq',
    name: 'Groq (Llama 3.3)',
    model: 'llama-3.3-70b-versatile',
    free: true,
    freeLimit: '1000 RPD free',
    signupUrl: 'https://console.groq.com',
    keyEnv: 'GROQ_API_KEY',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    model: 'gpt-4o-mini',
    free: false,
    freeLimit: 'Pay-as-you-go',
    signupUrl: 'https://platform.openai.com/api-keys',
    keyEnv: 'OPENAI_API_KEY',
  },
}

export const EMBEDDING_PROVIDER_OPTIONS = Object.values(EMBEDDING_PROVIDERS).map(p => ({
  value: p.id,
  label: p.id === 'openai' ? 'ChatGPT Embed' : p.id === 'gemini' ? 'Gemini' : 'Cohere',
}))

export const CHAT_PROVIDER_OPTIONS = Object.values(CHAT_PROVIDERS).map(p => ({
  value: p.id,
  label: p.id === 'openai' ? 'ChatGPT' : p.id === 'groq' ? 'Groq (Llama)' : p.id === 'gemini' ? 'Gemini' : 'Cohere',
}))

// ─── Key Helpers ─────────────────────────────────────────────────────────────────

export function getApiKey(envName: string): string | undefined {
  if (envName === 'OPENAI_API_KEY') {
    return process.env.OPENAI_API_KEY || process.env.OPENAI_KEY
  }
  return process.env[envName]
}

export function isProviderAvailable(keyEnv: string): boolean {
  if (keyEnv === 'OPENAI_API_KEY') {
    return !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY)
  }
  return !!process.env[keyEnv]
}

// ─── Embedding Function ─────────────────────────────────────────────────────────

const RATE_LIMIT_MS = 1200
let lastEmbedTime = 0

export async function generateEmbedding(
  text: string,
  providerId: EmbeddingProviderId,
  taskType: 'document' | 'query',
  attempt = 0
): Promise<number[]> {
  // Rate limiting
  const now = Date.now()
  const wait = RATE_LIMIT_MS - (now - lastEmbedTime)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  lastEmbedTime = Date.now()

  const config = EMBEDDING_PROVIDERS[providerId]
  const key = getApiKey(config.keyEnv)
  if (!key) throw new Error(`${config.name} API key not set (${config.keyEnv})`)

  try {
    switch (providerId) {
      case 'gemini': {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'models/text-embedding-004',
              content: { parts: [{ text }] },
              taskType: taskType === 'document' ? 'RETRIEVAL_DOCUMENT' : 'RETRIEVAL_QUERY',
              outputDimensionality: 768,
            }),
          }
        )
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          // Auto-fallback to Cohere if Gemini is dead
          if ((res.status === 403 || res.status === 429) && isProviderAvailable('COHERE_API_KEY')) {
            console.warn('[Providers] Gemini embedding failed, falling back to Cohere')
            return generateEmbedding(text, 'cohere', taskType, 0)
          }
          if (res.status === 429 && attempt < 5) {
            await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000))
            return generateEmbedding(text, providerId, taskType, attempt + 1)
          }
          throw new Error(`Gemini ${res.status}: ${JSON.stringify(err)}`)
        }
        const data = await res.json()
        return data.embedding.values
      }

      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: text,
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(`OpenAI ${res.status}: ${JSON.stringify(err)}`)
        }
        const data = await res.json()
        return data.data[0].embedding
      }

      case 'cohere': {
        const res = await fetch('https://api.cohere.com/v1/embed', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'accept': 'application/json',
          },
          body: JSON.stringify({
            texts: [text],
            model: 'embed-english-v3.0',
            input_type: taskType === 'document' ? 'search_document' : 'search_query',
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          if (res.status === 429 && attempt < 5) {
            await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000))
            return generateEmbedding(text, providerId, taskType, attempt + 1)
          }
          throw new Error(`Cohere ${res.status}: ${JSON.stringify(err)}`)
        }
        const data = await res.json()
        return data.embeddings[0]
      }

      default:
        throw new Error(`Unknown embedding provider: ${providerId}`)
    }
  } catch (e) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000))
      return generateEmbedding(text, providerId, taskType, attempt + 1)
    }
    throw e
  }
}

// ─── Batch Embedding Function ───────────────────────────────────────────────────

export async function generateEmbeddingsBatch(
  texts: string[],
  providerId: EmbeddingProviderId,
  taskType: 'document' | 'query',
  attempt = 0
): Promise<number[][]> {
  const config = EMBEDDING_PROVIDERS[providerId]
  const key = getApiKey(config.keyEnv)
  if (!key) throw new Error(`${config.name} API key not set (${config.keyEnv})`)

  try {
    switch (providerId) {
      case 'gemini': {
        const chunkSize = 100
        const results: number[][] = []
        for (let i = 0; i < texts.length; i += chunkSize) {
          const chunk = texts.slice(i, i + chunkSize)
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=${key}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requests: chunk.map(text => ({
                  model: 'models/text-embedding-004',
                  content: { parts: [{ text }] },
                  taskType: taskType === 'document' ? 'RETRIEVAL_DOCUMENT' : 'RETRIEVAL_QUERY',
                  outputDimensionality: 768,
                })),
              }),
            }
          )
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            // Auto-fallback to Cohere if Gemini is dead
            if ((res.status === 403 || res.status === 429) && isProviderAvailable('COHERE_API_KEY')) {
              console.warn('[Providers] Gemini batch embedding failed, falling back to Cohere')
              return generateEmbeddingsBatch(texts, 'cohere', taskType, 0)
            }
            if (res.status === 429 && attempt < 5) {
              await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000 + 1000))
              return generateEmbeddingsBatch(texts, providerId, taskType, attempt + 1)
            }
            throw new Error(`Gemini batch ${res.status}: ${JSON.stringify(err)}`)
          }
          const data = await res.json()
          if (!data.embeddings || !Array.isArray(data.embeddings)) {
            throw new Error(`Gemini batch embedding returned invalid response: ${JSON.stringify(data)}`)
          }
          results.push(...data.embeddings.map((e: any) => e.values))
        }
        return results
      }

      case 'openai': {
        const chunkSize = 500
        const results: number[][] = []
        for (let i = 0; i < texts.length; i += chunkSize) {
          const chunk = texts.slice(i, i + chunkSize)
          const res = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              input: chunk,
            }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            if (res.status === 429 && attempt < 5) {
              await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000 + 1000))
              return generateEmbeddingsBatch(texts, providerId, taskType, attempt + 1)
            }
            throw new Error(`OpenAI batch ${res.status}: ${JSON.stringify(err)}`)
          }
          const data = await res.json()
          const sorted = data.data.sort((a: any, b: any) => a.index - b.index)
          results.push(...sorted.map((item: any) => item.embedding))
        }
        return results
      }

      case 'cohere': {
        const chunkSize = 90 // Perfectly within 96 trial key limit
        const results: number[][] = []
        for (let i = 0; i < texts.length; i += chunkSize) {
          const chunk = texts.slice(i, i + chunkSize)
          
          if (i > 0) {
            await new Promise(r => setTimeout(r, 2000))
          }

          const res = await fetch('https://api.cohere.com/v1/embed', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${key}`,
              'Content-Type': 'application/json',
              'accept': 'application/json',
            },
            body: JSON.stringify({
              texts: chunk,
              model: 'embed-english-v3.0',
              input_type: taskType === 'document' ? 'search_document' : 'search_query',
            }),
          })
          if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            if (res.status === 429 && attempt < 5) {
              await new Promise(r => setTimeout(r, (Math.pow(2, attempt) * 2000) + 4000))
              return generateEmbeddingsBatch(texts, providerId, taskType, attempt + 1)
            }
            throw new Error(`Cohere batch ${res.status}: ${JSON.stringify(err)}`)
          }
          const data = await res.json()
          if (!data.embeddings || !Array.isArray(data.embeddings)) {
            throw new Error(`Cohere batch embedding returned invalid response: ${JSON.stringify(data)}`)
          }
          results.push(...data.embeddings)
        }
        return results
      }

      default:
        throw new Error(`Unknown embedding provider: ${providerId}`)
    }
  } catch (e: any) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000 + 1000))
      return generateEmbeddingsBatch(texts, providerId, taskType, attempt + 1)
    }
    throw e
  }
}

// ─── HyDE Query Expansion ────────────────────────────────────────────────────────

export async function expandQueryHyDE(
  query: string,
  chatProvider: ChatProviderId
): Promise<string[]> {
  try {
    const prompt = `Generate exactly 3 alternative search queries for: "${query}"\nReturn ONLY a JSON array of 3 strings. No other text.`

    switch (chatProvider) {
      case 'gemini': {
        const key = getApiKey('GEMINI_API_KEY')
        if (!key) return [query]
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
            }),
          }
        )
        if (!res.ok) {
          // Fallback to any available chat provider
          if (isProviderAvailable('COHERE_API_KEY')) return expandQueryHyDE(query, 'cohere')
          if (isProviderAvailable('GROQ_API_KEY')) return expandQueryHyDE(query, 'groq')
          return [query]
        }
        const data = await res.json()
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
        const clean = text.replace(/```json|```/g, '').trim()
        return [query, ...JSON.parse(clean).slice(0, 3)]
      }

      case 'cohere': {
        const key = getApiKey('COHERE_API_KEY')
        if (!key) return [query]
        const res = await fetch('https://api.cohere.com/v2/chat', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
            'accept': 'application/json',
          },
          body: JSON.stringify({
            model: 'command-a-03-2025',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 200,
          }),
        })
        if (!res.ok) return [query]
        const data = await res.json()
        const text = data.message?.content?.[0]?.text || '[]'
        const clean = text.replace(/```json|```/g, '').trim()
        return [query, ...JSON.parse(clean).slice(0, 3)]
      }

      case 'openai': {
        const key = getApiKey('OPENAI_API_KEY')
        if (!key) return [query]
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 200,
          }),
        })
        if (!res.ok) return [query]
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content || '[]'
        const clean = text.replace(/```json|```/g, '').trim()
        return [query, ...JSON.parse(clean).slice(0, 3)]
      }

      case 'groq': {
        const key = getApiKey('GROQ_API_KEY')
        if (!key) return [query]
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 200,
          }),
        })
        if (!res.ok) return [query]
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content || '[]'
        const clean = text.replace(/```json|```/g, '').trim()
        return [query, ...JSON.parse(clean).slice(0, 3)]
      }

      default:
        return [query]
    }
  } catch {
    return [query]
  }
}

// ─── Streaming Chat Generation ───────────────────────────────────────────────────

export async function streamChatResponse(
  systemPrompt: string,
  userQuery: string,
  chatHistory: Array<{ role: string; text: string }>,
  chatProvider: ChatProviderId,
  onChunk: (text: string) => void
): Promise<void> {
  const config = CHAT_PROVIDERS[chatProvider]
  const key = getApiKey(config.keyEnv)

  if (!key) {
    // Auto-fallback to any available chat provider
    for (const fallbackId of ['groq', 'openai', 'cohere', 'gemini'] as ChatProviderId[]) {
      if (fallbackId !== chatProvider && isProviderAvailable(CHAT_PROVIDERS[fallbackId].keyEnv)) {
        console.warn(`[Providers] ${config.name} key missing, falling back to ${CHAT_PROVIDERS[fallbackId].name}`)
        return streamChatResponse(systemPrompt, userQuery, chatHistory, fallbackId, onChunk)
      }
    }
    throw new Error(`No chat provider API key available`)
  }

  switch (chatProvider) {
    case 'gemini': {
      const contents: any[] = [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Understood. I will answer using only the provided context.' }] },
      ]
      const recent = chatHistory.slice(-6)
      for (const msg of recent) {
        if (!msg.text) continue
        const role = msg.role === 'user' ? 'user' : 'model'
        if (contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts[0].text += '\n\n' + msg.text
        } else {
          contents.push({ role, parts: [{ text: msg.text }] })
        }
      }
      if (contents[contents.length - 1].role === 'user') {
        contents[contents.length - 1].parts[0].text += '\n\n' + userQuery
      } else {
        contents.push({ role: 'user', parts: [{ text: userQuery }] })
      }

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents, generationConfig: { temperature: 0.1, maxOutputTokens: 1024 } }),
        }
      )

      if (!res.ok) {
        // Fallback on error
        if (res.status === 429 || res.status === 403) {
          for (const fallbackId of ['groq', 'cohere'] as ChatProviderId[]) {
            if (isProviderAvailable(CHAT_PROVIDERS[fallbackId].keyEnv)) {
              return streamChatResponse(systemPrompt, userQuery, chatHistory, fallbackId, onChunk)
            }
          }
        }
        throw new Error(`Gemini stream error: ${res.status}`)
      }

      await parseSSEStream(res.body as any, (line) => {
        let raw = line.trim()
        if (raw.startsWith('data:')) raw = raw.replace(/^data:\s*/, '').trim()
        if (!raw || raw === '[DONE]') return
        try {
          const data = JSON.parse(raw)
          if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) onChunk(text)
        } catch (e: any) {
          if (e.message && !e.message.includes('Unexpected')) throw e
        }
      })
      break
    }

    case 'cohere': {
      const messages: any[] = []
      const recent = chatHistory.slice(-6)
      for (const msg of recent) {
        if (!msg.text) continue
        messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.text })
      }
      messages.push({ role: 'user', content: `${systemPrompt}\n\nQuestion: ${userQuery}` })

      const res = await fetch('https://api.cohere.com/v2/chat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'accept': 'application/json',
        },
        body: JSON.stringify({
          model: 'command-a-03-2025',
          messages,
          stream: true,
          temperature: 0.1,
          max_tokens: 1024,
        }),
      })

      if (!res.ok) throw new Error(`Cohere chat error: ${res.status}`)

      await parseSSEStream(res.body as any, (line) => {
        let raw = line.trim()
        if (raw.startsWith('data:')) raw = raw.replace(/^data:\s*/, '').trim()
        if (!raw || raw === '[DONE]') return
        try {
          const data = JSON.parse(raw)
          if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
          if (data.message) throw new Error(data.message)
          if (data.type === 'content-delta') {
            onChunk(data.delta?.message?.content?.text || '')
          }
        } catch (e: any) {
          if (e.message && !e.message.includes('Unexpected')) throw e
        }
      })
      break
    }

    case 'groq': {
      const messages: any[] = [{ role: 'system', content: systemPrompt }]
      const recent = chatHistory.slice(-6)
      for (const msg of recent) {
        if (!msg.text) continue
        messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.text })
      }
      messages.push({ role: 'user', content: userQuery })

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          stream: true,
          temperature: 0.1,
          max_tokens: 1024,
        }),
      })

      if (!res.ok) {
        // Fallback
        for (const fallbackId of ['cohere', 'gemini'] as ChatProviderId[]) {
          if (isProviderAvailable(CHAT_PROVIDERS[fallbackId].keyEnv)) {
            return streamChatResponse(systemPrompt, userQuery, chatHistory, fallbackId, onChunk)
          }
        }
        throw new Error(`Groq chat error: ${res.status}`)
      }

      await parseSSEStream(res.body as any, (line) => {
        let raw = line.trim()
        if (raw.startsWith('data:')) raw = raw.replace(/^data:\s*/, '').trim()
        if (!raw || raw === '[DONE]') return
        try {
          const data = JSON.parse(raw)
          if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
          const text = data.choices?.[0]?.delta?.content
          if (text) onChunk(text)
        } catch (e: any) {
          if (e.message && !e.message.includes('Unexpected')) throw e
        }
      })
      break
    }

    case 'openai': {
      const messages: any[] = [{ role: 'system', content: systemPrompt }]
      const recent = chatHistory.slice(-6)
      for (const msg of recent) {
        if (!msg.text) continue
        messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.text })
      }
      messages.push({ role: 'user', content: userQuery })

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          stream: true,
          temperature: 0.1,
          max_tokens: 1024,
        }),
      })

      if (!res.ok) {
        for (const fallbackId of ['groq', 'cohere', 'gemini'] as ChatProviderId[]) {
          if (isProviderAvailable(CHAT_PROVIDERS[fallbackId].keyEnv)) {
            return streamChatResponse(systemPrompt, userQuery, chatHistory, fallbackId, onChunk)
          }
        }
        throw new Error(`OpenAI chat error: ${res.status}`)
      }

      await parseSSEStream(res.body as any, (line) => {
        let raw = line.trim()
        if (raw.startsWith('data:')) raw = raw.replace(/^data:\s*/, '').trim()
        if (!raw || raw === '[DONE]') return
        try {
          const data = JSON.parse(raw)
          if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
          const text = data.choices?.[0]?.delta?.content
          if (text) onChunk(text)
        } catch (e: any) {
          if (e.message && !e.message.includes('Unexpected')) throw e
        }
      })
      break
    }
  }
}

// ─── SSE Stream Parser (works in Node.js) ────────────────────────────────────────

async function parseSSEStream(
  body: any,
  onLine: (line: string) => void
): Promise<void> {
  if (typeof body[Symbol.asyncIterator] === 'function') {
    const decoder = new TextDecoder()
    let buffer = ''
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) onLine(line)
    }
    if (buffer) onLine(buffer)
  } else if (typeof body.getReader === 'function') {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) onLine(line)
      }
      if (buffer) onLine(buffer)
    } finally {
      reader.releaseLock()
    }
  }
}
