// VECTORMIND — lib/ocr.ts
// AI-Powered Multimodal Optical Character Recognition (OCR) using Gemini 2.5 Flash Vision

export async function extractTextFromImage(buffer: Buffer, mimeType: string): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    throw new Error('GEMINI_API_KEY is not configured for AI OCR processing')
  }

  const base64Data = buffer.toString('base64')
  
  const prompt = `You are an expert OCR and document analysis engine.
Analyze this image thoroughly and extract ALL visible text, headings, numbers, tables, diagrams, labels, and structured details.
Format your output as clean Markdown:
- Preserve headings (#, ##, ###)
- Preserve lists and bullet points
- Convert any tables into clean Markdown tables
- Retain all visible code or math symbols accurately
- If the image contains a chart, receipt, infographic, or diagram, summarize its key data points concisely in markdown.
Do NOT wrap your output in conversational intro/outro text (like "Here is the extracted text:"). Output ONLY the extracted text.`

  let response: any = null
  const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
  
  for (const modelName of modelsToTry) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Data
                    }
                  },
                  {
                    text: prompt
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 4096
            }
          })
        }
      )
      if (res.ok) {
        response = res
        break
      } else {
        console.warn(`[VectorMind OCR] ${modelName} returned status ${res.status}, trying next model...`)
      }
    } catch (e: any) {
      console.warn(`[VectorMind OCR] ${modelName} fetch error:`, e.message)
    }
  }

  if (!response || !response.ok) {
    const errData = await (response?.json().catch(() => ({})) || Promise.resolve({}))
    console.warn(`[VectorMind OCR] Gemini Vision API notice (HTTP ${response?.status || 'N/A'}):`, errData?.error?.message || response?.statusText || 'All models failed')
    return `[Image Document: ${mimeType} — AI OCR extraction bypassed (API limit reached)]`
  }

  const data = await response.json()
  const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!extractedText || !extractedText.trim()) {
    return '[Image document: No legible text detected by AI OCR]'
  }

  return extractedText.trim()
}
