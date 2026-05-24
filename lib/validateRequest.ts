import { NextApiRequest, NextApiResponse } from 'next'
import { z, ZodSchema, ZodError } from 'zod'

export function withValidation<T>(
  schema: ZodSchema<T>,
  handler: (req: NextApiRequest, res: NextApiResponse, data: T) => Promise<any>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // For GET requests, we might want to validate query parameters instead of body
      const input = req.method === 'GET' || req.method === 'DELETE' ? req.query : req.body
      const parsed = schema.parse(input)
      return await handler(req, res, parsed)
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        })
      }
      console.error('[Validation] Unexpected schema validation error:', error)
      return res.status(500).json({ error: 'Internal server error during validation' })
    }
  }
}

// Helper to sanitize text query
const sanitizeQuery = (val: string) => {
  return val
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Strip script tags
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/\0/g, '') // Strip null bytes
    .trim()
}

// Chat Request validation schema
export const ChatRequestSchema = z.object({
  query: z.string().min(1).max(2000).transform(sanitizeQuery).optional(),
  prompt: z.string().min(1).max(2000).transform(sanitizeQuery).optional(),
  workspaceId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  model: z.enum(['gemini', 'groq', 'cohere', 'openai']).optional(),
  chatProvider: z.enum(['gemini', 'groq', 'cohere', 'openai']).optional(),
  embeddingProvider: z.enum(['gemini', 'cohere', 'openai']).optional(),
  chatHistory: z.array(
    z.object({
      role: z.string(),
      text: z.string()
    })
  ).optional(),
  conversationHistory: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string()
    })
  ).optional(),
  selectedFileIds: z.array(z.string()).optional(),
  stream: z.boolean().optional(),
  strictMode: z.boolean().optional()
}).strict().refine(data => {
  // Ensure we have either query/prompt and workspaceId/projectId
  return (data.query || data.prompt) && (data.workspaceId || data.projectId)
}, {
  message: "Query/prompt and WorkspaceId/projectId are required"
})

// Upload Request validation schema
export const UploadRequestSchema = z.object({
  filename: z.string().refine(name => {
    const ext = name.split('.').pop()?.toLowerCase()
    return ['pdf', 'md', 'txt', 'docx', 'json', 'csv', 'py', 'ts'].includes(ext || '')
  }, { message: "Invalid file type. Supported types: pdf, md, txt, docx, json, csv, py, ts" }),
  base64: z.string().refine(val => {
    const bufferSize = (val.length * 3) / 4
    return bufferSize <= 50 * 1024 * 1024 // 50MB
  }, { message: "File size exceeds 50MB limit" }),
  projectId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  embeddingProvider: z.enum(['gemini', 'cohere', 'openai']).optional()
}).strict().refine(data => {
  return data.projectId || data.workspaceId
}, {
  message: "projectId or workspaceId is required"
})

// Workspace validation schema
export const WorkspaceRequestSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255).optional(),
  embedding_provider: z.enum(['gemini', 'cohere', 'openai']).optional(),
  chat_provider: z.enum(['gemini', 'cohere', 'groq', 'openai']).optional(),
  provider: z.string().optional()
}).strict()
