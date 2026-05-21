import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { codeBlock, oneLine } from 'common-tags'
import GPT3Tokenizer from 'gpt3-tokenizer'
import { StreamingTextResponse } from 'ai'
import { ApplicationError, UserError } from '@/lib/errors'

// Retrieve API keys and configurations from your environment variables
const geminiKey = process.env.GEMINI_API_KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Set the nextjs edge runtime for optimal real-time streaming performance
export const runtime = 'edge'

export default async function handler(req: NextRequest) {
  try {
    // 1. Verify that all required environment credentials are fully configured
    if (!geminiKey) {
      throw new ApplicationError('Missing environment variable GEMINI_API_KEY')
    }

    if (!supabaseUrl) {
      throw new ApplicationError('Missing environment variable NEXT_PUBLIC_SUPABASE_URL')
    }

    if (!supabaseServiceKey) {
      throw new ApplicationError('Missing environment variable SUPABASE_SERVICE_ROLE_KEY')
    }

    // 2. Parse request payload to retrieve the user's question
    const requestData = await req.json()
    if (!requestData) {
      throw new UserError('Missing request data')
    }

    const { prompt: query } = requestData
    if (!query) {
      throw new UserError('Missing query in request data')
    }

    // 3. Initialize a secure Supabase service client to interact with pgvector and full-text indexes
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      realtime: {
        transport: class {} as any,
      },
    })

    const sanitizedQuery = query.trim()

    // 4. Generate query vector embeddings using models/gemini-embedding-2 via native fetch.
    // This is 100% compatible with the Edge Runtime and bypasses Node.js sandbox constraints.
    // We specify taskType as 'RETRIEVAL_QUERY' and outputDimensionality as 768.
    const embeddingResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-2',
          content: {
            parts: [{ text: sanitizedQuery.replace(/\n/g, ' ') }],
          },
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: 768,
        }),
      }
    )

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text()
      let parsedError = 'Failed to generate embedding'
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          parsedError = errorJson.error.message
        }
      } catch (e) {}
      throw new ApplicationError(parsedError, { errorText })
    }

    const embeddingData = await embeddingResponse.json()
    const embedding = embeddingData.embedding?.values

    if (!embedding) {
      throw new ApplicationError('Failed to extract embedding values from Gemini response')
    }

    // 5. Invoke our custom hybrid_search database RPC function
    // This executes BOTH pgvector semantic similarity search and full-text keyword tsquery search,
    // then merges and ranks the results using the Reciprocal Rank Fusion (RRF) algorithm.
    const { error: matchError, data: pageSections } = await supabaseClient.rpc(
      'hybrid_search',
      {
        query_embedding: embedding, // The 768-dimension semantic query vector
        query_text: sanitizedQuery, // Raw search text for full-text search token matching
        match_threshold: 0.3, // Matches that score lower than this semantic threshold are filtered out
        match_count: 10, // Returns the top 10 overall ranked chunks
      }
    )

    if (matchError) {
      throw new ApplicationError('Failed to execute hybrid_search RPC', matchError)
    }

    // 6. Resolve the parent documents details (such as filenames and paths) for the matched sections
    const pageIds = Array.from(new Set((pageSections || []).map((s: any) => s.page_id)))
    const pageMap = new Map<number, { path: string; filename: string }>()
    
    if (pageIds.length > 0) {
      const { data: pages } = await supabaseClient
        .from('nods_page')
        .select('id, path, meta')
        .in('id', pageIds)
      
      if (pages) {
        pages.forEach((p: any) => {
          pageMap.set(p.id, {
            path: p.path,
            filename: p.meta?.filename || p.path.split('/').pop() || 'document',
          })
        })
      }
    }

    // 7. Collate retrieved text sections into a single context block
    const tokenizer = new GPT3Tokenizer({ type: 'gpt3' })
    let tokenCount = 0
    let contextText = ''
    const sourceFiles = new Set<string>()

    for (let i = 0; i < pageSections.length; i++) {
      const pageSection = pageSections[i]
      const content = pageSection.content
      const encoded = tokenizer.encode(content)
      tokenCount += encoded.text.length

      // Prevent sending overly large contexts to optimize performance and safety
      if (tokenCount >= 1500) {
        break
      }

      contextText += `${content.trim()}\n---\n`

      // Identify source documents to provide citations to the user interface
      const pageData = pageMap.get(pageSection.page_id)
      if (pageData) {
        sourceFiles.add(`${pageData.filename}->${pageData.path}`)
      }
    }

    // 8. Quota Saver Fallback: Instantly respond if no matching documents are found
    // This completely bypasses calling the Gemini API for irrelevant questions, protecting your daily rate limits!
    if (!contextText.trim()) {
      const fallbackMsg = "Sorry, I couldn't find relevant information in your indexed documents for this specific question. Please ensure you have uploaded documents related to this topic, or try rephrasing your query."
      const encoder = new TextEncoder()
      const localStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(fallbackMsg))
          controller.close()
        }
      })
      return new StreamingTextResponse(localStream)
    }

    // 9. Assemble the custom RAG prompt with retrieved context
    const promptText = codeBlock`
      ${oneLine`
        You are a professional and precise document analysis assistant for the VectorMind workspace.
        Given the following sections from the user's indexed documents, answer the question using only that information,
        outputted in clean, structured markdown format. Be thorough, detailed, and cite specific facts directly.
        If you are unsure or the answer is not explicitly written in the provided context documents, say:
        "Sorry, I couldn't find relevant information in your indexed documents for this specific question."
      `}

      Context sections:
      ${contextText}

      Question: """
      ${sanitizedQuery}
      """

      Answer:
    `

    // 10. Call gemini-2.5-flash with Google's native SSE endpoint via fetch
    // This ensures full compatibility inside the Edge Runtime.
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.1,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      let parsedError = 'Failed to generate completion'
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          parsedError = errorJson.error.message
        }
      } catch (e) {}
      throw new ApplicationError(parsedError, { errorText })
    }

    // 11. Create the source documents reference metadata prefix block
    const sourcesPrefix = sourceFiles.size > 0
      ? `[SOURCES:${Array.from(sourceFiles).join('|')}]\n`
      : ''

    // 12. Convert the SSE response stream into a clean client stream
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const webStream = new ReadableStream({
      async start(controller) {
        // Enqueue the citation references block at the start of the stream
        if (sourcesPrefix) {
          controller.enqueue(encoder.encode(sourcesPrefix))
        }

        if (!response.body) {
          controller.close()
          return
        }

        const reader = response.body.getReader()
        let buffer = ''
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            
            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
                  if (text) {
                    controller.enqueue(encoder.encode(text))
                  }
                } catch (e) {
                  // Ignore parse errors on incomplete chunks
                }
              }
            }
          }
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      },
    })

    // 13. Return the streaming text response
    return new StreamingTextResponse(webStream)
  } catch (err: unknown) {
    // 14. Graceful exception and quota/limit error formatting
    if (err instanceof UserError) {
      return new Response(
        JSON.stringify({ error: err.message, data: err.data }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    } else if (err instanceof ApplicationError) {
      console.error(`${err.message}: ${JSON.stringify(err.data)}`)
      const isQuota = err.message.toLowerCase().includes('quota') || 
                      err.message.toLowerCase().includes('limit') || 
                      err.message.toLowerCase().includes('exhausted')
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: isQuota ? 429 : 400, headers: { 'Content-Type': 'application/json' } }
      )
    } else {
      console.error('Unexpected error:', err)
      if (err instanceof Error) {
        console.error(err.stack)
      }
    }

    return new Response(
      JSON.stringify({
        error: (err as any)?.message || 'There was an error processing your request',
        stack: (err as any)?.stack
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
