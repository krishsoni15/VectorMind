import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { codeBlock, oneLine } from 'common-tags'
import { StreamingTextResponse } from 'ai'
import { ApplicationError, UserError } from '@/lib/errors'

const geminiKey = process.env.GEMINI_API_KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export const runtime = 'edge'

export default async function handler(req: NextRequest) {
  try {
    if (!geminiKey) {
      throw new ApplicationError('Missing environment variable GEMINI_API_KEY')
    }

    if (!supabaseUrl) {
      throw new ApplicationError('Missing environment variable SUPABASE_URL')
    }

    if (!supabaseServiceKey) {
      throw new ApplicationError('Missing environment variable SUPABASE_SERVICE_ROLE_KEY')
    }

    const requestData = await req.json()

    if (!requestData) {
      throw new UserError('Missing request data')
    }

    const { prompt: query } = requestData

    if (!query) {
      throw new UserError('Missing query in request data')
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

    const sanitizedQuery = query.trim()

    // Create embedding from query using Gemini embedding model
    const embeddingResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/gemini-embedding-2',
          content: {
            parts: [{ text: sanitizedQuery.replaceAll('\n', ' ') }],
          },
          taskType: 'RETRIEVAL_QUERY',
          outputDimensionality: 768,
        }),
      }
    )

    if (!embeddingResponse.ok) {
      throw new ApplicationError('Failed to create embedding for question', { errorText: await embeddingResponse.text() })
    }

    const embeddingData = await embeddingResponse.json()
    const embedding = embeddingData.embedding?.values

    if (!embedding) {
      throw new ApplicationError('Failed to extract embedding from response', embeddingData)
    }

    const { error: matchError, data: pageSections } = await supabaseClient.rpc(
      'match_page_sections',
      {
        embedding,
        match_threshold: 0.3,
        match_count: 10,
        min_content_length: 50,
      }
    )

    if (matchError) {
      throw new ApplicationError('Failed to match page sections', matchError)
    }

    // Fetch page paths for the matched sections to display as source documents
    const pageIds = Array.from(new Set((pageSections || []).map((s: any) => s.page_id)))
    const pageMap = new Map<number, string>()
    if (pageIds.length > 0) {
      const { data: pages } = await supabaseClient
        .from('nods_page')
        .select('id, path')
        .in('id', pageIds)
      
      if (pages) {
        pages.forEach((p: any) => {
          pageMap.set(p.id, p.path)
        })
      }
    }

    // Simple character-based token estimation (avoids GPT3Tokenizer edge runtime issues)
    let charCount = 0
    let contextText = ''
    const sourceFiles = new Set<string>()

    for (let i = 0; i < pageSections.length; i++) {
      const pageSection = pageSections[i]
      const content = pageSection.content
      charCount += content.length

      // ~6000 chars ≈ ~1500 tokens
      if (charCount >= 6000) {
        break
      }

      contextText += `${content.trim()}\n---\n`
      
      // Track which source files contributed to the answer
      const pagePath = pageMap.get(pageSection.page_id)
      if (pagePath) {
        sourceFiles.add(pagePath)
      }
    }

    // If no relevant sections found, return a helpful message
    if (!contextText.trim()) {
      const noResultsMsg = "I couldn't find any relevant information in your indexed documents for this query. Please make sure you have uploaded documents related to this topic, or try rephrasing your question."
      const encoder = new TextEncoder()
      const noResultStream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(noResultsMsg))
          controller.close()
        },
      })
      return new StreamingTextResponse(noResultStream)
    }

    const prompt = codeBlock`
      ${oneLine`
        You are a knowledgeable document analysis assistant for the VectorMind platform.
        Given the following sections from the user's indexed documents,
        answer the question using only that information,
        outputted in markdown format. Be thorough, detailed, and cite specific facts.
        If you are unsure and the answer
        is not explicitly written in the documents, say
        "Sorry, I couldn't find relevant information in your indexed documents for this specific question."
      `}

      Context sections:
      ${contextText}

      Question: """
      ${sanitizedQuery}
      """

      Answer as markdown (including related code snippets if available):
    `

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse&key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.1,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      throw new ApplicationError('Failed to generate completion', { errorText })
    }

    // Build source files metadata prefix
    const sourcesPrefix = sourceFiles.size > 0
      ? `[SOURCES:${Array.from(sourceFiles).join('|')}]\n`
      : ''

    // Transform the Gemini SSE response stream into a readable text stream
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const stream = new ReadableStream({
      async start(controller) {
        // Prepend source file metadata so the client can parse it
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
                  // ignore incomplete JSON parse errors
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

    // Return a StreamingTextResponse, which can be consumed by the client
    return new StreamingTextResponse(stream)
  } catch (err: unknown) {
    if (err instanceof UserError) {
      return new Response(
        JSON.stringify({
          error: err.message,
          data: err.data,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Surface the real error message for debugging
    let errorMessage = 'There was an error processing your request'
    if (err instanceof ApplicationError) {
      errorMessage = err.message
      console.error(`${err.message}: ${JSON.stringify(err.data)}`)
    } else if (err instanceof Error) {
      errorMessage = err.message
      console.error('Unexpected error:', err.message, err.stack)
    } else {
      console.error('Unexpected error:', err)
    }

    return new Response(
      JSON.stringify({
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}

