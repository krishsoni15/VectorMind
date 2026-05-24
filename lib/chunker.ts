
export interface ChunkMetadata {
  heading?: string
  pageNum?: number
}

export interface DocumentChunk {
  content: string
  tokenCount: number
  metadata: ChunkMetadata
}

function getTokenCount(text: string): number {
  // Use a fast heuristic (~4 chars per token) to prevent synchronous 
  // blocking of the Node.js event loop during huge PDF chunking.
  return Math.ceil(text.length / 4)
}

export function recursiveCharacterChunker(
  text: string, 
  targetSize = 400, 
  overlap = 80
): DocumentChunk[] {
  const chunks: DocumentChunk[] = []
  const paragraphs = text.split('\n\n')
  
  let currentHeading = ''
  const separators = ['\n\n', '. ', '! ', '? ', ', ', '; ', ': ', ' ', '']
  
  function splitText(textToSplit: string, separatorIndex: number): string[] {
    if (separatorIndex >= separators.length) return [textToSplit]
    
    const sep = separators[separatorIndex]
    if (sep !== '' && !textToSplit.includes(sep)) {
      return splitText(textToSplit, separatorIndex + 1)
    }
    
    let parts: string[] = []
    if (sep === '') {
      for (let i = 0; i < textToSplit.length; i += 50) {
        parts.push(textToSplit.slice(i, i + 50))
      }
    } else {
      const splits = textToSplit.split(sep)
      parts = splits.map((s, i) => i < splits.length - 1 ? s + sep : s)
    }
    
    const finalParts: string[] = []
    for (const part of parts) {
      if (!part.trim()) continue
      const tokens = getTokenCount(part)
      if (tokens <= targetSize) {
        finalParts.push(part)
      } else {
        finalParts.push(...splitText(part, separatorIndex + 1))
      }
    }
    
    return finalParts
  }

  let currentChunkText = ''
  let currentChunkTokens = 0
  let chunkHeading = ''

  for (const para of paragraphs) {
    if (!para.trim()) continue
    
    const headingMatch = para.match(/^#{1,6}\s+(.*)/)
    if (headingMatch) {
      currentHeading = headingMatch[1].trim()
    }
    
    const paraTokens = getTokenCount(para)
    
    if (currentChunkTokens + paraTokens > targetSize && currentChunkTokens > 0) {
      chunks.push({
        content: currentChunkText.trim(),
        tokenCount: currentChunkTokens,
        metadata: { heading: chunkHeading }
      })
      
      const overlapText = getOverlapText(currentChunkText, overlap)
      currentChunkText = overlapText + (overlapText ? '\n\n' : '') + para
      currentChunkTokens = getTokenCount(currentChunkText)
      chunkHeading = currentHeading
    } else {
      if (currentChunkTokens === 0) chunkHeading = currentHeading
      currentChunkText += (currentChunkText ? '\n\n' : '') + para
      currentChunkTokens = getTokenCount(currentChunkText)
    }
    
    if (currentChunkTokens > targetSize) {
      const subParts = splitText(currentChunkText, 1) 
      
      currentChunkText = ''
      currentChunkTokens = 0
      
      for (const part of subParts) {
        const partTokens = getTokenCount(part)
        
        if (currentChunkTokens + partTokens > targetSize && currentChunkTokens > 0) {
          chunks.push({
            content: currentChunkText.trim(),
            tokenCount: currentChunkTokens,
            metadata: { heading: chunkHeading }
          })
          
          const overlapText = getOverlapText(currentChunkText, overlap)
          currentChunkText = overlapText + (overlapText && !overlapText.endsWith(' ') ? ' ' : '') + part
          currentChunkTokens = getTokenCount(currentChunkText)
          chunkHeading = currentHeading
        } else {
          if (currentChunkTokens === 0) chunkHeading = currentHeading
          currentChunkText += (currentChunkText && !currentChunkText.endsWith(' ') ? ' ' : '') + part
          currentChunkTokens = getTokenCount(currentChunkText)
        }
      }
    }
  }
  
  if (currentChunkText.trim()) {
    chunks.push({
      content: currentChunkText.trim(),
      tokenCount: currentChunkTokens,
      metadata: { heading: chunkHeading }
    })
  }

  return chunks
}

function getOverlapText(text: string, targetOverlapTokens: number): string {
  let parts: string[] | null = text.match(/[^.!?]+[.!?]+/g)
  if (!parts) {
    parts = text.split(/\s+/)
  }
  if (parts.length === 0) parts = [text]

  let overlapText = ''
  let tokens = 0
  
  for (let i = parts.length - 1; i >= 0; i--) {
    const s = parts[i]
    const isWord = !text.match(/[^.!?]+[.!?]+/g)
    const partText = isWord && i !== parts.length - 1 ? s + ' ' : s
    
    const sTokens = getTokenCount(partText)
    if (tokens + sTokens > targetOverlapTokens) {
      if (tokens > 0) break
      const charLimit = targetOverlapTokens * 4
      overlapText = partText.slice(-charLimit)
      break
    }
    overlapText = partText + overlapText
    tokens += sTokens
  }
  
  return overlapText.trim()
}
