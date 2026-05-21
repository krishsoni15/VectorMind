import Head from 'next/head'
import React, { useState, useEffect, useRef } from 'react'
import {
  Search,
  UploadCloud,
  Database,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  FileText,
  AlertCircle,
  RefreshCw,
  CornerDownLeft,
  Wand,
  Send,
  Bot,
  User,
  MessageSquare,
  Eye,
  Zap
} from 'lucide-react'
// @ts-ignore
import { useCompletion } from 'ai/react'
import Image from 'next/image'
import Link from 'next/link'

interface IndexedDocument {
  id: string
  path: string
  checksum: string | null
  type: string | null
  source: string | null
  meta: {
    filename?: string
    size?: number
    uploadedAt?: string
  } | null
  sectionCount: number
}

interface UploadQueueFile {
  id: string
  file: File
  status: 'idle' | 'uploading' | 'success' | 'error'
  progress: number
  error?: string
  chunks?: number
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: Date
  isLoading?: boolean
  sources?: string[]
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<'search' | 'upload' | 'library' | 'docs'>('search')
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const activeMessageIdRef = useRef<string | null>(null)
  const [searchStep, setSearchStep] = useState<'idle' | 'embedding' | 'searching' | 'synthesizing' | 'done' | 'error'>('idle')

  // Extract sources from the completion text
  const parseCompletionSources = (text: string) => {
    if (text.startsWith('[SOURCES:')) {
      const closingIndex = text.indexOf(']\n')
      if (closingIndex !== -1) {
        const sourcesString = text.slice(9, closingIndex)
        const sources = sourcesString ? sourcesString.split('|') : []
        const cleanText = text.slice(closingIndex + 2)
        return { sources, cleanText }
      }
    }
    return { sources: [], cleanText: text }
  }

  // Dynamically generate 4 relevant suggestion chips based on uploaded documents!
  const getDynamicSuggestions = () => {
    if (documents.length === 0) {
      return [
        'How does this semantic search work?',
        'What kinds of documents can I upload?',
        'What is Retrieval-Augmented Generation?',
        'How secure is my indexed data?'
      ]
    }

    const suggestions: string[] = []
    
    // Check if we have the Microprocessor syllabus
    const hasMicroprocessor = documents.some(doc => {
      const name = (doc.meta?.filename || doc.path || '').toLowerCase()
      return name.includes('microprocessor') || name.includes('syllabus') || name.includes('3160712') || name.includes('gtu') || name.includes('mi-s2022')
    })

    // Check if we have the Women's Health report
    const hasWomensHealth = documents.some(doc => {
      const name = (doc.meta?.filename || doc.path || '').toLowerCase()
      return name.includes('women') || name.includes('health') || name.includes('wef') || name.includes('innovation')
    })

    // Populate suggestions based on what documents are present
    if (hasMicroprocessor && hasWomensHealth) {
      // Show 2 from each for a beautiful balanced grid!
      suggestions.push(
        'What is subject 3160712 about?',
        'How can I interface 8086 with external memory?',
        "What are the structural gaps in women's health innovation?",
        "What is the Women's Health Innovation Radar?"
      )
    } else if (hasMicroprocessor) {
      suggestions.push(
        'What is subject 3160712 about?',
        'What is GTU and when was this exam conducted?',
        'Summarize the key points of the Microprocessor syllabus.',
        'How can I interface 8086 with external memory?'
      )
    } else if (hasWomensHealth) {
      suggestions.push(
        "What are the structural gaps in women's health innovation?",
        "What is the Women's Health Innovation Radar?",
        "Summarize the World Economic Forum's 2026 women's health report.",
        "What are the key opportunities in women's health journey?"
      )
    } else {
      // Construct dynamic questions for any arbitrary uploaded documents!
      const topDocs = documents.slice(0, 2)
      topDocs.forEach((doc, idx) => {
        const name = doc.meta?.filename || doc.path.split('/').pop() || 'document'
        // Clean file extensions for gorgeous rendering
        const cleanName = name.replace(/\.[^/.]+$/, "")
        if (idx === 0) {
          suggestions.push(
            `What is the primary objective of ${cleanName}?`,
            `Summarize the key points described in ${cleanName}.`
          )
        } else {
          suggestions.push(
            `What are the core conclusions of ${cleanName}?`,
            `Are there any specific dates or figures mentioned in ${cleanName}?`
          )
        }
      })
      
      // Pad to 4 suggestions if we only have 1 document
      while (suggestions.length < 4) {
        const firstDoc = documents[0]
        const name = firstDoc.meta?.filename || firstDoc.path.split('/').pop() || 'document'
        const cleanName = name.replace(/\.[^/.]+$/, "")
        suggestions.push(
          `Can you provide an overview of ${cleanName}?`,
          `What are the most important details in ${cleanName}?`
        )
      }
    }

    return suggestions.slice(0, 4)
  }

  const { complete, completion, isLoading: isSearchLoading } = useCompletion({
    api: '/api/vector-search',
    onFinish: (prompt, finishedCompletion) => {
      const currentId = activeMessageIdRef.current
      const { sources, cleanText } = parseCompletionSources(finishedCompletion)
      setMessages(prev => {
        return prev.map(m => {
          if (m.id === currentId) {
            return {
              ...m,
              text: cleanText,
              sources: sources.length > 0 ? sources : undefined,
              isLoading: false
            }
          }
          return m
        })
      });
      activeMessageIdRef.current = null
      setSearchStep('done')
    },
    onError: (err) => {
      console.error('AI SDK Search Error:', err)
      const currentId = activeMessageIdRef.current
      setMessages(prev => {
        return prev.map(m => {
          if (m.id === currentId) {
            return {
              ...m,
              text: `Error generating response: ${err.message || 'Please check your connection and try again.'}`,
              isLoading: false
            }
          }
          return m
        })
      });
      activeMessageIdRef.current = null
      setSearchStep('error')
    }
  })

  // Auto scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Sync streaming completion with the active message bubble
  useEffect(() => {
    if (completion && isSearchLoading && activeMessageIdRef.current) {
      setSearchStep('synthesizing')
      const currentId = activeMessageIdRef.current
      const { sources, cleanText } = parseCompletionSources(completion)
      setMessages(prev => {
        return prev.map(m => {
          if (m.id === currentId) {
            return {
              ...m,
              text: cleanText,
              sources: sources.length > 0 ? sources : undefined,
              isLoading: false
            }
          }
          return m
        })
      });
    }
  }, [completion, isSearchLoading]);

  // Library State
  const [documents, setDocuments] = useState<IndexedDocument[]>([])
  const [isLibraryLoading, setIsLibraryLoading] = useState(false)
  const [deletingIds, setDeletingIds] = useState<string[]>([])
  const [libraryFilter, setLibraryFilter] = useState('')
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null)
  const [previewDocName, setPreviewDocName] = useState<string | null>(null)
  
  // Upload State
  const [uploadQueue, setUploadQueue] = useState<UploadQueueFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  // Close preview modal on Escape key & lock body scroll
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && previewDocUrl) {
        setPreviewDocUrl(null)
        setPreviewDocName(null)
      }
    }
    document.addEventListener('keydown', handleEscape)
    // Lock body scroll when modal is open
    if (previewDocUrl) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [previewDocUrl])

  // Fetch Library Documents
  const fetchLibrary = async () => {
    setIsLibraryLoading(true)
    try {
      const res = await fetch('/api/documents')
      if (res.ok) {
        const data = await res.json()
        setDocuments(data)
      }
    } catch (err) {
      console.error('Failed to load library:', err)
    } finally {
      setIsLibraryLoading(false)
    }
  }

  useEffect(() => {
    fetchLibrary()
  }, [])

  // Delete Document
  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Are you sure you want to delete this document? This will remove all its text sections and vector embeddings from the search index.')) {
      return
    }
    setDeletingIds(prev => [...prev, id])
    try {
      const res = await fetch(`/api/documents?id=${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setDocuments(prev => prev.filter(doc => doc.id !== id))
      } else {
        alert('Failed to delete document')
      }
    } catch (err) {
      console.error('Delete error:', err)
      alert('An error occurred during deletion')
    } finally {
      setDeletingIds(prev => prev.filter(x => x !== id))
    }
  }

  // Handle Drag & Drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      addFilesToQueue(Array.from(e.dataTransfer.files))
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFilesToQueue(Array.from(e.target.files))
    }
  }

  const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB
  const ALLOWED_EXTENSIONS = ['.pdf', '.md', '.txt', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.yaml', '.yml']
  const MAX_FILE_COUNT = 100

  const addFilesToQueue = (files: File[]) => {
    const currentCount = uploadQueue.length
    const allowedNewFiles = files.slice(0, MAX_FILE_COUNT - currentCount)

    if (files.length > allowedNewFiles.length) {
      alert(`Queue limit: You can only upload up to ${MAX_FILE_COUNT} files simultaneously in the queue. Extra files were ignored.`)
    }

    const newQueueItems = allowedNewFiles.map(file => {
      const dotIndex = file.name.lastIndexOf('.')
      const ext = dotIndex !== -1 ? file.name.substring(dotIndex).toLowerCase() : ''
      const isAllowedType = ALLOWED_EXTENSIONS.includes(ext)
      const isAllowedSize = file.size <= MAX_FILE_SIZE
      const isEmpty = file.size === 0

      let status: 'idle' | 'error' = 'idle'
      let error: string | undefined = undefined

      if (isEmpty) {
        status = 'error'
        error = `File is empty (0 bytes).`
      } else if (!isAllowedType) {
        status = 'error'
        error = `Unsupported format (${ext || 'no extension'}). Supported: PDF, MD, TXT, JSON, Code.`
      } else if (!isAllowedSize) {
        status = 'error'
        error = `Size exceeds 15MB limit.`
      }

      return {
        id: Math.random().toString(36).substring(7),
        file,
        status,
        progress: 0,
        error
      }
    })
    setUploadQueue(prev => [...prev, ...newQueueItems])
  }

  const removeFromQueue = (id: string) => {
    setUploadQueue(prev => prev.filter(item => item.id !== id))
  }

  const clearQueue = () => {
    setUploadQueue([])
  }

  // Upload progress helper wrapping XMLHttpRequest
  const uploadFileWithProgress = (
    file: File,
    base64Data: string,
    onProgress: (percent: number) => void
  ): Promise<any> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/upload', true)
      xhr.setRequestHeader('Content-Type', 'application/json')

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100)
          onProgress(Math.min(percent, 99)) // Cap at 99% until server responds
        }
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText)
            onProgress(100)
            resolve(res)
          } catch (_) {
            reject(new Error('Invalid response from server'))
          }
        } else {
          let errorMessage = `Upload failed: Status ${xhr.status}`
          try {
            const errorData = JSON.parse(xhr.responseText)
            errorMessage = errorData.error || errorMessage
          } catch (_) {
            if (xhr.responseText) {
              errorMessage = xhr.responseText.slice(0, 150)
            }
          }
          reject(new Error(errorMessage))
        }
      }

      xhr.onerror = () => {
        reject(new Error('Network error occurred'))
      }

      xhr.send(
        JSON.stringify({
          filename: file.name,
          base64: base64Data,
        })
      )
    })
  }

  // Process uploads sequentially to prevent API rate limits
  const startUpload = async () => {
    // Only fetch items that are actually 'idle' (not error/success/uploading)
    const pendingItems = uploadQueue.filter(q => q.status === 'idle')
    if (pendingItems.length === 0 || isUploading) return
    setIsUploading(true)

    for (let index = 0; index < uploadQueue.length; index++) {
      const item = uploadQueue[index]
      if (item.status === 'success' || item.status === 'error') continue

      // Update state to uploading
      setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading', progress: 0 } : q))

      try {
        const base64Data = await readFileAsBase64(item.file)
        const result = await uploadFileWithProgress(item.file, base64Data, (percent) => {
          setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, progress: percent } : q))
        })

        setUploadQueue(prev => prev.map(q => q.id === item.id ? {
          ...q,
          status: 'success',
          progress: 100,
          chunks: result.chunks
        } : q))
      } catch (err: any) {
        console.error(`Error uploading ${item.file.name}:`, err)
        setUploadQueue(prev => prev.map(q => q.id === item.id ? {
          ...q,
          status: 'error',
          progress: 0,
          error: err.message || 'Indexing failed'
        } : q))
      }
    }

    setIsUploading(false)
    fetchLibrary()
  }

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
  }

  // Search Submit
  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const query = searchQuery.trim()
    if (!query || isSearchLoading) return

    setSearchQuery('')
    
    const activeId = Math.random().toString(36).substring(7)
    activeMessageIdRef.current = activeId
    setSearchStep('embedding')
    
    const userMsg: Message = {
      id: Math.random().toString(),
      role: 'user',
      text: query,
      timestamp: new Date()
    }
    
    const assistantMsg: Message = {
      id: activeId,
      role: 'assistant',
      text: '',
      timestamp: new Date(),
      isLoading: true
    }
    
    setMessages(prev => [...prev, userMsg, assistantMsg])

    // Transition to semantic database search after a short embedding window
    setTimeout(() => {
      setSearchStep(prev => prev === 'embedding' ? 'searching' : prev)
    }, 1000)
    
    try {
      await complete(query)
    } catch (err) {
      console.error('Submit query error caught:', err)
      setSearchStep('error')
    }
  }

  // Trigger search from suggestions
  const handleSuggestionClick = async (suggestion: string) => {
    if (isSearchLoading) return
    
    const activeId = Math.random().toString(36).substring(7)
    activeMessageIdRef.current = activeId
    setSearchStep('embedding')

    const userMsg: Message = {
      id: Math.random().toString(),
      role: 'user',
      text: suggestion,
      timestamp: new Date()
    }
    
    const assistantMsg: Message = {
      id: activeId,
      role: 'assistant',
      text: '',
      timestamp: new Date(),
      isLoading: true
    }
    
    setMessages(prev => [...prev, userMsg, assistantMsg])

    // Transition to semantic database search after a short embedding window
    setTimeout(() => {
      setSearchStep(prev => prev === 'embedding' ? 'searching' : prev)
    }, 1000)
    
    try {
      await complete(suggestion)
    } catch (err) {
      console.error('Suggestion click error caught:', err)
      setSearchStep('error')
    }
  }

  const handleClearChat = () => {
    setMessages([])
  }

  const renderMarkdown = (text: string) => {
    if (!text) return null
    const lines = text.split('\n')
    const elements: React.ReactNode[] = []
    let inCodeBlock = false
    let codeLines: string[] = []
    let codeLang = ''

    const formatInline = (str: string) => {
      const parts: React.ReactNode[] = []
      let lastIdx = 0
      const regex = /(\*\*|`)(.*?)\1/g
      let match

      while ((match = regex.exec(str)) !== null) {
        if (match.index > lastIdx) {
          parts.push(str.substring(lastIdx, match.index))
        }
        if (match[1] === '**') {
          parts.push(<strong key={`b-${match.index}`} className="text-emerald-400 font-bold">{match[2]}</strong>)
        } else if (match[1] === '`') {
          parts.push(<code key={`c-${match.index}`}>{match[2]}</code>)
        }
        lastIdx = regex.lastIndex
      }

      if (lastIdx < str.length) {
        parts.push(str.substring(lastIdx))
      }

      return parts.length > 0 ? parts : str
    }

    lines.forEach((line, lineIdx) => {
      // Code block toggle
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true
          codeLang = line.trim().slice(3).trim()
          codeLines = []
        } else {
          elements.push(
            <pre key={`code-${lineIdx}`}>
              <code>{codeLines.join('\n')}</code>
            </pre>
          )
          inCodeBlock = false
        }
        return
      }

      if (inCodeBlock) {
        codeLines.push(line)
        return
      }

      // Headings
      if (line.startsWith('### ')) {
        elements.push(<h3 key={lineIdx}>{formatInline(line.slice(4))}</h3>)
        return
      }
      if (line.startsWith('## ')) {
        elements.push(<h2 key={lineIdx}>{formatInline(line.slice(3))}</h2>)
        return
      }
      if (line.startsWith('# ')) {
        elements.push(<h1 key={lineIdx}>{formatInline(line.slice(2))}</h1>)
        return
      }

      // Blockquote
      if (line.trim().startsWith('> ')) {
        elements.push(
          <blockquote key={lineIdx}>{formatInline(line.replace(/^>\s*/, ''))}</blockquote>
        )
        return
      }

      // Bullet list
      const isBullet = line.trim().startsWith('* ') || line.trim().startsWith('- ')
      if (isBullet) {
        elements.push(
          <li key={lineIdx} className="ml-4 list-disc text-slate-300 my-0.5 text-xs leading-relaxed">
            {formatInline(line.replace(/^\s*[*-]\s+/, ''))}
          </li>
        )
        return
      }

      // Numbered list
      const numberedMatch = line.match(/^\s*(\d+)\.\s+(.*)/)
      if (numberedMatch) {
        elements.push(
          <li key={lineIdx} className="ml-4 list-decimal text-slate-300 my-0.5 text-xs leading-relaxed">
            {formatInline(numberedMatch[2])}
          </li>
        )
        return
      }

      // Empty line
      if (line.trim() === '') {
        elements.push(<div key={lineIdx} className="h-1.5" />)
        return
      }

      // Regular paragraph
      elements.push(
        <p key={lineIdx} className="text-slate-300 my-0.5 text-xs leading-relaxed">
          {formatInline(line)}
        </p>
      )
    })

    return <div className="prose-chat">{elements}</div>
  }

  // Check if text is an error or quota/limit notification
  const renderMessageContent = (msg: Message) => {
    if (msg.isLoading) {
      return (
        <div className="p-4 rounded-2xl border border-slate-800 bg-slate-950/60 backdrop-blur-md text-xs space-y-4 shadow-lg shadow-emerald-500/[0.01] max-w-sm w-[320px] transition-all duration-500">
          <div className="flex items-center justify-between text-emerald-400 font-bold text-[10px] uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              AI Thought Process
            </span>
            <span className="text-slate-500 normal-case font-medium">Retrieval-Augmented Generation</span>
          </div>
          
          <div className="space-y-4">
            {/* Step 1: Embedding */}
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center shrink-0">
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                  searchStep === 'embedding'
                    ? 'border-emerald-400 text-emerald-400 bg-emerald-400/10'
                    : 'border-slate-800 text-slate-500 bg-slate-900/40'
                }`}>
                  {searchStep !== 'embedding' ? '✓' : '1'}
                </div>
                <div className={`w-0.5 h-6 transition-all duration-300 ${searchStep !== 'embedding' ? 'bg-emerald-500/20' : 'bg-slate-800'}`} />
              </div>
              <div className="text-[11px] pt-0.5 min-w-0">
                <div className={`font-semibold transition-colors duration-300 ${searchStep === 'embedding' ? 'text-slate-200' : 'text-slate-500'}`}>
                  Analyzing query & generating embeddings
                </div>
                {searchStep === 'embedding' && (
                  <p className="text-[10px] text-slate-400 mt-1 animate-pulse leading-normal">Converting question into 768-dim vector...</p>
                )}
              </div>
            </div>

            {/* Step 2: Semantic Search */}
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center shrink-0">
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                  searchStep === 'searching'
                    ? 'border-emerald-400 text-emerald-400 bg-emerald-400/10'
                    : (searchStep === 'synthesizing' || searchStep === 'done')
                    ? 'border-slate-800 text-emerald-500 bg-slate-900/40'
                    : 'border-slate-800 text-slate-500 bg-slate-900/40'
                }`}>
                  {searchStep === 'synthesizing' || searchStep === 'done' ? '✓' : '2'}
                </div>
                <div className={`w-0.5 h-6 transition-all duration-300 ${searchStep === 'synthesizing' || searchStep === 'done' ? 'bg-emerald-500/20' : 'bg-slate-800'}`} />
              </div>
              <div className="text-[11px] pt-0.5 min-w-0">
                <div className={`font-semibold transition-colors duration-300 ${searchStep === 'searching' ? 'text-slate-200' : 'text-slate-500'}`}>
                  Searching vector database
                </div>
                {searchStep === 'searching' && (
                  <p className="text-[10px] text-slate-400 mt-1 animate-pulse leading-normal">Querying pgvector via Supabase RPC...</p>
                )}
              </div>
            </div>

            {/* Step 3: Synthesis */}
            <div className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 transition-all duration-300 ${
                searchStep === 'synthesizing'
                  ? 'border-emerald-400 text-emerald-400 bg-emerald-400/10 animate-pulse'
                  : 'border-slate-800 text-slate-500 bg-slate-900/40'
              }`}>
                3
              </div>
              <div className="text-[11px] pt-0.5 min-w-0">
                <div className={`font-semibold transition-colors duration-300 ${searchStep === 'synthesizing' ? 'text-slate-200' : 'text-slate-500'}`}>
                  Synthesizing answer
                </div>
                {searchStep === 'synthesizing' && (
                  <p className="text-[10px] text-slate-400 mt-1 animate-pulse leading-normal">VectorMind is synthesizing your answer...</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (msg.role === 'assistant') {
      const text = msg.text
      const isQuotaError = text.toLowerCase().includes('quota') || text.toLowerCase().includes('limit') || text.toLowerCase().includes('exhausted') || text.includes('429')
      const isGenericError = text.startsWith('Error generating response:')

      if (isQuotaError) {
        return (
          <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] backdrop-blur-md text-xs space-y-3 shadow-lg shadow-amber-500/[0.02]">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-[11px] uppercase tracking-wider">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              API Rate Limit Reached (429)
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              You have exceeded your free tier rate limit or daily request quota. Google AI Studio limits some accounts on the free plan to <strong>20 requests per day</strong> or <strong>15 requests per minute</strong>.
            </p>
            <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-900 font-mono text-[10px] text-slate-400 space-y-1">
              <div>• <strong>Current Model:</strong> gemini-2.5-flash</div>
              <div>• <strong>Quota reset:</strong> wait a minute or daily cycle</div>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">
              <strong>Tip:</strong> Consider spacing out your requests or check your API key credentials at <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Google AI Studio</a>.
            </p>
          </div>
        )
      }

      if (isGenericError) {
        return (
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/[0.03] backdrop-blur-md text-xs space-y-3 shadow-lg shadow-red-500/[0.02]">
            <div className="flex items-center gap-2 text-red-400 font-bold text-[11px] uppercase tracking-wider">
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              API Operational Error
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              {text.replace('Error generating response:', '').trim() || 'A backend database or system error occurred.'}
            </p>
          </div>
        )
      }

      return (
        <div className="space-y-3">
          <div className="whitespace-pre-wrap">{renderMarkdown(text)}</div>
          {msg.sources && msg.sources.length > 0 && (
            <div className="pt-2 border-t border-slate-800/40 space-y-1.5">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Source Documents</span>
              <div className="flex flex-wrap gap-2">
                {msg.sources.map((src, idx) => {
                  const [filename, path] = src.split('->')
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setPreviewDocUrl(`/uploads/${filename}`)
                        setPreviewDocName(filename || 'Document')
                      }}
                      className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-full border border-emerald-500/10 hover:border-emerald-500/20 transition flex items-center gap-1.5 shrink-0"
                    >
                      <FileText className="w-3 h-3 text-emerald-400 shrink-0" />
                      {filename}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )
    }

    return <div className="whitespace-pre-wrap">{msg.text}</div>
  }

  // Filtered Library Documents
  const filteredDocs = documents.filter(doc => {
    const term = libraryFilter.toLowerCase()
    const name = doc.meta?.filename?.toLowerCase() || doc.path.toLowerCase()
    return name.includes(term)
  })

  // Counts for status info
  const successUploadsCount = uploadQueue.filter(q => q.status === 'success').length
  const totalUploadsCount = uploadQueue.length

  return (
    <>
      <Head>
        <title>VectorMind — AI Document Search</title>
        <meta
          name="description"
          content="VectorMind — AI-powered document intelligence platform with semantic search, powered by Google Gemini & Supabase pgvector."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
        {/* Glow Effects */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-10 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-[120px] pointer-events-none" />

        {/* Header */}
        <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Database className="w-5 h-5 text-slate-950 stroke-[2.5]" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-300">
                  VectorMind
                </h1>
                <p className="text-[10px] text-slate-500 font-medium tracking-widest">AI DOCUMENT INTELLIGENCE</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>VectorMind Online</span>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col">
          {/* Hero Banner */}
          <div className="mb-8 p-6 rounded-2xl border border-slate-900 bg-gradient-to-br from-slate-900 to-slate-950/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Wand className="w-5 h-5 text-emerald-400" />
                Intelligent Document Retrieval
              </h2>
              <p className="text-xs text-slate-400 mt-1.5 max-w-xl leading-relaxed">
                Upload documents and ask questions instantly. VectorMind chunks your files, embeds them into 768-dimensional vectors, and indexes them for precise semantic retrieval.
              </p>
            </div>
            <div className="flex items-center space-x-6 shrink-0 bg-slate-950/40 px-4 py-3 rounded-xl border border-slate-900">
              <div className="text-center">
                <div className="text-xl font-bold text-emerald-400">{documents.length}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Indexed Files</div>
              </div>
              <div className="h-8 border-l border-slate-900" />
              <div className="text-center">
                <div className="text-xl font-bold text-violet-400">
                  {documents.reduce((sum, doc) => sum + doc.sectionCount, 0)}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Total Sections</div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex space-x-1 border-b border-slate-900 mb-6 pb-px">
            <button
              onClick={() => setActiveTab('search')}
              className={`px-4 py-2.5 text-xs font-bold transition-all relative ${
                activeTab === 'search'
                  ? 'text-emerald-400 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Search Documents
              {activeTab === 'search' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-4 py-2.5 text-xs font-bold transition-all relative ${
                activeTab === 'upload'
                  ? 'text-emerald-400 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Upload Files
              {activeTab === 'upload' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('library')}
              className={`px-4 py-2.5 text-xs font-bold transition-all relative ${
                activeTab === 'library'
                  ? 'text-emerald-400 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Library Manager
              {activeTab === 'library' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400 rounded-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`px-4 py-2.5 text-xs font-bold transition-all relative ${
                activeTab === 'docs'
                  ? 'text-emerald-400 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              How It Works
              {activeTab === 'docs' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400 rounded-full" />
              )}
            </button>
          </div>

          {/* Tab 1: Search Panel (Premium Chatbot Interface) */}
          {activeTab === 'search' && (
            <div className="flex-1 flex flex-col min-h-[500px] border border-slate-900 bg-slate-950/30 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl">
              
              {/* Chat Header */}
              <div className="px-6 py-4 border-b border-slate-900/80 bg-slate-900/10 flex items-center justify-between shrink-0">
                <div className="flex items-center space-x-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-200">Semantic Chat Assistant</h3>
                    <p className="text-[10px] text-slate-500">Ask questions over indexed documents</p>
                  </div>
                </div>
                {messages.length > 0 && (
                  <button
                    onClick={handleClearChat}
                    className="text-[10px] text-slate-400 hover:text-red-400 px-2.5 py-1.5 rounded-lg border border-slate-800 hover:border-red-950/40 bg-slate-900/20 hover:bg-red-950/10 transition font-bold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Conversation
                  </button>
                )}
              </div>

              {/* Chat Scroll Window */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-h-[550px] min-h-[350px] custom-scrollbar">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center py-10 text-center animate-slide-up">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center shadow-inner mb-4">
                      <Wand className="w-7 h-7 text-emerald-400" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-200">How can I assist you with your files?</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm">
                      {documents.length > 0
                        ? `Ask a question to query your ${documents.length} indexed files using semantic search.`
                        : 'Upload some documents first to begin chatting.'}
                    </p>

                    {/* Suggestions Section */}
                    {documents.length > 0 && (
                      <div className="mt-8 w-full max-w-lg">
                        <div className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-3">Suggested Queries</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                          {getDynamicSuggestions().map((sug, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleSuggestionClick(sug)}
                              className="suggestion-chip p-3 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-900/30 hover:bg-slate-900/60 border border-slate-900 hover:border-emerald-500/20 rounded-xl transition-all duration-200 text-left font-medium hover:shadow-lg hover:shadow-emerald-500/[0.03] hover:translate-y-[-1px]"
                            >
                              {sug}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {messages.map((msg, index) => {
                      const isUser = msg.role === 'user'
                      return (
                        <div
                          key={msg.id || index}
                          className={`flex items-start gap-3 animate-slide-up ${
                            isUser ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {/* Bot Avatar (Left side) */}
                          {!isUser && (
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/10">
                              <Bot className="w-4 h-4 text-slate-950 stroke-[2.5]" />
                            </div>
                          )}

                          {/* Message Bubble */}
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed transition-all duration-300 border ${
                              isUser
                                ? 'bg-gradient-to-br from-slate-900 to-slate-950/80 border-emerald-500/20 text-slate-200 rounded-tr-xs'
                                : 'bg-slate-900/40 border-slate-900/80 text-slate-300 rounded-tl-xs'
                            }`}
                          >
                            {/* Message Header (Sender Info) */}
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                {isUser ? 'You' : 'VectorMind'}
                              </span>
                              <span className="text-[9px] text-slate-600">
                                {msg.timestamp.toLocaleTimeString(undefined, {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>

                            {/* Message Content */}
                            {renderMessageContent(msg)}
                          </div>

                          {/* User Avatar (Right side) */}
                          {isUser && (
                            <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                              <User className="w-4 h-4 text-slate-300" />
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <div ref={chatEndRef} />
                  </>
                )}
              </div>

              {/* Chat Input Container */}
              <div className="p-4 border-t border-slate-900/80 bg-slate-950/80 shrink-0">
                <form
                  onSubmit={handleSearchSubmit}
                  className="relative flex items-center"
                >
                  <input
                    type="text"
                    disabled={isSearchLoading || documents.length === 0}
                    placeholder={
                      documents.length === 0
                        ? "Please index documents first..."
                        : "Ask a question about your documents (e.g. microprocessor syllabus)..."
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3.5 pl-4 pr-14 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isSearchLoading || !searchQuery.trim()}
                    className="absolute right-2 top-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 text-slate-950 p-2 rounded-lg transition disabled:text-slate-500 flex items-center justify-center shadow-lg hover:shadow-emerald-500/10"
                  >
                    {isSearchLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 stroke-[2.5]" />
                    )}
                  </button>
                </form>
                <div className="flex items-center justify-between mt-2 px-1 text-[9px] text-slate-600 font-medium">
                  <span>Enter to submit, Shift+Enter for new line</span>
                  {documents.length > 0 && (
                    <span>Searching over {documents.length} files</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Upload Files Panel */}
          {activeTab === 'upload' && (
            <div className="space-y-6">
              {/* Dropzone */}
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition flex flex-col items-center justify-center ${
                  dragActive
                    ? 'border-emerald-500 bg-emerald-500/5'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-900/20'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".txt,.md,.mdx,.json,.csv,.xml,.js,.ts,.html,.css"
                />
                <UploadCloud className="w-10 h-10 text-slate-500 mb-3" />
                <h3 className="text-sm font-semibold text-slate-300">Drag & Drop files here</h3>
                <p className="text-xs text-slate-500 mt-1">
                  or click to browse your computer
                </p>
                <p className="text-[10px] text-slate-600 mt-2">
                  Supports text, markdown, configuration, or code files (up to 100+ files)
                </p>
              </div>

              {/* Upload Queue */}
              {uploadQueue.length > 0 && (
                <div className="border border-slate-900 rounded-xl overflow-hidden bg-slate-900/10">
                  <div className="bg-slate-900/40 px-4 py-3 border-b border-slate-900 flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold">Upload Queue</h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {successUploadsCount} / {totalUploadsCount} Files Indexed
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={clearQueue}
                        disabled={isUploading}
                        className="text-[10px] text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 px-2.5 py-1.5 rounded font-bold transition disabled:opacity-50"
                      >
                        Clear Queue
                      </button>
                      <button
                        onClick={startUpload}
                        disabled={isUploading}
                        className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-800 text-slate-950 font-bold px-3 py-1.5 rounded text-[10px] flex items-center gap-1 transition"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Indexing...
                          </>
                        ) : (
                          'Start Upload'
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-900 text-xs">
                    {uploadQueue.map(item => (
                      <div key={item.id} className="p-3.5 flex flex-col hover:bg-slate-900/30 transition">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3 min-w-0">
                            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-300 truncate max-w-[200px] sm:max-w-md">{item.file.name}</p>
                              <p className="text-[10px] text-slate-500 mt-px">
                                {(item.file.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center space-x-3 shrink-0">
                            {item.status === 'idle' && (
                              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-semibold">
                                Ready
                              </span>
                            )}
                            {item.status === 'uploading' && (
                              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                {item.progress < 99 ? `Uploading (${item.progress}%)` : 'Embedding...'}
                              </span>
                            )}
                            {item.status === 'success' && (
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                Indexed ({item.chunks} chunks)
                              </span>
                            )}
                            {item.status === 'error' && (
                              <span
                                title={item.error}
                                className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded font-semibold flex items-center gap-1 max-w-[120px] sm:max-w-[200px] truncate cursor-help"
                              >
                                <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                <span className="truncate">{item.error || 'Error'}</span>
                              </span>
                            )}

                            {!isUploading && item.status !== 'success' && (
                              <button
                                onClick={() => removeFromQueue(item.id)}
                                className="text-slate-500 hover:text-slate-300 transition"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Upload Progress Bar */}
                        {item.status === 'uploading' && (
                          <div className="w-full mt-2 bg-slate-950 rounded-full h-1 overflow-hidden relative border border-slate-900">
                            <div
                              className="bg-gradient-to-r from-emerald-500 to-teal-400 h-1 rounded-full transition-all duration-300 ease-out"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Library Manager Panel */}
          {activeTab === 'library' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:max-w-xs">
                  <input
                    type="text"
                    placeholder="Search indexed files..."
                    value={libraryFilter}
                    onChange={(e) => setLibraryFilter(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 pl-9 pr-4 text-xs focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                  />
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                </div>

                <button
                  onClick={fetchLibrary}
                  disabled={isLibraryLoading}
                  className="w-full sm:w-auto text-[10px] text-slate-300 hover:text-slate-100 border border-slate-800 hover:border-slate-700 bg-slate-900/30 px-3.5 py-2 rounded-lg font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLibraryLoading ? 'animate-spin' : ''}`} />
                  Refresh Library
                </button>
              </div>

              {isLibraryLoading && documents.length === 0 ? (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-2" />
                  <p className="text-xs text-slate-500 font-medium">Scanning index database...</p>
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="text-center py-12 border border-slate-900 border-dashed rounded-xl bg-slate-950/20">
                  <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 font-semibold">No documents found</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {libraryFilter ? 'Try clearing your filter search' : 'Index files inside the Upload tab first'}
                  </p>
                </div>
              ) : (
                <div className="border border-slate-900 rounded-xl overflow-hidden bg-slate-950/40">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-900/50 border-b border-slate-900 text-slate-400 font-bold">
                          <th className="p-4">Document Path / Name</th>
                          <th className="p-4">Type</th>
                          <th className="p-4">Total Chunks</th>
                          <th className="p-4">Upload Date</th>
                          <th className="p-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {filteredDocs.map(doc => (
                          <tr key={doc.id} className="hover:bg-slate-900/20 transition">
                            <td className="p-4 font-medium text-slate-300">
                              <div className="truncate max-w-sm" title={doc.path}>
                                {doc.meta?.filename || doc.path}
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-800">
                                {doc.type || 'unknown'}
                              </span>
                            </td>
                            <td className="p-4 font-semibold text-slate-400">{doc.sectionCount}</td>
                            <td className="p-4 text-slate-500">
                              {doc.meta?.uploadedAt
                                ? new Date(doc.meta.uploadedAt).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })
                                : 'Pre-indexed'}
                            </td>
                            <td className="p-4 text-right space-x-2 whitespace-nowrap">
                              {doc.meta?.filename && (
                                <button
                                  onClick={() => {
                                    setPreviewDocUrl(`/uploads/${doc.meta?.filename}`)
                                    setPreviewDocName(doc.meta?.filename || 'Document')
                                  }}
                                  className="text-emerald-400 hover:text-emerald-300 p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded border border-emerald-500/10 transition inline-flex items-center justify-center"
                                  title="Preview Document"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteDocument(doc.id)}
                                disabled={deletingIds.includes(doc.id)}
                                className="text-red-400 hover:text-red-300 disabled:opacity-50 p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded border border-red-500/10 transition inline-flex items-center justify-center"
                                title="Delete Document"
                              >
                                {deletingIds.includes(doc.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: How It Works Panel */}
          {activeTab === 'docs' && (
            <div className="space-y-12 animate-slide-up pb-10">
              
              {/* Header card with gradient background and glow */}
              <div className="relative border border-slate-900 bg-gradient-to-r from-slate-950 via-slate-900/60 to-slate-950 rounded-2xl p-8 overflow-hidden shadow-xl">
                <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
                <div className="relative z-10 max-w-3xl space-y-3">
                  <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                    Hybrid RAG Engine (RRF)
                  </span>
                  <h3 className="text-2xl font-black text-slate-100 tracking-tight mt-2">
                    How VectorMind Processes Your Data
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-medium">
                    VectorMind leverages an advanced **Hybrid Retrieval-Augmented Generation (RAG)** framework. By combining high-dimensional **semantic vectors** (concept matching) with PostgreSQL **full-text search GIN indexing** (literal keyword matching), and fusing them via **Reciprocal Rank Fusion (RRF)**, we guarantee maximum retrieval accuracy and eliminate AI hallucinations.
                  </p>
                </div>
              </div>

              {/* Ingestion Pipeline Flowchart Section */}
              <div className="space-y-6">
                <div className="flex items-center space-x-3 px-1">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <UploadCloud className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-200 uppercase tracking-wider">1. The Document Ingestion Pipeline</h4>
                    <p className="text-[10px] text-slate-500 font-medium">From raw file upload to automated vector embedding and lexical GIN indexation</p>
                  </div>
                </div>

                {/* Horizontal Visual Flowchart Map */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
                  
                  {/* Step 1: Upload */}
                  <div className="bg-slate-900/30 border border-slate-900 hover:border-emerald-500/20 rounded-2xl p-5 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/[0.01] hover:translate-y-[-2px] relative flex flex-col justify-between min-h-[170px]">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-600 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-900">STEP 01</span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
                          <UploadCloud className="w-4 h-4 text-emerald-400" />
                        </div>
                      </div>
                      <h5 className="text-[11px] font-extrabold text-slate-200 tracking-tight">User Document Upload</h5>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Accepts PDFs, MD, text, JSON, and source code. Client converts binary files to safe Base64.
                      </p>
                    </div>
                    <div className="text-[9px] font-mono text-slate-600 border-t border-slate-900/50 pt-2 mt-auto">
                      API: /api/upload
                    </div>
                  </div>

                  {/* Step 2: Parse & Sanitize */}
                  <div className="bg-slate-900/30 border border-slate-900 hover:border-emerald-500/20 rounded-2xl p-5 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/[0.01] hover:translate-y-[-2px] relative flex flex-col justify-between min-h-[170px]">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-600 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-900">STEP 02</span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-emerald-400" />
                        </div>
                      </div>
                      <h5 className="text-[11px] font-extrabold text-slate-200 tracking-tight">Extraction & Sanitation</h5>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        <code>pdf-parse</code> extracts raw text streams. Strips null bytes (<code>\u0000</code>) to prevent DB failure.
                      </p>
                    </div>
                    <div className="text-[9px] font-mono text-slate-600 border-t border-slate-900/50 pt-2 mt-auto">
                      Output: Raw Text
                    </div>
                  </div>

                  {/* Step 3: Chunking */}
                  <div className="bg-slate-900/30 border border-slate-900 hover:border-emerald-500/20 rounded-2xl p-5 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/[0.01] hover:translate-y-[-2px] relative flex flex-col justify-between min-h-[170px]">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-600 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-900">STEP 03</span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
                          <Database className="w-4 h-4 text-emerald-400" />
                        </div>
                      </div>
                      <h5 className="text-[11px] font-extrabold text-slate-200 tracking-tight">Sliding-Window Chunking</h5>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Slices text into 1,000-char blocks with 200-char overlap. Scans for whitespace to prevent word splitting.
                      </p>
                    </div>
                    <div className="text-[9px] font-mono text-slate-600 border-t border-slate-900/50 pt-2 mt-auto">
                      Size: 1000ch, Overlap: 200
                    </div>
                  </div>

                  {/* Step 4: Embedding */}
                  <div className="bg-slate-900/30 border border-slate-900 hover:border-emerald-500/20 rounded-2xl p-5 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/[0.01] hover:translate-y-[-2px] relative flex flex-col justify-between min-h-[170px]">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-600 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-900">STEP 04</span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
                          <Wand className="w-4 h-4 text-emerald-400" />
                        </div>
                      </div>
                      <h5 className="text-[11px] font-extrabold text-slate-200 tracking-tight">Gemini Embeddings</h5>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Queries <code>gemini-embedding-2</code> (using <code>RETRIEVAL_DOCUMENT</code>) to convert chunks into vectors.
                      </p>
                    </div>
                    <div className="text-[9px] font-mono text-slate-600 border-t border-slate-900/50 pt-2 mt-auto">
                      Dimension: 768-Float
                    </div>
                  </div>

                  {/* Step 5: pgvector DB */}
                  <div className="bg-slate-900/30 border border-slate-900 hover:border-emerald-500/20 rounded-2xl p-5 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/[0.01] hover:translate-y-[-2px] relative flex flex-col justify-between min-h-[170px]">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-600 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-900">STEP 05</span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                        </div>
                      </div>
                      <h5 className="text-[11px] font-extrabold text-slate-200 tracking-tight">Database GIN Indexing</h5>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Inserts 768-dim vector. Trigger automatically compiles <code>tsvector</code> lexical words into dynamic GIN search index.
                      </p>
                    </div>
                    <div className="text-[9px] font-mono text-slate-600 border-t border-slate-900/50 pt-2 mt-auto">
                      Auto Trigger Enabled
                    </div>
                  </div>

                </div>
              </div>

              {/* RAG Query Loop Flowchart Section */}
              <div className="space-y-6 pt-4">
                <div className="flex items-center space-x-3 px-1">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Search className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-200 uppercase tracking-wider">2. The Hybrid RAG Retrieval Loop</h4>
                    <p className="text-[10px] text-slate-500 font-medium">Bypassing raw chat defaults to extract highly targeted and relevant document answers</p>
                  </div>
                </div>

                {/* Horizontal Visual Flowchart Map */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
                  
                  {/* Step 1: User Query */}
                  <div className="bg-slate-900/30 border border-slate-900 hover:border-emerald-500/20 rounded-2xl p-5 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/[0.01] hover:translate-y-[-2px] relative flex flex-col justify-between min-h-[170px]">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-600 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-900">STEP 01</span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
                          <MessageSquare className="w-4 h-4 text-emerald-400" />
                        </div>
                      </div>
                      <h5 className="text-[11px] font-extrabold text-slate-200 tracking-tight">Natural Language Query</h5>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        User inputs a question (e.g. &quot;How does 8086 interface memory?&quot;) on the Chat UI.
                      </p>
                    </div>
                    <div className="text-[9px] font-mono text-slate-600 border-t border-slate-900/50 pt-2 mt-auto">
                      API: /api/vector-search
                    </div>
                  </div>

                  {/* Step 2: Vectorization */}
                  <div className="bg-slate-900/30 border border-slate-900 hover:border-emerald-500/20 rounded-2xl p-5 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/[0.01] hover:translate-y-[-2px] relative flex flex-col justify-between min-h-[170px]">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-600 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-900">STEP 02</span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
                          <Wand className="w-4 h-4 text-emerald-400" />
                        </div>
                      </div>
                      <h5 className="text-[11px] font-extrabold text-slate-200 tracking-tight">Query Vectorization</h5>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Converts the active question into a 768-dimension vector using Gemini <code>RETRIEVAL_QUERY</code> embedding configuration.
                      </p>
                    </div>
                    <div className="text-[9px] font-mono text-slate-600 border-t border-slate-900/50 pt-2 mt-auto">
                      Model: gemini-embedding-2
                    </div>
                  </div>

                  {/* Step 3: DB Match */}
                  <div className="bg-slate-900/30 border border-slate-900 hover:border-emerald-500/20 rounded-2xl p-5 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/[0.01] hover:translate-y-[-2px] relative flex flex-col justify-between min-h-[170px]">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-600 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-900">STEP 03</span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
                          <Zap className="w-4 h-4 text-emerald-400" />
                        </div>
                      </div>
                      <h5 className="text-[11px] font-extrabold text-slate-200 tracking-tight">RRF Hybrid Search RPC</h5>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Queries both **pgvector** and **full-text tsvector** indexes, then fuses matches using the **Reciprocal Rank Fusion** algorithm.
                      </p>
                    </div>
                    <div className="text-[9px] font-mono text-slate-600 border-t border-slate-900/50 pt-2 mt-auto">
                      Method: 1 / (60 + Rank)
                    </div>
                  </div>

                  {/* Step 4: Prompt Assembly */}
                  <div className="bg-slate-900/30 border border-slate-900 hover:border-emerald-500/20 rounded-2xl p-5 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/[0.01] hover:translate-y-[-2px] relative flex flex-col justify-between min-h-[170px]">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-600 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-900">STEP 04</span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
                          <AlertCircle className="w-4 h-4 text-emerald-400" />
                        </div>
                      </div>
                      <h5 className="text-[11px] font-extrabold text-slate-200 tracking-tight">RAG Context Prompt</h5>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Packs context fragments and instructions. Auto-returns fallback if no match is found, saving your API limits!
                      </p>
                    </div>
                    <div className="text-[9px] font-mono text-slate-600 border-t border-slate-900/50 pt-2 mt-auto">
                      Bound: 1500 Tokens
                    </div>
                  </div>

                  {/* Step 5: Streaming Response */}
                  <div className="bg-slate-900/30 border border-slate-900 hover:border-emerald-500/20 rounded-2xl p-5 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/[0.01] hover:translate-y-[-2px] relative flex flex-col justify-between min-h-[170px]">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-600 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-900">STEP 05</span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/10 flex items-center justify-center">
                          <Bot className="w-4 h-4 text-emerald-400" />
                        </div>
                      </div>
                      <h5 className="text-[11px] font-extrabold text-slate-200 tracking-tight">Gemini Streaming</h5>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Feeds the unified context to <code>gemini-2.5-flash</code>. AI streams highly cited markdown responses instantly.
                      </p>
                    </div>
                    <div className="text-[9px] font-mono text-slate-600 border-t border-slate-900/50 pt-2 mt-auto">
                      Model: gemini-2.5-flash
                    </div>
                  </div>

                </div>
              </div>

              {/* Grid 2: Storage Architecture & Schemas */}
              <div className="space-y-6 pt-4">
                <div className="flex items-center space-x-3 px-1">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <Database className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-200 uppercase tracking-wider">3. Database Schema & Storage Catalog</h4>
                    <p className="text-[10px] text-slate-500 font-medium">Relational schemas inside Supabase mapping your indexed knowledge base</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* Supabase Catalog Table */}
                  <div className="border border-slate-900 bg-slate-950/40 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center space-x-2 text-emerald-400">
                      <Database className="w-4 h-4" />
                      <h4 className="text-xs font-bold uppercase tracking-wider">Table: nods_page</h4>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-normal">
                      Houses parent-level document records. Stores file check-sums to evaluate if content has changed.
                    </p>
                    <div className="space-y-1.5 font-mono text-[10px] text-slate-300 bg-slate-950 p-3.5 rounded-lg border border-slate-900 leading-normal">
                      <div><span className="text-emerald-400">id</span>: bigint <span className="text-slate-600">(PK, Serial)</span></div>
                      <div><span className="text-emerald-400">parent_page_id</span>: bigint <span className="text-slate-600">(FK)</span></div>
                      <div><span className="text-emerald-400">path</span>: text <span className="text-slate-600">(Unique file URI)</span></div>
                      <div><span className="text-emerald-400">checksum</span>: text <span className="text-slate-600">(SHA-256 string)</span></div>
                      <div><span className="text-emerald-400">type</span>: text <span className="text-slate-600">(&quot;uploaded&quot; | &quot;guide&quot;)</span></div>
                      <div><span className="text-emerald-400">source</span>: text <span className="text-slate-600">(&quot;web_upload&quot;)</span></div>
                      <div><span className="text-emerald-400">meta</span>: jsonb <span className="text-slate-600">(Uploaded timestamp)</span></div>
                    </div>
                  </div>

                  {/* Supabase Section Vector Table */}
                  <div className="border border-slate-900 bg-slate-950/40 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center space-x-2 text-emerald-400">
                      <Database className="w-4 h-4" />
                      <h4 className="text-xs font-bold uppercase tracking-wider">Table: nods_page_section</h4>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-normal">
                      Contains the individual text fragments, their computed vectors, and the auto-updating keyword search indexes.
                    </p>
                    <div className="space-y-1.5 font-mono text-[10px] text-slate-300 bg-slate-950 p-3.5 rounded-lg border border-slate-900 leading-normal">
                      <div><span className="text-emerald-400">id</span>: bigint <span className="text-slate-600">(PK, Serial)</span></div>
                      <div><span className="text-emerald-400">page_id</span>: bigint <span className="text-slate-600">(FK references page)</span></div>
                      <div><span className="text-emerald-400">slug</span>: text <span className="text-slate-600">(Anchor selector)</span></div>
                      <div><span className="text-emerald-400">heading</span>: text <span className="text-slate-600">(Subheading title)</span></div>
                      <div><span className="text-emerald-400">content</span>: text <span className="text-slate-600">(Raw text chunk)</span></div>
                      <div><span className="text-emerald-400">embedding</span>: vector(768) <span className="text-slate-600">(pgvector array)</span></div>
                      <div><span className="text-emerald-400">fts</span>: tsvector <span className="text-slate-600">(Trigger lexical index)</span></div>
                    </div>
                  </div>

                  {/* Filesystem Preview Folder */}
                  <div className="border border-slate-900 bg-slate-950/40 rounded-2xl p-5 space-y-3 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2 text-emerald-400">
                        <FileText className="w-4 h-4" />
                        <h4 className="text-xs font-bold uppercase tracking-wider">Filesystem Previews</h4>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-normal">
                        Preserves physical duplicates of binary uploads locally. This feeds PDF previews to your dashboard in real-time.
                      </p>
                      <div className="bg-slate-950 p-3  rounded-lg border border-slate-900 font-mono text-[10px] text-slate-300">
                        📂 public/uploads/
                      </div>
                    </div>
                    <p className="text-[10px] leading-relaxed text-slate-400 border-t border-slate-900 pt-3 mt-4">
                      When a preview eye icon is clicked in the Library panel, Next.js displays the file on-screen inside a secure, sandboxed PDF iframe.
                    </p>
                  </div>

                </div>
              </div>

              {/* Vector DB & RRF Mathematics detail */}
              <div className="border border-slate-900 bg-slate-950/20 rounded-2xl p-6 space-y-4">
                <div className="flex items-center space-x-2 text-emerald-400">
                  <Wand className="w-4 h-4" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">The Hybrid RRF Search Mathematics</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-400">
                  <div className="space-y-2">
                    <h5 className="font-extrabold text-slate-300 text-[11px] text-emerald-400">Why We Use Negative Dot Product (`&lt;#&gt;`)</h5>
                    <p className="leading-normal">
                      By default, vector search calculates similarity using Cosine Distance. However, calculating Cosine Distance requires computing vector square roots at query time.
                    </p>
                    <p className="leading-normal">
                      Because **Google Gemini** embeddings are L2-normalized (mathematical length is exactly 1), **Negative Dot Product** produces the exact same relevance ranking as Cosine Distance, but executes up to **30% faster** because it operates entirely on simpler scalar addition and multiplication.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h5 className="font-extrabold text-slate-300 text-[11px] text-emerald-400">Understanding tsvector & GIN Indexing</h5>
                    <p className="leading-normal">
                      Full-text search parses text into lexical tokens (words stripped of prefixes/suffixes, e.g. &quot;microprocessors&quot; {"->"} &quot;microprocessor&quot;).
                    </p>
                    <p className="leading-normal">
                      A **Generalized Inverted Index (GIN)** maps every unique word token to its occurrences in the database. When you search, Postgres performs direct keyword intersection matching, making queries execute in milliseconds.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h5 className="font-extrabold text-slate-300 text-[11px] text-emerald-400">Reciprocal Rank Fusion (RRF) Formula</h5>
                    <p className="leading-normal">
                      RRF merges ranked results from multiple search systems (Semantic + Full-text) using the following formula:
                    </p>
                    <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-900 font-mono text-[10px] text-slate-200 mt-2 text-center">
                      Score = 1 / (60 + Semantic_Rank) + 1 / (60 + Keyword_Rank)
                    </div>
                    <p className="leading-normal mt-2">
                      Documents ranking high in **both** indices get heavily promoted, ensuring that precise keywords AND broad concept synonyms both drive the final answer!
                    </p>
                  </div>
                </div>
              </div>

              {/* Google Gemini Rate Limit Info */}
              <div className="border border-amber-500/10 bg-amber-500/[0.02] rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  Google Gemini API Rate Limits & Quota Guidelines
                </div>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">
                  Google Gemini features high-performance generative models in Google AI Studio, governed by strict free-tier rate limits:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-400 mt-3">
                  <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-xl relative">
                    <strong className="text-slate-200 block text-[11px] mb-1.5 text-amber-300">Requests Per Minute (RPM)</strong>
                    The free model has a cap of **15 RPM**. Senders exceeding this rate will receive `429 Too Many Requests` limit errors.
                  </div>
                  <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-xl relative">
                    <strong className="text-slate-200 block text-[11px] mb-1.5 text-amber-300">Requests Per Day (RPD)</strong>
                    Free tier users are allocated **1,500 RPD** globally (or 20 RPD for highly restricted or unverified developer accounts).
                  </div>
                  <div className="p-4 bg-slate-950/60 border border-slate-900 rounded-xl relative">
                    <strong className="text-slate-200 block text-[11px] mb-1.5 text-amber-300">Rate Limit Defenses</strong>
                    To safeguard your API quotas, VectorMind utilizes a sequential queue that paces embeddings during heavy batch uploads.
                  </div>
                </div>
              </div>

            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-900 py-6 bg-slate-950">
          <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
            <p className="font-medium">VectorMind — Built with Next.js, Google Gemini, and Supabase pgvector.</p>
            <div className="flex space-x-4">
              <Link href="https://supabase.com" className="hover:text-slate-300 transition">
                Supabase
              </Link>
              <Link href="https://ai.google.dev" className="hover:text-slate-300 transition">
                Google AI Studio
              </Link>
            </div>
          </div>
        </footer>

        {/* PDF / Document Preview Modal */}
        {previewDocUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col h-[85vh]">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-200 truncate max-w-lg">{previewDocName}</span>
                </div>
                <button
                  onClick={() => {
                    setPreviewDocUrl(null)
                    setPreviewDocName(null)
                  }}
                  className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-800 hover:border-red-500/30 bg-slate-950/40 hover:bg-red-500/10 transition-all duration-200"
                >
                  Close Preview
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 bg-slate-950 p-4">
                <iframe
                  src={previewDocUrl}
                  className="w-full h-full rounded-xl border border-slate-900 bg-slate-900"
                  title="Document Preview"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
