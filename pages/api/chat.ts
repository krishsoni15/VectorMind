// pages/api/chat.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import GPT3Tokenizer from 'gpt3-tokenizer'
import {
  generateEmbedding, generateEmbeddingsBatch, expandQueryHyDE, streamChatResponse,
  EMBEDDING_PROVIDERS, CHAT_PROVIDERS, isProviderAvailable,
  type EmbeddingProviderId, type ChatProviderId
} from '../../lib/providers'
import { getCachedAnswer, setCachedAnswer } from '../../lib/semanticCache'
import { calculateGroundingScore } from '../../lib/groundingScore'
import { withValidation, ChatRequestSchema } from '../../lib/validateRequest'
import { withRateLimit } from '../../lib/rateLimiter'
import { z } from 'zod'

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

function packContext(citations: any[], maxTokens = 15000): string {
  const tokenizer = new GPT3Tokenizer({ type: 'gpt3' })
  let context = '', total = 0
  for (let idx = 0; idx < citations.length; idx++) {
    const item = citations[idx]
    const chunk = `[${item.id}] (Source: ${item.sourceName})\n${item.chunk}\n\n`
    const tokenCount = tokenizer.encode(chunk).bpe.length
    if (total + tokenCount > maxTokens) break
    context += chunk
    total += tokenCount
  }
  return context
}

async function formatAndSummarizeHistory(
  history: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> {
  if (!history || history.length === 0) return ''

  const formatted = history.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')

  const tokenizer = new GPT3Tokenizer({ type: 'gpt3' })
  const tokenCount = tokenizer.encode(formatted).bpe.length

  if (tokenCount <= 1000) {
    return formatted
  }

  const key = process.env.GROQ_API_KEY || process.env.GROQ_KEY
  if (!key) {
    console.warn('[History] Missing Groq key, slicing history instead of summarizing.')
    const truncated = history.slice(-4)
    return truncated.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'Summarize the following chat conversation history into a concise summary of main topics and context, under 200 tokens.'
          },
          { role: 'user', content: formatted }
        ],
        temperature: 0.3,
        max_tokens: 250
      })
    })

    if (!res.ok) return formatted.substring(0, 4000)
    const data = await res.json()
    return data.choices?.[0]?.message?.content || formatted.substring(0, 4000)
  } catch (e) {
    console.error('[History] Failed to summarize history:', e)
    return formatted.substring(0, 4000)
  }
}

async function getFollowUpSuggestions(question: string, answer: string): Promise<string[]> {
  const key = process.env.GROQ_API_KEY || process.env.GROQ_KEY
  if (!key) return []

  const systemPrompt = "Given this Q&A pair from a document analysis AI, suggest 3 short follow-up questions the user might want to ask. Focus ONLY on the actual knowledge, topics, or content discussed in the answer. Do NOT suggest meta-questions like 'What can I ask?', 'Can I download this?', or 'Are files editable?'. Return ONLY a JSON array of 3 strings. Max 10 words each."
  const inputPayload = JSON.stringify({
    question,
    answer_summary: answer.substring(0, 200)
  })

  try {
    if (key) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: inputPayload }
          ],
          temperature: 0.5,
          max_tokens: 150
        })
      })

      if (res.ok) {
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content || '[]'
        const arrayMatch = text.match(/\[[\s\S]*\]/)
        if (arrayMatch) {
          try {
            const parsed = JSON.parse(arrayMatch[0])
            if (Array.isArray(parsed)) return parsed.slice(0, 3)
          } catch {}
        }
      }
    }
    
    // Fallback to Gemini
    const geminiKey = process.env.GEMINI_API_KEY
    if (geminiKey) {
      const gemRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\nInput: ${inputPayload}` }] }],
          generationConfig: { maxOutputTokens: 150, temperature: 0.5 }
        })
      })
      if (gemRes.ok) {
        const gemData = await gemRes.json()
        const text = gemData.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
        const arrayMatch = text.match(/\[[\s\S]*\]/)
        if (arrayMatch) {
          try {
            const parsed = JSON.parse(arrayMatch[0])
            if (Array.isArray(parsed)) return parsed.slice(0, 3)
          } catch {}
        }
      }
    }
    return ["Could you explain that in more detail?", "What are the key takeaways?", "Can you summarize this?"]
  } catch (e) {
    console.error('[Suggestions] Failed to get follow-ups:', e)
    return ["Could you explain that in more detail?", "What are the key takeaways?", "Can you summarize this?"]
  }
}

// ─── Main Handler ────────────────────────────────────────────────────────────────

async function chatHandler(
  req: NextApiRequest,
  res: NextApiResponse,
  data: z.infer<typeof ChatRequestSchema>
) {
  const sendEvent = (data: any) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
      if (typeof (res as any).flush === 'function') {
        (res as any).flush()
      }
    } catch (e) {
      // Ignore write errors if client disconnected
    }
  }

  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({ error: 'Supabase not configured' })
    }

    const {
      prompt,
      query,
      projectId: bodyProjectId,
      workspaceId,
      chatHistory,
      conversationHistory,
      chatProvider: bodyChatProvider,
      model,
      embeddingProvider: bodyEmbeddingProvider,
      selectedFileIds,
      strictMode
    } = data

    const queryText = (query || prompt || '').trim()
    const projectId = bodyProjectId || workspaceId

    if (!projectId) return res.status(400).json({ error: 'Project ID required' })
    if (!queryText) return res.status(400).json({ error: 'Query required' })

    const sanitizedQuery = queryText

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Get project providers & workspace metadata
    let embedProvider = (bodyEmbeddingProvider || 'cohere') as EmbeddingProviderId
    let chatProvider = (model || bodyChatProvider || 'groq') as ChatProviderId
    let workspaceName = 'VectorMind Workspace'
    let documentCount = 0

    try {
      const { data: proj } = await supabase.from('nods_project').select('name, embedding_provider, chat_provider').eq('id', projectId).single()
      if (proj) {
        workspaceName = proj.name || workspaceName
        if (proj.embedding_provider && !bodyEmbeddingProvider) embedProvider = proj.embedding_provider as EmbeddingProviderId
        if (proj.chat_provider && !bodyChatProvider) chatProvider = proj.chat_provider as ChatProviderId
      }

      const { count } = await supabase.from('nods_page').select('*', { count: 'exact', head: true }).eq('project_id', projectId)
      if (count !== null) documentCount = count
    } catch (e) {
      console.warn('[VectorMind] Safe bypass of project lookup schema error:', e)
    }

    // Auto-fallback if keys missing
    if (!isProviderAvailable(EMBEDDING_PROVIDERS[embedProvider].keyEnv)) {
      const fb = Object.values(EMBEDDING_PROVIDERS).find(p => isProviderAvailable(p.keyEnv))
      if (!fb) { sendEvent({ error: 'No embedding API key configured.' }); return res.end() }
      embedProvider = fb.id
    }
    if (!isProviderAvailable(CHAT_PROVIDERS[chatProvider].keyEnv)) {
      const fb = Object.values(CHAT_PROVIDERS).find(p => isProviderAvailable(p.keyEnv))
      if (!fb) { sendEvent({ error: 'No chat API key configured.' }); return res.end() }
      chatProvider = fb.id
    }

    // HyDE expansion
    const allQueries = await expandQueryHyDE(sanitizedQuery, chatProvider)
    
    // Embed queries
    let queryEmbeddings: number[][] = []
    try {
      queryEmbeddings = await generateEmbeddingsBatch(allQueries, embedProvider, 'query')
    } catch (e: any) {
      console.error('[VectorMind] Query batch embedding failed:', e.message)
    }

    if (queryEmbeddings.length === 0) {
      sendEvent({ error: "Couldn't process your query. Please try again." })
      return res.end()
    }

    // ─── Semantic Cache Check ────────────────────────────────────────────────────────
    const cachedResult = await getCachedAnswer(queryEmbeddings[0], projectId)
    if (cachedResult) {
      // HIT: Stream cached answer immediately
      sendEvent({ token: cachedResult.answer, done: false })
      sendEvent({ done: true, citations: cachedResult.citations, cached: true })
      return res.end()
    }

    // Hybrid search (Concurrent)
    const searchPromises = queryEmbeddings.map(async (embedding, i) => {
      const { data, error } = await supabase.rpc('hybrid_search', {
        query_embedding: embedding,
        query_text: allQueries[i] || sanitizedQuery,
        p_project_id: projectId,
        match_count: 20,
        similarity_threshold: 0.1,
      })
      if (error) return []
      
      let filteredData = data || []
      if (selectedFileIds && selectedFileIds.length > 0) {
        filteredData = filteredData.filter((item: any) => selectedFileIds.includes(String(item.page_id)))
      }
      return filteredData
    })

    const resultsArray = await Promise.all(searchPromises)
    const allResultLists = resultsArray.filter(list => list.length > 0)

    // RRF + MMR + Confidence
    const fusedResults = rrfFusion(allResultLists)
    let diverseResults = mmrFilter(fusedResults, 0.7, 20)
    const confidence = computeConfidence(diverseResults)

    // If no results are found, we still allow the LLM to answer (for conversational queries like "hello")

    // Resolve sources
    const pageIds = Array.from(new Set(diverseResults.map((r: any) => r.page_id)))
    const { data: pages } = await supabase.from('nods_page').select('id, path, meta').in('id', pageIds)
    const sourceMap = new Map<number, string>()
    pages?.forEach((p: any) => sourceMap.set(p.id, p.meta?.filename || p.path?.split('/').pop() || 'doc'))

    const citations = diverseResults.map((r: any, idx: number) => ({
      id: idx + 1,
      sourceName: sourceMap.get(r.page_id) || 'doc',
      chunk: r.content,
      score: r.similarity || 0
    }))

    const packedContext = packContext(citations, 15000)

    const historySummary = await formatAndSummarizeHistory(conversationHistory || [])
    let historyContext = ''
    if (historySummary) {
      historyContext = `Previous conversation context:\n${historySummary}\n\n`
    }

    const systemPrompt = `${historyContext}You are VectorMind, a helpful and intelligent AI assistant.
Current Workspace: "${workspaceName}" (${documentCount} indexed document${documentCount !== 1 ? 's' : ''}).

Instructions:
1. For conversational greetings (e.g., "hello", "good morning") or questions about yourself or the workspace, respond naturally and helpfully.
${strictMode 
  ? `2. STRICT MODE IS ENABLED: You are strictly limited to answering questions using ONLY the information provided in the CONTEXT section below.
3. You MUST NOT use your general knowledge, external information, or hallucinations. If the specific answer, requested list, or information is NOT explicitly contained within the CONTEXT below, you MUST completely refuse to answer.
4. If you refuse to answer, your ENTIRE reply must be exactly this: "I don't have enough information in your indexed documents to answer that. Please expand your database."` 
  : `2. For questions regarding knowledge or facts, answer using ONLY the information in the CONTEXT section below.
3. If the user asks an off-topic question that is not covered in the CONTEXT, you MUST answer it using your general knowledge but keep the answer very short. At the very end of your answer, you MUST append this note: **Note: This information is not from your database.**`}
${strictMode ? '5' : '4'}. When you use information from the CONTEXT, you MUST cite your sources inline using brackets with the citation ID, like [1].
${strictMode ? '6' : '5'}. FORMATTING RULES:
   - You are an elite senior software engineer and technical educator. Always format coding answers in a clean professional developer style.
   - NEVER dump raw unformatted code. Never return code as plain text paragraphs.
   - Always separate: Explanation, File structure, Code (HTML/CSS/JS/Backend), Commands, Output.
   - Use proper Markdown formatting. Every code block MUST have a language type (e.g. \`\`\`html, \`\`\`ts).
   - Add headings and spacing. Make code visually beautiful and easy to copy.
   - If multiple files exist, clearly show filenames before code.
   - Add comments inside important code.
   - Use bullet points for explanations and keep responses structured like modern documentation.
   - CRITICAL: DO NOT add any conversational filler, meta-commentary, or disclaimers at the end of your response (e.g., "Note: This response is based on the provided context"). Just output the answer directly.

${!strictMode ? `CRITICAL RULE: If your answer relies on general knowledge because the CONTEXT is insufficient, you MUST append exactly this string at the very end of your output: "**Note: This information is not from your database.**"` : ''}

Confidence level of retrieved context: ${confidence}

CONTEXT:
${packedContext}`

    let fullAnswer = ''
    await streamChatResponse(
      systemPrompt,
      sanitizedQuery,
      chatHistory || [],
      chatProvider,
      (text) => {
        fullAnswer += text
        sendEvent({ token: text, done: false })
      }
    )

    sendEvent({ text_done: true })

    const suggestionsTimeout = new Promise<string[]>((resolve) => setTimeout(() => resolve(["Could you explain that in more detail?", "What are the key takeaways?", "Can you summarize this?"]), 3000))

    // Calculate Grounding Score and get Suggestions in parallel
    const [grounding, suggestions] = await Promise.all([
      calculateGroundingScore(fullAnswer, citations),
      Promise.race([getFollowUpSuggestions(sanitizedQuery, fullAnswer), suggestionsTimeout])
    ])

    // Cache the new answer
    await setCachedAnswer(queryEmbeddings[0], fullAnswer, citations, projectId)

    // Calculate approximations for usage tracking
    const tokenizer = new GPT3Tokenizer({ type: 'gpt3' })
    const inputTokensApprox = tokenizer.encode(systemPrompt + sanitizedQuery).bpe.length
    const outputTokensApprox = tokenizer.encode(fullAnswer).bpe.length

    sendEvent({ 
      done: true, 
      citations, 
      grounding, 
      suggestions, 
      debugAnswer: fullAnswer,
      tokensUsed: { input: inputTokensApprox, output: outputTokensApprox }
    })
    res.end()
  } catch (err: any) {
    console.error('[VectorMind] Search error:', err)
    sendEvent({ error: err.message || 'Search failed' })
    res.end()
  }
}

export default withRateLimit('chat', withValidation(ChatRequestSchema, chatHandler))
