import { getApiKey, isProviderAvailable } from './providers'

export interface GroundingResult {
  score: number
  level: 'high' | 'medium' | 'low'
  unsupportedSentences: string[]
}

/**
 * Method 1: Fast N-gram overlap
 * Extracts 3-grams from the sentence and checks if they appear in the chunks.
 */
function calculateNgramOverlap(sentence: string, contextChunks: any[]): boolean {
  const cleanSentence = sentence.toLowerCase().replace(/[^\w\s]/g, '')
  const words = cleanSentence.split(/\s+/).filter(w => w.length > 2)
  
  if (words.length < 3) return true // Too short to make a meaningful claim

  const ngrams: string[] = []
  for (let i = 0; i <= words.length - 3; i++) {
    ngrams.push(`${words[i]} ${words[i+1]} ${words[i+2]}`)
  }

  const allContextText = contextChunks
    .map(c => (c.chunk || c.content || '').toLowerCase())
    .join(' ')

  let matchedNgrams = 0
  for (const ngram of ngrams) {
    if (allContextText.includes(ngram)) {
      matchedNgrams++
    }
  }

  return (matchedNgrams / Math.max(ngrams.length, 1)) > 0.3
}

/**
 * Method 2: Accurate Cohere Rerank Entailment Proxy
 */
async function getCohereRerankScore(sentence: string, contextChunks: any[]): Promise<number> {
  const key = getApiKey('COHERE_API_KEY')
  if (!key) return 0
  
  const documents = contextChunks
    .slice(0, 5)
    .map(c => c.chunk || c.content || '')
    .filter(text => text.trim().length > 0)
    
  if (documents.length === 0) return 0

  try {
    const res = await fetch('https://api.cohere.com/v1/rerank', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: sentence,
        documents,
        model: 'rerank-english-v3.0'
      })
    })

    if (!res.ok) return 0
    const data = await res.json()
    
    if (data.results && data.results.length > 0) {
      return data.results[0].relevance_score
    }
    return 0
  } catch (err) {
    console.error('[Grounding] Cohere rerank failed', err)
    return 0
  }
}

/**
 * Calculates how well the final answer is grounded in the retrieved chunks.
 */
export async function calculateGroundingScore(answer: string, contextChunks: any[]): Promise<GroundingResult> {
  if (!answer.trim() || !contextChunks.length) {
    return { score: 0, level: 'low', unsupportedSentences: ['No context chunks provided'] }
  }

  const sentences = answer.split(/(?:[.!?]|\n)+/).filter(s => s.trim().length > 0)
  const unsupportedSentences: string[] = []
  
  // Disabled Cohere Rerank here because making concurrent API calls for every sentence
  // causes massive 30-40 second latency and hits rate limits. Using N-gram overlap instead.
  const useCohere = false

  if (useCohere) {
    let totalScore = 0
    const promises = sentences.map(async s => {
      const txt = s.trim()
      if (txt.length < 15) return 1 
      const score = await getCohereRerankScore(txt, contextChunks)
      if (score < 0.2) unsupportedSentences.push(txt) 
      return score
    })

    const scores = await Promise.all(promises)
    totalScore = scores.reduce((a, b) => a + b, 0)
    
    const avg = sentences.length > 0 ? (totalScore / sentences.length) : 0
    const percentage = Math.round(avg * 100)
    
    return {
      score: percentage,
      level: percentage >= 75 ? 'high' : percentage >= 50 ? 'medium' : 'low',
      unsupportedSentences
    }
  } else {
    let groundedCount = 0
    sentences.forEach(s => {
      const txt = s.trim()
      if (txt.length < 15) {
        groundedCount++
        return
      }
      
      const isGrounded = calculateNgramOverlap(txt, contextChunks)
      if (isGrounded) {
        groundedCount++
      } else {
        unsupportedSentences.push(txt)
      }
    })

    const percentage = sentences.length > 0 ? Math.round((groundedCount / sentences.length) * 100) : 0
    return {
      score: percentage,
      level: percentage >= 75 ? 'high' : percentage >= 50 ? 'medium' : 'low',
      unsupportedSentences
    }
  }
}
