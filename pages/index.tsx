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
  Eye
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
  statusText?: string
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

const SUGGESTIONS = [
  'What is subject 3160712 about?',
  'What is GTU and when was this exam conducted?',
  'Summarize the key points of the Microprocessor syllabus.',
  'How can I interface 8086 with external memory?'
]

export default function Home() {
  const [activeTab, setActiveTab] = useState<'search' | 'upload' | 'library' | 'docs'>('search')
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  const parseSourcesAndText = (rawText: string): { text: string; sources?: string[] } => {
    if (rawText.startsWith('[SOURCES:')) {
      const endIdx = rawText.indexOf(']\n')
      if (endIdx !== -1) {
        const sourcesStr = rawText.slice(9, endIdx)
        const text = rawText.slice(endIdx + 2)
        const sources = sourcesStr ? sourcesStr.split('|') : []
        return { text, sources }
      }
    }
    return { text: rawText }
  }

  const { complete, completion, isLoading: isSearchLoading, error: searchError } = useCompletion({
    api: '/api/vector-search',
    onFinish: (prompt, finishedCompletion) => {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.id === 'completion-active') {
          const updated = [...prev];
          const parsed = parseSourcesAndText(finishedCompletion);
          updated[updated.length - 1] = {
            ...last,
            id: Math.random().toString(),
            text: parsed.text,
            sources: parsed.sources,
            isLoading: false
          };
          return updated;
        }
        return prev;
      });
    }
  })

  // Auto scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Sync streaming completion with the active message bubble
  useEffect(() => {
    if (completion && isSearchLoading) {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.id === 'completion-active') {
          const updated = [...prev];
          const parsed = parseSourcesAndText(completion);
          updated[updated.length - 1] = {
            ...last,
            text: parsed.text,
            sources: parsed.sources,
            isLoading: false
          };
          return updated;
        }
        return prev;
      });
    }
  }, [completion, isSearchLoading]);

  // Sync search error with active message bubble
  useEffect(() => {
    if (searchError) {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.id === 'completion-active') {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            text: `Error generating response: ${searchError.message || 'Please check your connection and try again.'}`,
            isLoading: false
          };
          return updated;
        }
        return prev;
      });
    }
  }, [searchError]);

  // Library State
  const [documents, setDocuments] = useState<IndexedDocument[]>([])
  const [isLibraryLoading, setIsLibraryLoading] = useState(false)
  const [deletingIds, setDeletingIds] = useState<string[]>([])
  const [libraryFilter, setLibraryFilter] = useState('')
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null)
  const [previewDocName, setPreviewDocName] = useState<string | null>(null)
  const [previewDocContent, setPreviewDocContent] = useState<string | null>(null)
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)

  const triggerPreview = async (path: string, displayName: string) => {
    setIsPreviewLoading(true)
    setPreviewDocName(displayName)
    setPreviewDocContent(null)
    setPreviewDocUrl(null)

    const isPDF = displayName.toLowerCase().endsWith('.pdf')
    const isUploaded = path.startsWith('uploaded/')

    if (isPDF && isUploaded) {
      setPreviewDocUrl(`/uploads/${displayName}`)
      setIsPreviewLoading(false)
    } else {
      try {
        const res = await fetch(`/api/documents?path=${encodeURIComponent(path)}`)
        if (res.ok) {
          const data = await res.json()
          setPreviewDocContent(data.content)
        } else {
          setPreviewDocContent("Failed to load document content.")
        }
      } catch (err: any) {
        console.error('Error fetching preview:', err)
        setPreviewDocContent("An error occurred while loading preview.")
      } finally {
        setIsPreviewLoading(false)
      }
    }
  }
  
  // Upload State
  const [uploadQueue, setUploadQueue] = useState<UploadQueueFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

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
    const finalFilesToAdd: File[] = []

    for (const file of files) {
      const isAlreadyIndexed = documents.some(doc => 
        doc.meta?.filename === file.name || 
        doc.path === 'uploaded/' + file.name || 
        doc.path === file.name
      )
      const isAlreadyInQueue = uploadQueue.some(item => item.file.name === file.name)

      if (isAlreadyIndexed || isAlreadyInQueue) {
        const proceed = confirm(`"${file.name}" has already been uploaded/indexed or is in the queue. Do you want to re-upload and overwrite it?`)
        if (!proceed) {
          continue
        }
      }
      finalFilesToAdd.push(file)
    }

    if (finalFilesToAdd.length === 0) return

    const allowedNewFiles = finalFilesToAdd.slice(0, MAX_FILE_COUNT - currentCount)

    if (finalFilesToAdd.length > allowedNewFiles.length) {
      alert(`Queue limit: You can only upload up to ${MAX_FILE_COUNT} files simultaneously in the queue. Extra files were ignored.`)
    }

    const newQueueItems = allowedNewFiles.map(file => {
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
      const isAllowedType = ALLOWED_EXTENSIONS.includes(ext)
      const isAllowedSize = file.size <= MAX_FILE_SIZE

      let status: 'idle' | 'error' = 'idle'
      let error: string | undefined = undefined

      if (!isAllowedType) {
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
    onProgress: (percent: number, statusText: string) => void
  ): Promise<any> => {
    return new Promise(async (resolve, reject) => {
      try {
        onProgress(0, 'Sending file to server...')
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: file.name,
            base64: base64Data,
          }),
        })

        if (!response.ok && !response.headers.get('content-type')?.includes('text/event-stream')) {
          let errorMessage = `Upload failed: Status ${response.status}`
          try {
            const errorData = await response.json()
            errorMessage = errorData.error || errorMessage
          } catch (_) {
            const text = await response.text()
            if (text) errorMessage = text.slice(0, 150)
          }
          return reject(new Error(errorMessage))
        }

        // Read SSE stream for real-time progress
        const reader = response.body?.getReader()
        if (!reader) return reject(new Error('No response body'))

        const decoder = new TextDecoder()
        let buffer = ''
        let finalResult: any = null

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
                if (data.done) {
                  if (data.success) {
                    onProgress(100, 'Complete!')
                    finalResult = data
                  } else {
                    return reject(new Error(data.error || 'Upload failed'))
                  }
                } else {
                  onProgress(data.progress || 0, data.detail || data.step || 'Processing...')
                }
              } catch (_) {
                // ignore parse errors on partial chunks
              }
            }
          }
        }

        if (finalResult) {
          resolve(finalResult)
        } else {
          reject(new Error('Upload stream ended without result'))
        }
      } catch (err) {
        reject(err)
      }
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
      setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading', progress: 0, statusText: 'Reading file...' } : q))

      try {
        const base64Data = await readFileAsBase64(item.file)
        setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, progress: 2, statusText: 'Uploading...' } : q))
        
        const result = await uploadFileWithProgress(item.file, base64Data, (percent, statusText) => {
          setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, progress: percent, statusText } : q))
        })

        setUploadQueue(prev => prev.map(q => q.id === item.id ? {
          ...q,
          status: 'success',
          progress: 100,
          statusText: 'Indexed!',
          chunks: result.chunks
        } : q))
      } catch (err: any) {
        console.error(`Error uploading ${item.file.name}:`, err)
        setUploadQueue(prev => prev.map(q => q.id === item.id ? {
          ...q,
          status: 'error',
          progress: 0,
          statusText: undefined,
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
    
    const userMsg: Message = {
      id: Math.random().toString(),
      role: 'user',
      text: query,
      timestamp: new Date()
    }
    
    const assistantMsg: Message = {
      id: 'completion-active',
      role: 'assistant',
      text: '',
      timestamp: new Date(),
      isLoading: true
    }
    
    setMessages(prev => [...prev, userMsg, assistantMsg])
    
    try {
      await complete(query)
    } catch (err) {
      console.error(err)
    }
  }

  // Trigger search from suggestions
  const handleSuggestionClick = async (suggestion: string) => {
    if (isSearchLoading) return
    
    const userMsg: Message = {
      id: Math.random().toString(),
      role: 'user',
      text: suggestion,
      timestamp: new Date()
    }
    
    const assistantMsg: Message = {
      id: 'completion-active',
      role: 'assistant',
      text: '',
      timestamp: new Date(),
      isLoading: true
    }
    
    setMessages(prev => [...prev, userMsg, assistantMsg])
    
    try {
      await complete(suggestion)
    } catch (err) {
      console.error(err)
    }
  }

  const handleClearChat = () => {
    setMessages([])
  }

  const renderMarkdown = (text: string) => {
    if (!text) return null
    const lines = text.split('\n')
    return lines.map((line, lineIdx) => {
      if (line.startsWith('```')) {
        return null
      }
      
      const isBullet = line.trim().startsWith('* ') || line.trim().startsWith('- ')
      const content = isBullet ? line.replace(/^[\s*-]+/, '') : line

      const formatText = (str: string) => {
        const parts = []
        let lastIdx = 0
        const regex = /(\*\*|`)(.*?)\1/g
        let match
        
        while ((match = regex.exec(str)) !== null) {
          if (match.index > lastIdx) {
            parts.push(str.substring(lastIdx, match.index))
          }
          if (match[1] === '**') {
            parts.push(<strong key={match.index} className="text-emerald-400 font-extrabold">{match[2]}</strong>)
          } else if (match[1] === '`') {
            parts.push(<code key={match.index} className="bg-slate-950/80 px-1.5 py-0.5 rounded text-[11px] text-emerald-350 border border-slate-900 font-mono">{match[2]}</code>)
          }
          lastIdx = regex.lastIndex
        }
        
        if (lastIdx < str.length) {
          parts.push(str.substring(lastIdx))
        }
        
        return parts.length > 0 ? parts : str
      }

      if (isBullet) {
        return (
          <li key={lineIdx} className="ml-4 list-disc text-slate-300 my-1 text-xs">
            {formatText(content)}
          </li>
        )
      }

      if (line.trim() === '') {
        return <div key={lineIdx} className="h-2" />
      }

      return (
        <p key={lineIdx} className="text-slate-300 my-1 text-xs leading-relaxed">
          {formatText(line)}
        </p>
      )
    })
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
        <title>Gemini Chatbot Workspace</title>
        <meta
          name="description"
          content="Premium semantic chatbot for document vector indexing and search, powered by Google Gemini API & Supabase."
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
                  Gemini Chatbot
                </h1>
                <p className="text-[10px] text-slate-500 font-medium">DOCUMENT SEMANTIC SEARCH PLATFORM</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Gemini 2.5 Flash Lite Connected</span>
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
                Dynamic Document Retrieval System
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                Upload up to 100 files simultaneously. Our backend dynamically chunks your text, computes semantic embeddings via Google Gemini, and indexes them instantly.
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
                          {SUGGESTIONS.map((sug, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleSuggestionClick(sug)}
                              className="p-3 text-[11px] text-slate-400 hover:text-slate-200 bg-slate-900/30 hover:bg-slate-900/60 border border-slate-900 hover:border-slate-800 rounded-xl transition text-left font-medium hover:shadow-lg hover:shadow-emerald-500/[0.02]"
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
                                {isUser ? 'You' : 'Gemini Assistant'}
                              </span>
                              <span className="text-[9px] text-slate-600">
                                {msg.timestamp.toLocaleTimeString(undefined, {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>

                            {/* Message Content */}
                            {msg.isLoading ? (
                              <div className="flex items-center space-x-1.5 py-1.5">
                                <span className="text-[10px] text-slate-400 font-semibold mr-1.5">Thinking</span>
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                              </div>
                            ) : (
                              <>
                                <div className="whitespace-pre-wrap">
                                  {isUser ? msg.text : renderMarkdown(msg.text)}
                                </div>
                                {!isUser && msg.sources && msg.sources.length > 0 && (
                                  <div className="mt-3 pt-2.5 border-t border-slate-900/60 flex flex-wrap gap-2 items-center">
                                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Source Documents:</span>
                                    {msg.sources.map((src, srcIdx) => {
                                      const filename = src.split('/').pop() || src
                                      return (
                                        <button
                                          key={srcIdx}
                                          onClick={() => triggerPreview(src, filename)}
                                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 transition"
                                        >
                                          <FileText className="w-3 h-3 text-emerald-500" />
                                          <span>{filename}</span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                              </>
                            )}
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
                              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-semibold flex items-center gap-1 max-w-[180px]">
                                <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0" />
                                <span className="truncate">{item.statusText || `Processing (${item.progress}%)`}</span>
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
                              <button
                                onClick={() => {
                                  triggerPreview(doc.path, doc.meta?.filename || doc.path)
                                }}
                                className="text-emerald-400 hover:text-emerald-300 p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded border border-emerald-500/10 transition inline-flex items-center justify-center"
                                title="Preview Document"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
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
            <div className="space-y-8 animate-slide-up">
              {/* Header card */}
              <div className="border border-slate-900 bg-slate-900/10 rounded-2xl p-6">
                <h3 className="text-base font-bold text-emerald-400 mb-2">Gemini Chatbot System Overview</h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
                  This semantic retrieval platform operates on a **Retrieval-Augmented Generation (RAG)** architecture. When you upload documents, they are sliced, embedded into vector space, and matched dynamically at query time to feed precise matching context back to the Gemini LLM.
                </p>
              </div>

              {/* Grid 1: Pipeline */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Data Ingestion Pipeline */}
                <div className="border border-slate-900 bg-slate-950/40 rounded-xl p-5 space-y-4">
                  <div className="flex items-center space-x-2 text-emerald-400">
                    <UploadCloud className="w-5 h-5" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">1. Data Ingestion Pipeline</h4>
                  </div>
                  <ul className="space-y-3 text-xs text-slate-400">
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                      <span><strong>Document Loading:</strong> Accepts standard text, markdown, or PDF files. PDFs are parsed using Node.js <code>pdf-parse</code>.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                      <span><strong>Text Chunking:</strong> Text content is split into blocks of ~1000 characters with a 200-character overlap to preserve semantic context across chunk boundaries.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                      <span><strong>Sanitation:</strong> Strips invalid characters (e.g. Postgres null-byte escape sequence <code>\u0000</code>) to prevent DB insert crashes.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                      <span><strong>Vector Embedding:</strong> Computes 768-dimension semantic embeddings for each chunk via the <code>text-embedding-004</code> model.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                      <span><strong>pgvector Storage:</strong> Inserts vector embeddings into the <code>nods_page_section</code> table with a cosine distance index.</span>
                    </li>
                  </ul>
                </div>

                {/* Retrieval & Search Flow */}
                <div className="border border-slate-900 bg-slate-950/40 rounded-xl p-5 space-y-4">
                  <div className="flex items-center space-x-2 text-emerald-400">
                    <Search className="w-5 h-5" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">2. Semantic Query & RAG Flow</h4>
                  </div>
                  <ul className="space-y-3 text-xs text-slate-400">
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                      <span><strong>Query Embedding:</strong> Converts the user&apos;s natural query into a 768-dimension vector using the Gemini embedding API.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                      <span><strong>Vector Similarity Search:</strong> Queries Supabase via RPC similarity search function to return the top matching sections by Cosine Distance.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                      <span><strong>Prompt Injection:</strong> Injects query, matching text fragments, and a system instruction prompt containing rules into the context.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />
                      <span><strong>Streaming Completion:</strong> Triggers <code>gemini-2.5-flash</code> via Vercel AI SDK to stream answers back to the UI.</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Grid 2: Storage Architecture & Schemas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Supabase Catalog Table */}
                <div className="border border-slate-900 bg-slate-950/40 rounded-xl p-5 space-y-3">
                  <div className="flex items-center space-x-2 text-emerald-400">
                    <Database className="w-4 h-4" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">Table: nods_page</h4>
                  </div>
                  <p className="text-[10px] text-slate-500">Tracks parent documents catalog metadata.</p>
                  <div className="space-y-1.5 font-mono text-[10px] text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-900">
                    <div><span className="text-emerald-400">id</span>: bigint <span className="text-slate-600">(Primary Key)</span></div>
                    <div><span className="text-emerald-400">path</span>: text <span className="text-slate-600">(File path)</span></div>
                    <div><span className="text-emerald-400">checksum</span>: text <span className="text-slate-600">(SHA-256 validation)</span></div>
                    <div><span className="text-emerald-400">type</span>: text <span className="text-slate-600">(Format classification)</span></div>
                    <div><span className="text-emerald-400">source</span>: text <span className="text-slate-600">(Upload origin)</span></div>
                    <div><span className="text-emerald-400">meta</span>: jsonb <span className="text-slate-600">(Size, Date, Filename)</span></div>
                  </div>
                </div>

                {/* Supabase Section Vector Table */}
                <div className="border border-slate-900 bg-slate-950/40 rounded-xl p-5 space-y-3">
                  <div className="flex items-center space-x-2 text-emerald-400">
                    <Database className="w-4 h-4 animate-pulse" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">Table: nods_page_section</h4>
                  </div>
                  <p className="text-[10px] text-slate-500">Stores chunked text and computed embeddings.</p>
                  <div className="space-y-1.5 font-mono text-[10px] text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-900">
                    <div><span className="text-emerald-400">id</span>: bigint <span className="text-slate-600">(Primary Key)</span></div>
                    <div><span className="text-emerald-400">page_id</span>: bigint <span className="text-slate-600">(Foreign Key)</span></div>
                    <div><span className="text-emerald-400">slug</span>: text <span className="text-slate-600">(Page slug identifier)</span></div>
                    <div><span className="text-emerald-400">heading</span>: text <span className="text-slate-600">(Subheading title)</span></div>
                    <div><span className="text-emerald-400">content</span>: text <span className="text-slate-600">(Raw text fragment)</span></div>
                    <div><span className="text-emerald-400">embedding</span>: vector(768) <span className="text-slate-600">(Cosine index)</span></div>
                  </div>
                </div>

                {/* Filesystem Preview Folder */}
                <div className="border border-slate-900 bg-slate-950/40 rounded-xl p-5 space-y-3">
                  <div className="flex items-center space-x-2 text-emerald-400">
                    <FileText className="w-4 h-4" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">Filesystem Storage</h4>
                  </div>
                  <p className="text-[10px] text-slate-500">Stores binary files for the browser PDF preview modal.</p>
                  <div className="space-y-2 text-xs text-slate-400">
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-900 font-mono text-[10px] text-slate-300">
                      📂 public/uploads/
                    </div>
                    <p className="text-[10px] leading-relaxed text-slate-400">
                      When a document is uploaded, a physical duplicate is written to Next.js local disk storage. This enables client-side <code>&lt;iframe&gt;</code> rendering for instantly viewing PDFs and text in real-time.
                    </p>
                  </div>
                </div>

              </div>

              {/* Limits and Bounds */}
              <div className="border border-slate-900 bg-slate-950/40 rounded-xl p-5 space-y-4">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">Workspace Capabilities & Scale Parameters</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs text-slate-400">
                  <div className="p-3 bg-slate-900/20 border border-slate-900 rounded-lg">
                    <strong className="text-slate-200 block text-[11px] mb-1">Upload Limits</strong>
                    Upload up to <span className="text-emerald-400 font-bold">100+ files</span> simultaneously in a single drop action.
                  </div>
                  <div className="p-3 bg-slate-900/20 border border-slate-900 rounded-lg">
                    <strong className="text-slate-200 block text-[11px] mb-1">Supported Formats</strong>
                    PDFs, Markdown (`.md`, `.mdx`), JSON, Text, CSV, XML, HTML, CSS, JS, and TS.
                  </div>
                  <div className="p-3 bg-slate-900/20 border border-slate-900 rounded-lg">
                    <strong className="text-slate-200 block text-[11px] mb-1">Chunk Partitioning</strong>
                    Automatically chunks document text into <span className="text-emerald-400 font-bold">1,000 character</span> blocks with 200 overlap.
                  </div>
                  <div className="p-3 bg-slate-900/20 border border-slate-900 rounded-lg">
                    <strong className="text-slate-200 block text-[11px] mb-1">Embedding Vector</strong>
                    Generates <span className="text-emerald-400 font-bold">768-dimension</span> embedding coordinates via Google Gemini SDK.
                  </div>
                </div>
              </div>

              {/* API Credentials */}
              <div className="border border-slate-900 bg-slate-950/40 rounded-xl p-5 space-y-3">
                <h4 className="text-xs font-bold text-slate-200">Active API Keys & Environment Variables</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-lg">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">Gemini SDK</div>
                    <code className="text-emerald-400 font-mono text-[11px] block mt-1">GEMINI_API_KEY</code>
                  </div>
                  <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-lg">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">Supabase Client URL</div>
                    <code className="text-emerald-400 font-mono text-[11px] block mt-1">NEXT_PUBLIC_SUPABASE_URL</code>
                  </div>
                  <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-lg">
                    <div className="text-[10px] text-slate-500 font-bold uppercase">Supabase Private Key</div>
                    <code className="text-emerald-400 font-mono text-[11px] block mt-1">SUPABASE_SERVICE_ROLE_KEY</code>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-900 py-6 bg-slate-950">
          <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
            <p className="font-medium">Built with Next.js, Google Gemini, and Supabase pgvector.</p>
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
        {(previewDocUrl || previewDocContent || isPreviewLoading) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col h-[85vh]">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileText className="w-5 h-5 text-emerald-400" />
                  <span className="text-xs font-bold text-slate-200 truncate max-w-lg">{previewDocName || 'Loading Document...'}</span>
                </div>
                <button
                  onClick={() => {
                    setPreviewDocUrl(null)
                    setPreviewDocName(null)
                    setPreviewDocContent(null)
                  }}
                  className="text-xs font-bold text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-950/40 transition"
                >
                  Close Preview
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 bg-slate-950 p-6 overflow-y-auto">
                {isPreviewLoading ? (
                  <div className="w-full h-full flex flex-col items-center justify-center space-y-3 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
                    <span className="text-xs font-semibold">Retrieving document content...</span>
                  </div>
                ) : previewDocUrl ? (
                  <iframe
                    src={previewDocUrl}
                    className="w-full h-full rounded-xl border border-slate-900 bg-slate-900"
                    title="Document Preview"
                  />
                ) : (
                  <div className="text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed max-w-4xl mx-auto selection:bg-emerald-500/20">
                    {previewDocContent}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
