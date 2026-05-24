import Head from 'next/head'
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Search, UploadCloud, Database, Trash2, Loader2, CheckCircle,
  XCircle, FileText, AlertCircle, RefreshCw, Send, Bot, User,
  MessageSquare, Menu, X, PlusCircle, Activity, Info, Zap,
  Folder, FolderPlus, Eye,
  LayoutDashboard, Copy, Square, Check, ChevronDown, BarChart3, Download,
  Link as LinkIcon, Filter, ArrowUpDown, ChevronLeft, ChevronRight,
  ArrowRight, MoreVertical, Edit2, History, Paperclip, AlertTriangle, Sun, Moon, ArrowDown,
  ThumbsUp, ThumbsDown
} from 'lucide-react'
import { useCompletion } from 'ai/react'
import { EMBEDDING_PROVIDER_OPTIONS, CHAT_PROVIDER_OPTIONS, EMBEDDING_PROVIDERS, CHAT_PROVIDERS, type ChatProviderId, type EmbeddingProviderId } from '../lib/providers'

// ─── Markdown Renderer ───────────────────────────────────────────────────────
function renderMarkdown(text: string, onCitationClick?: (id: number) => void): React.ReactNode[] {
  const parseInline = (txt: string) => {
    const parts = txt.split(/(\[[\d,\s]+\]|\*\*.*?\*\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="text-zinc-50 font-semibold">{part.slice(2, -2)}</strong>
      }
      const citMatch = part.match(/^\[([\d,\s]+)\]$/)
      if (citMatch) {
        // User requested to hide inline citations: "i hate this type of thing on it"
        return null
      }
      return <React.Fragment key={i}>{part}</React.Fragment>
    })
  }
  const lines = text.split('\n')
  const nodes: React.ReactNode[] = []
  let ulBuf: string[] = []
  let olBuf: { n: string; t: string }[] = []
  let tableBuf: string[] = []
  let keyCounter = 0
  const nextKey = () => `md-${keyCounter++}`

  const flushUl = () => {
    if (!ulBuf.length) return
    const captured = [...ulBuf]
    ulBuf = []
    nodes.push(
      <ul key={nextKey()} className="my-4 space-y-2.5 list-none bg-[#1a1a1f] rounded-xl p-5 border border-white/5 shadow-sm">
        {captured.map((t, i) => (
          <li key={i} className="flex gap-3 text-zinc-300 text-[14px]">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500/80 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            <span className="leading-relaxed">{parseInline(t)}</span>
          </li>
        ))}
      </ul>
    )
  }
  const flushOl = () => {
    if (!olBuf.length) return
    const captured = [...olBuf]
    olBuf = []
    nodes.push(
      <div key={nextKey()} className="my-5 space-y-3">
        {captured.map((item, i) => (
          <div key={i} className="flex items-center gap-3.5 px-4 py-3 bg-gradient-to-r from-zinc-800/40 to-transparent border-l-2 border-emerald-500/50 rounded-r-xl">
            <span className="shrink-0 w-6 h-6 rounded-md bg-zinc-900 border border-zinc-700/50 flex items-center justify-center text-[11px] font-black text-emerald-400 shadow-sm">
              {item.n}
            </span>
            <span className="font-semibold text-zinc-100 tracking-wide text-[15px]">{parseInline(item.t)}</span>
          </div>
        ))}
      </div>
    )
  }

  const flushTable = () => {
    if (!tableBuf.length) return
    const captured = [...tableBuf]
    tableBuf = []

    const parseRow = (r: string) => {
      let trimmed = r.trim()
      if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
      if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
      return trimmed.split('|').map(c => c.trim())
    }

    const headers = parseRow(captured[0])
    let dataStart = 1
    if (captured.length > 1 && captured[1].includes('---')) {
      dataStart = 2
    }
    const rows = captured.slice(dataStart).map(parseRow)

    nodes.push(
      <div key={nextKey()} className="overflow-x-auto my-5 border border-zinc-800/60 rounded-xl bg-zinc-900/30 custom-scrollbar shadow-sm">
        <table className="w-full text-left text-sm text-zinc-300">
          <thead className="bg-zinc-800/50 text-zinc-100 font-semibold border-b border-zinc-700/50">
            <tr>
              {headers.map((h, i) => <th key={i} className="px-4 py-3 align-top whitespace-nowrap">{parseInline(h)}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                {row.map((cell, j) => <td key={j} className="px-4 py-3 align-top">{parseInline(cell)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  lines.forEach((line) => {
    if (line.trim().startsWith('|')) {
      flushUl(); flushOl()
      tableBuf.push(line)
    } else if (line.startsWith('#### ')) {
      flushUl(); flushOl(); flushTable()
      nodes.push(<h4 key={nextKey()} className="font-bold text-zinc-300 mt-6 mb-2 text-sm uppercase tracking-wider">{parseInline(line.slice(5))}</h4>)
    } else if (line.startsWith('### ')) {
      flushUl(); flushOl(); flushTable()
      nodes.push(<h3 key={nextKey()} className="font-bold text-zinc-200 mt-8 mb-3 text-[16px] flex items-center gap-2"><span className="w-1.5 h-4 bg-emerald-500/80 rounded-full" /> {parseInline(line.slice(4))}</h3>)
    } else if (line.startsWith('## ')) {
      flushUl(); flushOl(); flushTable()
      nodes.push(<h2 key={nextKey()} className="font-black text-white mt-10 mb-4 text-xl tracking-tight">{parseInline(line.slice(3))}</h2>)
    } else if (line.startsWith('# ')) {
      flushUl(); flushOl(); flushTable()
      nodes.push(<h1 key={nextKey()} className="font-black text-white mt-10 mb-6 text-2xl tracking-tight pb-2 border-b border-white/10">{parseInline(line.slice(2))}</h1>)
    } else if (/^(- |\* )/.test(line)) {
      flushOl(); flushTable()
      ulBuf.push(line.slice(2))
    } else if (/^(?:#{1,6}\s*)?\d+\.\s/.test(line)) {
      flushUl(); flushTable()
      const m = line.match(/^(?:#{1,6}\s*)?(\d+)\.\s(.*)$/)
      if (m) olBuf.push({ n: m[1], t: m[2] })
    } else if (line.trim() === '') {
      flushUl(); flushOl(); flushTable()
      nodes.push(<div key={nextKey()} className="h-4" />)
    } else {
      flushUl(); flushOl(); flushTable()
      nodes.push(<p key={nextKey()} className="mb-4 text-zinc-300 leading-relaxed text-[15px]">{parseInline(line)}</p>)
    }
  })
  flushUl(); flushOl(); flushTable()
  return nodes
}


// --- Animated Number Counter ---
function AnimatedNumber({ value, duration = 600, className = '' }: { value: number; duration?: number; className?: string }) {
  const [display, setDisplay] = useState(0)
  const prevRef = useRef(0)
  useEffect(() => {
    const start = prevRef.current
    const diff = value - start
    if (diff === 0) return
    const startTime = performance.now()
    const animate = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setDisplay(Math.round(start + diff * eased))
      if (progress < 1) requestAnimationFrame(animate)
      else prevRef.current = value
    }
    requestAnimationFrame(animate)
  }, [value, duration])
  return <span className={className}>{display.toLocaleString()}</span>
}

// --- Sidebar Toggle Icon ---
function SidebarToggleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  )
}

// --- Mini 7-day Sparkline ---
function MiniSparkline({ value, color = '#1D9E75' }: { value: number; color?: string }) {
  // Generate fake 7-day data ending at current value
  const bars = useMemo(() => {
    const data = []
    for (let i = 0; i < 7; i++) {
      data.push(Math.max(1, Math.round(value * (0.3 + Math.random() * 0.7))))
    }
    data[6] = value
    const max = Math.max(...data, 1)
    return data.map(v => (v / max) * 100)
  }, [value])
  return (
    <div className="flex items-end gap-[2px] h-8 w-16">
      {bars.map((h, i) => (
        <div key={i} className="flex-1 rounded-sm transition-all duration-500" style={{ height: `${Math.max(8, h)}%`, background: i === 6 ? color : `${color}40`, minHeight: '3px' }} />
      ))}
    </div>
  )
}

// --- Typing Indicator ---
function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 py-2 px-3 bg-zinc-900/50 border border-zinc-800/40 rounded-lg w-max text-xs text-zinc-400">
      <span>VectorMind is thinking</span>
      <div className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 bg-zinc-450 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-zinc-450 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-zinc-450 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

// --- Grounding Badge ---
function GroundingBadge({ grounding }: { grounding: { score: number; level: 'high' | 'medium' | 'low'; unsupported_claims: string[] } }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const isHigh = grounding.level === 'high'
  const isMed = grounding.level === 'medium'
  const text = isHigh ? `Grounded ${grounding.score}%` : isMed ? `Check sources ${grounding.score}%` : `Low confidence ${grounding.score}%`
  const colorClass = isHigh ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
    isMed ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
      'bg-red-500/10 text-red-500 border-red-500/20'
  const icon = isHigh ? <CheckCircle className="w-3 h-3" /> : isMed ? <AlertTriangle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />

  return (
    <div className="relative inline-block" onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
      <div className={`cursor-help text-[10px] font-bold px-2.5 py-1 rounded-md border flex items-center gap-1.5 shadow-sm ${colorClass}`}>
        {icon} {text}
      </div>
      {showTooltip && grounding.unsupported_claims && grounding.unsupported_claims.length > 0 && (
        <div className="absolute bottom-full mb-2 left-0 w-64 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl p-3 z-50">
          <div className="text-xs font-semibold text-zinc-300 mb-2">Unsupported Claims</div>
          <ul className="text-[11px] text-zinc-400 space-y-1.5 list-disc pl-3">
            {grounding.unsupported_claims.map((claim, i) => (
              <li key={i}>{claim}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// --- Particle Burst Effect ---
function useParticleBurst() {
  const containerRef = useRef<HTMLDivElement>(null)
  const burst = useCallback((x: number, y: number) => {
    if (!containerRef.current) return
    const colors = ['#1D9E75', '#2BC48E', '#34d399', '#6ee7b7', '#a7f3d0']
    for (let i = 0; i < 12; i++) {
      const el = document.createElement('div')
      el.className = 'particle'
      el.style.left = `${x}px`
      el.style.top = `${y}px`
      el.style.background = colors[i % colors.length]
      const angle = (Math.PI * 2 * i) / 12
      const dist = 30 + Math.random() * 40
      el.style.setProperty('--tx', `${Math.cos(angle) * dist}px`)
      el.style.setProperty('--ty', `${Math.sin(angle) * dist}px`)
      containerRef.current.appendChild(el)
      setTimeout(() => el.remove(), 600)
    }
  }, [])
  return { containerRef, burst }
}

// --- Flow Arrow Between Cards ---
function FlowArrow() {
  return (
    <div className="hidden md:flex items-center justify-center py-1">
      <svg width="40" height="24" viewBox="0 0 40 24" className="text-vm-accent">
        <line x1="20" y1="0" x2="20" y2="18" className="flow-arrow-line" stroke="currentColor" strokeWidth="1.5" fill="none" />
        <circle cx="20" cy="8" r="2" fill="currentColor" className="flow-arrow-dot" />
        <polygon points="14,16 20,24 26,16" fill="currentColor" opacity="0.6" />
      </svg>
    </div>
  )
}

// --- Types ---
interface Project { id: string; name: string; created_at: string; provider?: string; embedding_provider?: string; chat_provider?: string; }
interface IndexedDocument {
  id: string; path: string; checksum: string | null; meta: any; sectionCount: number; projectId: string;
}
interface UploadFile {
  id: string; file: File; status: 'idle' | 'uploading' | 'success' | 'error';
  progress: number; stage: string; error?: string; chunks?: number;
  projectId?: string | null;
}
interface Citation {
  id: number;
  sourceName?: string;
  storageUrl?: string | null;
  chunk: string;
  score: number;
}
interface Message {
  id: string; role: 'user' | 'assistant'; text: string; timestamp: Date;
  isLoading?: boolean; sources?: string[]; confidence?: { level: string; score: string }; sourceUrls?: string[];
  citations?: Citation[];
  error?: boolean;
  cached?: boolean;
  grounding?: { score: number; level: 'high' | 'medium' | 'low'; unsupported_claims: string[] };
  suggestions?: string[];
}
interface ChatChannel {
  id: string; name: string; messages: Message[]; createdAt: string;
}

function getDocName(doc: IndexedDocument): string {
  return doc.meta?.filename || doc.path?.split('/').pop() || doc.path || 'Untitled'
}

function formatDocSize(doc: IndexedDocument): string {
  const bytes = doc.meta?.size
  if (typeof bytes === 'number' && bytes > 0) {
    return bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${(bytes / 1024).toFixed(1)} KB`
  }
  return '—'
}

// --- localStorage helpers ---
const CHAT_STORAGE_KEY = 'vectormind_chats'
const PROVIDER_STORAGE_KEY = 'vectormind_chat_providers'

function loadChannels(projectId: string): ChatChannel[] {
  try {
    const raw = localStorage.getItem(`${CHAT_STORAGE_KEY}_${projectId}`)
    if (!raw) return [{ id: '1', name: 'General', messages: [], createdAt: new Date().toISOString() }]
    const parsed = JSON.parse(raw)
    return parsed.length ? parsed : [{ id: '1', name: 'General', messages: [], createdAt: new Date().toISOString() }]
  } catch { return [{ id: '1', name: 'General', messages: [], createdAt: new Date().toISOString() }] }
}

function saveChannels(projectId: string, channels: ChatChannel[]) {
  try {
    // Strip isLoading messages before saving
    const clean = channels.map(c => ({ ...c, messages: c.messages.filter(m => !m.isLoading || m.text) }))
    localStorage.setItem(`${CHAT_STORAGE_KEY}_${projectId}`, JSON.stringify(clean))
  } catch { }
}

function loadChatProvider(projectId: string): string {
  try {
    const raw = localStorage.getItem(PROVIDER_STORAGE_KEY)
    if (!raw) return 'groq'
    const map = JSON.parse(raw)
    return map[projectId] || 'groq'
  } catch { return 'groq' }
}

function saveChatProvider(projectId: string, provider: string) {
  try {
    const raw = localStorage.getItem(PROVIDER_STORAGE_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[projectId] = provider
    localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(map))
  } catch { }
}

function CustomSelect({ value, onChange, options, title, buttonClassName, containerClassName, dropdownPosition = 'top-full mt-1 left-0 right-0 z-[200] origin-top' }: { value: string, onChange: (val: string) => void, options: { value: string, label: string }[], title?: string, buttonClassName?: string, containerClassName?: string, dropdownPosition?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [ref])

  const selected = options.find(o => o.value === value)

  return (
    <div className={`relative ${containerClassName || 'flex-1'}`} ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen(!open); }}
        className={buttonClassName || "flex h-9 w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 shadow-sm outline-none transition-colors hover:bg-zinc-900 hover:text-zinc-50"}
        title={title}
      >
        <span className="truncate">{selected?.label || value}</span>
        <ChevronDown className={`w-3.5 h-3.5 ml-2 transition-transform duration-200 shrink-0 ${open ? 'rotate-180 text-zinc-50' : 'text-zinc-500'}`} />
      </button>

      {open && (
        <div className={`absolute min-w-full overflow-hidden rounded-lg border border-zinc-850 bg-zinc-950 text-zinc-555 shadow-2xl shadow-black/80 ${dropdownPosition}`}>
          <div className="max-h-[150px] overflow-y-auto custom-scrollbar p-1 flex flex-col gap-0.5">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => { e.preventDefault(); onChange(opt.value); setOpen(false); }}
                className={`flex w-full items-center rounded-md py-1.5 px-2 text-xs outline-none transition-colors ${value === opt.value ? 'bg-zinc-900 text-zinc-50 font-semibold border-l-2 border-emerald-500' : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const { containerRef: particleRef, burst: particleBurst } = useParticleBurst()

  // --- State ---
  const [activeTab, setActiveTab] = useState<'chat' | 'dashboard' | 'database' | 'how-it-works'>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
  const [isStrictRAGMode, setIsStrictRAGMode] = useState(false)
  const toolsMenuRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const uploadAbortControllersRef = useRef<{ [id: string]: AbortController }>({})
  const [showScrollBottom, setShowScrollBottom] = useState(false)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // --- Theme State ---
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('vm-theme')
    if (stored === 'light' || stored === 'dark') {
      setTheme(stored)
      document.documentElement.classList.toggle('light', stored === 'light')
    } else {
      const isSystemLight = window.matchMedia('(prefers-color-scheme: light)').matches
      const defaultTheme = isSystemLight ? 'light' : 'dark'
      setTheme(defaultTheme)
      document.documentElement.classList.toggle('light', isSystemLight)
    }
  }, [])



  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('vm-theme', next)
      document.documentElement.classList.toggle('light', next === 'light')
      return next
    })
  }

  // Advanced File Management
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const [formatFilter, setFormatFilter] = useState<string>('all')

  // Projects State
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string>('')
  const [isCreatingProject, setIsCreatingProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newEmbeddingProvider, setNewEmbeddingProvider] = useState('cohere')
  const [newChatProvider, setNewChatProvider] = useState('groq')
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false)
  const [navbarDropdownOpen, setNavbarDropdownOpen] = useState(false)
  const [sidebarProjSearch, setSidebarProjSearch] = useState('')
  const [navbarProjSearch, setNavbarProjSearch] = useState('')
  const [isCreatingProjectSidebar, setIsCreatingProjectSidebar] = useState(false)
  const [isCreatingProjectNavbar, setIsCreatingProjectNavbar] = useState(false)

  // Documents State
  const [documents, setDocuments] = useState<IndexedDocument[]>([])
  const [isLibraryLoading, setIsLibraryLoading] = useState(false)

  // Enterprise Scale Filtering & Pagination
  const [fileSearchQuery, setFileSearchQuery] = useState('')
  const [dashboardPage, setDashboardPage] = useState(1)
  const ITEMS_PER_PAGE = 25
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' })

  // Search state
  const [searchQuery, setSearchQuery] = useState('')

  // Auto-resize chat input
  useEffect(() => {
    if (chatInputRef.current) {
      chatInputRef.current.style.height = '44px';
      if (searchQuery) {
        chatInputRef.current.style.height = `${Math.min(chatInputRef.current.scrollHeight, 120)}px`;
      }
    }
  }, [searchQuery])
  const [messages, setMessages] = useState<Message[]>([])
  const activeMessageIdRef = useRef<string | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [searchStep, setSearchStep] = useState<'idle' | 'hyde' | 'search' | 'rrf' | 'synth'>('idle')
  const [apiHealth, setApiHealth] = useState<'checking' | 'healthy' | 'error'>('checking')
  const [apiStats, setApiStats] = useState<any>(null)
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null)
  const [isSearchLoading, setIsSearchLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const cancelledUploadsRef = useRef<Set<string>>(new Set())

  // Multi-Chat Channels
  const [chatChannels, setChatChannels] = useState<ChatChannel[]>([])
  const [activeChatId, setActiveChatId] = useState<string>('1')
  const [isCreatingChat, setIsCreatingChat] = useState(false)
  const [newChatName, setNewChatName] = useState('')
  const [chatSearchQuery, setChatSearchQuery] = useState('')
  const [workspaceSearchQuery, setWorkspaceSearchQuery] = useState('')
  const [chatListOpen, setChatListOpen] = useState(false)
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([])
  const [specificFileSearchQuery, setSpecificFileSearchQuery] = useState('')

  // Tab indicators
  const tabRefMap = useRef<Record<string, HTMLButtonElement | null>>({})
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 })

  // Upload state
  const [uploadQueue, setUploadQueue] = useState<UploadFile[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const dbFileInputRef = useRef<HTMLInputElement>(null)
  const [dbDragActive, setDbDragActive] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)

  const [fileSelectorOpen, setFileSelectorOpen] = useState(false)
  const fileSelectorRef = useRef<HTMLDivElement>(null)

  // Rename & Options Dropdowns
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = useState<string>('')
  const [editingChatId, setEditingChatId] = useState<string | null>(null)
  const [editingChatName, setEditingChatName] = useState<string>('')
  const [activeMenuProjectId, setActiveMenuProjectId] = useState<string | null>(null)
  const [activeMenuChatId, setActiveMenuChatId] = useState<string | null>(null)

  // Custom Confirm Modal
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean, title: string, message: string, onConfirm: () => void } | null>(null)

  useEffect(() => {
    if (activeTab === 'chat' && activeProjectId) {
      setTimeout(() => {
        chatInputRef.current?.focus()
      }, 50)
    }
  }, [activeChatId, activeProjectId, activeTab])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (fileSelectorRef.current && !fileSelectorRef.current.contains(event.target as Node)) {
        setFileSelectorOpen(false)
      }
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) {
        setToolsMenuOpen(false)
      }
      const target = event.target as HTMLElement
      if (target && !target.closest('.options-menu-btn') && !target.closest('.options-menu-dropdown')) {
        setActiveMenuProjectId(null)
        setActiveMenuChatId(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [fileSelectorRef])

  useEffect(() => {
    if (window.innerWidth >= 768) setSidebarExpanded(false)
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchProjects() }, [])

  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false)
    }
  }, [activeProjectId, activeChatId])

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects-new')
      if (res.ok) {
        const data = await res.json()
        const enriched = data.map((p: Project) => {
          const localChat = loadChatProvider(p.id)
          return {
            ...p,
            chat_provider: p.chat_provider || localChat || 'groq',
            embedding_provider: p.embedding_provider || p.provider || 'cohere'
          }
        })
        setProjects(enriched)
        if (enriched.length > 0) {
          const savedId = localStorage.getItem('vectormind_active_project')
          if (savedId && enriched.find((p: Project) => p.id === savedId)) {
            setActiveProjectId(savedId)
          } else {
            setActiveProjectId(enriched[0].id)
          }
        }
        else if (enriched.length === 0) setIsCreatingProject(true)
      } else {
        setConfigError("Database disconnected. Run the SQL migration.")
      }
    } catch (e) { setConfigError("Network error. Supabase unavailable.") }
  }

  const checkApiHealth = async () => {
    try {
      const res = await fetch('/api/test-apis')
      if (res.ok) {
        const data = await res.json()
        const supabaseOk = data.supabase?.projects?.ok && data.supabase?.pages?.ok
        const aiOk = data.gemini?.chat?.ok || data.cohere?.chat?.ok || data.groq?.ok || data.openai?.chat?.ok
        if (supabaseOk && aiOk) {
          setApiHealth('healthy')
        } else {
          setApiHealth('error')
        }
        setApiStats(data)
      } else {
        setApiHealth('error')
      }
    } catch {
      setApiHealth('error')
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    checkApiHealth()
  }, [])

  // Save to localStorage when it changes
  useEffect(() => {
    if (activeProjectId) {
      localStorage.setItem('vectormind_active_project', activeProjectId)
    }
  }, [activeProjectId])

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProjectName.trim()) return
    try {
      const res = await fetch('/api/projects-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim(), embedding_provider: newEmbeddingProvider, chat_provider: newChatProvider })
      })
      if (res.ok) {
        const proj = await res.json()
        const enriched = {
          ...proj,
          chat_provider: proj.chat_provider || newChatProvider,
          embedding_provider: proj.embedding_provider || newEmbeddingProvider
        }
        saveChatProvider(enriched.id, enriched.chat_provider)
        setProjects(prev => [enriched, ...prev])
        setActiveProjectId(enriched.id)
        setNewProjectName('')
        setNewEmbeddingProvider('cohere')
        setNewChatProvider('groq')
        setIsCreatingProject(false)
        setProjectDropdownOpen(false)
      }
    } catch (e) { }
  }
  const handleCreateProjectNavbar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProjectName.trim()) return
    try {
      const res = await fetch('/api/projects-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName.trim(), embedding_provider: newEmbeddingProvider, chat_provider: newChatProvider })
      })
      if (res.ok) {
        const proj = await res.json()
        const enriched = {
          ...proj,
          chat_provider: proj.chat_provider || newChatProvider,
          embedding_provider: proj.embedding_provider || newEmbeddingProvider
        }
        saveChatProvider(enriched.id, enriched.chat_provider)
        setProjects(prev => [enriched, ...prev])
        setActiveProjectId(enriched.id)
        setNewProjectName('')
        setIsCreatingProjectNavbar(false)
        setNavbarDropdownOpen(false)
      }
    } catch (err) { }
  }

  const handleUpdateEmbeddingProvider = async (embedding_provider: string) => {
    if (!activeProjectId) return
    setConfirmModal({
      isOpen: true,
      title: 'Warning: Breaking Change',
      message: 'Switching embedding models will break search for existing documents because vector dimensions differ. You must delete all existing files first. Proceed?',
      onConfirm: async () => {
        try {
          const res = await fetch('/api/projects-new', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: activeProjectId, embedding_provider })
          })
          if (res.ok) {
            setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, embedding_provider } : p))
          }
        } catch (e) { }
      }
    })
  }

  const deleteProject = async (id: string, name: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Workspace',
      message: `Are you sure you want to permanently delete the workspace "${name}"? All files, vectors, and chat history inside this workspace will be completely destroyed. This cannot be undone.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
          if (res.ok) {
            setProjects(prev => prev.filter(p => p.id !== id))
            if (activeProjectId === id) {
              const remaining = projects.filter(p => p.id !== id)
              if (remaining.length > 0) setActiveProjectId(remaining[0].id)
              else setActiveProjectId('')
            }
          }
        } catch (e) { }
      }
    })
  }

  const saveProjectRename = async (id: string, name: string) => {
    setEditingProjectId(null)
    if (!name || !name.trim()) return
    // Optimistic UI update
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: name.trim() } : p))
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
      })
      if (!res.ok) {
        console.error('Failed to rename project database')
      }
    } catch (e) {
      console.error('Rename project network error', e)
    }
  }

  const saveChatRename = (id: string, name: string) => {
    setEditingChatId(null)
    if (!name || !name.trim()) return
    const updated = chatChannels.map(c => c.id === id ? { ...c, name: name.trim() } : c)
    setChatChannels(updated)
    if (activeProjectId) saveChannels(activeProjectId, updated)
  }

  const handleUpdateChatProvider = async (chat_provider: string) => {
    if (!activeProjectId) return

    // Optimistic UI update + save to local storage
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, chat_provider } : p))
    saveChatProvider(activeProjectId, chat_provider)

    try {
      const res = await fetch('/api/projects-new', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeProjectId, chat_provider })
      })
      if (!res.ok) {
        console.warn("DB update failed, using local storage fallback for chat provider")
      }
    } catch (e: any) {
      console.warn("Network error, using local storage fallback for chat provider")
    }
  }

  // --- Multi-Chat Channel Management ---
  const createNewChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const name = newChatName.trim() || `Chat ${chatChannels.length + 1}`
    const newChat: ChatChannel = { id: Math.random().toString(), name, messages: [], createdAt: new Date().toISOString() }
    const updated = [newChat, ...chatChannels]
    setChatChannels(updated)
    setActiveChatId(newChat.id)
    setMessages([])
    setNewChatName('')
    setIsCreatingChat(false)
    setChatListOpen(false)
    if (activeProjectId) saveChannels(activeProjectId, updated)
  }

  const switchChat = (id: string) => {
    const chat = chatChannels.find(c => c.id === id)
    if (chat) {
      setActiveChatId(id)
      setMessages(chat.messages)
      setChatListOpen(false)
    }
  }

  const startNewChat = () => {
    const name = `Chat ${chatChannels.length + 1}`
    const newChat: ChatChannel = { id: Math.random().toString(), name, messages: [], createdAt: new Date().toISOString() }
    const updated = [newChat, ...chatChannels]
    setChatChannels(updated)
    setActiveChatId(newChat.id)
    setMessages([])
    setSearchQuery('')
    setChatListOpen(false)
    if (activeProjectId) saveChannels(activeProjectId, updated)
  }

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (chatChannels.length <= 1) {
      // Don't delete the last chat, just clear it
      const cleared = [{ ...chatChannels[0], messages: [] }]
      setChatChannels(cleared)
      setMessages([])
      if (activeProjectId) saveChannels(activeProjectId, cleared)
      return
    }
    const updated = chatChannels.filter(c => c.id !== id)
    setChatChannels(updated)
    if (activeChatId === id) {
      setActiveChatId(updated[0].id)
      setMessages(updated[0].messages)
    }
    if (activeProjectId) saveChannels(activeProjectId, updated)
  }

  // Sync messages to active channel whenever they change
  useEffect(() => {
    if (!activeProjectId || !activeChatId) return
    setChatChannels(prev => {
      const activeChannel = prev.find(c => c.id === activeChatId)
      if (!activeChannel) return prev
      if (JSON.stringify(activeChannel.messages) === JSON.stringify(messages)) return prev
      const updated = prev.map(c => c.id === activeChatId ? { ...c, messages } : c)
      saveChannels(activeProjectId, updated)
      return updated
    })
  }, [messages, activeChatId, activeProjectId])

  // Sliding Tab Indicator Position Updater
  useEffect(() => {
    const updateIndicator = () => {
      const activeBtn = tabRefMap.current[activeTab]
      if (activeBtn) {
        setIndicatorStyle({
          left: activeBtn.offsetLeft,
          width: activeBtn.offsetWidth
        })
      }
    }
    updateIndicator()
    const timer = setTimeout(updateIndicator, 50)
    window.addEventListener('resize', updateIndicator)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', updateIndicator)
    }
  }, [activeTab, projects, activeProjectId])

  // --- Load library when project changes ---
  useEffect(() => {
    if (activeProjectId) {
      fetchLibrary()

      // Reset document selector on workspace change
      setSelectedFileIds([])

      // Load multi-chat channels
      const channels = loadChannels(activeProjectId)
      setChatChannels(channels)
      setActiveChatId(channels[0].id)
      setMessages(channels[0].messages)

      // Apply chat provider from local storage fallback if needed
      const localProvider = loadChatProvider(activeProjectId)
      const project = projects.find(p => p.id === activeProjectId)
      if (project && !project.chat_provider && localProvider) {
        setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, chat_provider: localProvider } : p))
      }

      setFileSearchQuery('')
      setDashboardPage(1)
      setSelectedDocIds([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId])

  const fetchLibrary = async () => {
    if (!activeProjectId) return
    setIsLibraryLoading(true)
    try {
      const res = await fetch(`/api/documents?projectId=${activeProjectId}`)
      if (res.ok) setDocuments(await res.json())
    } catch (err) { console.error(err) } finally { setIsLibraryLoading(false) }
  }

  // --- Enterprise Document Filtering ---
  const filteredAndSortedDocs = useMemo(() => {
    let result = documents

    if (fileSearchQuery.trim()) {
      const query = fileSearchQuery.toLowerCase()
      result = result.filter(d => (d.meta?.filename || d.path).toLowerCase().includes(query))
    }

    if (formatFilter !== 'all') {
      result = result.filter(d => {
        const name = d.meta?.filename || d.path
        return name.toLowerCase().endsWith(formatFilter)
      })
    }

    result = [...result].sort((a, b) => {
      const aVal = sortConfig.key === 'name' ? (a.meta?.filename || a.path) : sortConfig.key === 'size' ? (a.meta?.size || 0) : a.sectionCount
      const bVal = sortConfig.key === 'name' ? (b.meta?.filename || b.path) : sortConfig.key === 'size' ? (b.meta?.size || 0) : b.sectionCount
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [documents, fileSearchQuery, formatFilter, sortConfig])

  const paginatedDocs = useMemo(() => {
    const start = (dashboardPage - 1) * ITEMS_PER_PAGE
    return filteredAndSortedDocs.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredAndSortedDocs, dashboardPage])

  const totalPages = Math.ceil(filteredAndSortedDocs.length / ITEMS_PER_PAGE)

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc'
    setSortConfig({ key, direction })
  }

  const stop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsSearchLoading(false)
      setSearchStep('idle')
      activeMessageIdRef.current = null
    }
  }

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    function handleGlobalClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'A' ||
        target.closest('button') ||
        target.closest('.cursor-pointer') ||
        target.closest('input[type="checkbox"]') ||
        target.closest('.custom-checkbox')
      ) {
        particleBurst(e.clientX, e.clientY)
      }
    }
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [particleBurst])

  const openPreview = (doc: IndexedDocument) => {
    const url = doc.meta?.storageUrl as string | undefined
    const path = doc.meta?.storagePath as string | undefined
    if (url) {
      setPreviewPdfUrl(`/api/proxy?url=${encodeURIComponent(url)}`)
      return
    }
    if (path) {
      setPreviewPdfUrl(`/api/preview/${encodeURIComponent(path)}`)
      return
    }
    setPreviewPdfUrl(`/api/preview/${encodeURIComponent(getDocName(doc))}`)
  }

  const handleSearchSubmit = async (e?: React.FormEvent, overrideQuery?: string) => {
    if (e) e.preventDefault()
    const query = (overrideQuery ?? searchQuery).trim()
    if (!query || !activeProjectId) return

    if (isSearchLoading) {
      stop()
      return
    }

    setSearchQuery('')
    setIsSearchLoading(true)

    const userMsg: Message = { id: Math.random().toString(), role: 'user', text: query, timestamp: new Date() }
    const activeId = Math.random().toString()
    activeMessageIdRef.current = activeId
    const botMsg: Message = { id: activeId, role: 'assistant', text: '', timestamp: new Date(), isLoading: true }

    setMessages(prev => [...prev, userMsg, botMsg])

    setSearchStep('hyde')
    setTimeout(() => setSearchStep('search'), 1200)
    setTimeout(() => setSearchStep('rrf'), 2500)

    const chatHistory = messages.filter(m => !m.isLoading && m.text).slice(-6).map(m => ({ role: m.role, text: m.text }))
    const conversationHistory = messages
      .filter(m => !m.isLoading && m.text && !m.error)
      .slice(-10) // last 5 turns
      .map(m => ({
        role: m.role === 'user' ? 'user' as const : 'assistant' as const,
        content: m.text
      }))
    abortControllerRef.current = new AbortController()

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: query,
          chatHistory,
          conversationHistory,
          projectId: activeProjectId,
          chatProvider: activeProject?.chat_provider || 'groq',
          embeddingProvider: activeProject?.embedding_provider || 'cohere',
          selectedFileIds,
          strictMode: isStrictRAGMode
        }),
        signal: abortControllerRef.current.signal
      })

      if (!res.ok) throw new Error(await res.text())

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No stream response')

      const decoder = new TextDecoder()
      let fullText = ''

      setSearchStep('synth')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.error) {
                throw new Error(data.error)
              }
              if (data.token) {
                fullText += data.token
                setMessages(prev => prev.map(m => m.id === activeId ? { ...m, text: fullText } : m))
              }
              if (data.text_done) {
                setMessages(prev => prev.map(m => m.id === activeId ? { ...m, isLoading: false } : m))
              }
              if (data.done) {
                setMessages(prev => prev.map(m => m.id === activeId ? {
                  ...m,
                  isLoading: false,
                  text: m.text || data.debugAnswer || "The AI generated an empty response. This might be due to a strict system prompt or an API format change.",
                  citations: data.citations,
                  cached: data.cached,
                  grounding: data.grounding,
                  suggestions: data.suggestions
                } : m))
              }

            } catch (err) {
              console.error('SSE Parse Error:', err)
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages(prev => prev.map(m => m.id === activeId ? { ...m, isLoading: false } : m))
      } else {
        setMessages(prev => prev.map(m => m.id === activeId ? { ...m, text: `Error: ${err.message}`, isLoading: false, error: true } : m))
      }
    } finally {
      setIsSearchLoading(false)
      setSearchStep('idle')
      activeMessageIdRef.current = null
      abortControllerRef.current = null
    }
  }

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const stopUpload = async (id: string, filename: string, projectId?: string | null) => {
    cancelledUploadsRef.current.add(id)
    if (uploadAbortControllersRef.current[id]) {
      uploadAbortControllersRef.current[id].abort()
      delete uploadAbortControllersRef.current[id]
    }
    
    // Eagerly remove from UI so it doesn't get stuck if DB is slow
    setUploadQueue(prev => prev.filter(q => q.id !== id))
    
    if (!projectId) return
    
    try {
      await fetch(`/api/documents?filename=${encodeURIComponent(filename)}&projectId=${projectId}`, { method: 'DELETE' })
      fetchLibrary()
    } catch (e) {
      console.error('Failed to clean up aborted upload:', e)
    }
  }

  const removeQueueItem = (id: string) => {
    setUploadQueue(prev => prev.filter(item => item.id !== id))
  }

  const addFilesToQueue = (files: File[]) => {
    if (!activeProjectId) return alert("Select a project first.")
    const newItems = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      status: 'idle' as const,
      progress: 0,
      stage: 'Waiting...',
      projectId: activeProjectId
    }))
    setUploadQueue(prev => [...prev, ...newItems])
    if (window.innerWidth < 768) setSidebarOpen(true)
  }


  const startUpload = async (overrideQueue?: any[]) => {
    if (isUploading || !activeProjectId) return
    setIsUploading(true)
    const queueToProcess = (overrideQueue || uploadQueue).filter(item => item.projectId === activeProjectId)
    for (const item of queueToProcess.filter(q => q.status === 'idle')) {
      if (cancelledUploadsRef.current.has(item.id)) continue;
      
      setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading', progress: 5, stage: 'Uploading & chunking...' } : q))
      try {
        const reader = new FileReader()
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(item.file)
        })

        const controller = new AbortController()
        uploadAbortControllersRef.current[item.id] = controller

        const res = await fetch('/api/upload', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: item.file.name,
            base64,
            projectId: activeProjectId,
            embeddingProvider: activeProject?.embedding_provider || 'cohere'
          })
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || `Upload failed with status ${res.status}`)
        }

        const bodyReader = res.body?.getReader()
        if (!bodyReader) throw new Error('No stream body available')

        const decoder = new TextDecoder()
        let buffer = ''
        let successResult: any = null

        while (true) {
          const { done, value } = await bodyReader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const data = JSON.parse(line)
              if (data.status === 'info') {
                setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, stage: data.message } : q))
              } else if (data.status === 'started') {
                setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, progress: 10, stage: `Chunking into ${data.chunksTotal} units...` } : q))
              } else if (data.status === 'warning') {
                setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, stage: `⚠️ ${data.message}` } : q))
              } else if (data.status === 'chunk') {
                const chunkIndex = data.chunkIndex
                const total = data.total
                const percentage = Math.round(15 + (chunkIndex / total) * 75)
                setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, progress: percentage, stage: `Embedding Chunk ${chunkIndex + 1}/${total} (${data.provider})` } : q))
              } else if (data.status === 'success') {
                successResult = data
              } else if (data.status === 'error') {
                // Return early from the stream processing so the outer block throws it
                throw new Error(`SERVER_ERROR:${data.error}`)
              }
            } catch (e: any) {
              if (e.message && e.message.startsWith('SERVER_ERROR:')) {
                throw new Error(e.message.replace('SERVER_ERROR:', ''))
              }
              console.error('SSE JSON error:', e)
            }
          }
        }

        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer)
            if (data.status === 'success') successResult = data
            if (data.status === 'error') throw new Error(`SERVER_ERROR:${data.error}`)
          } catch (e: any) { 
            if (e.message && e.message.startsWith('SERVER_ERROR:')) {
              throw new Error(e.message.replace('SERVER_ERROR:', ''))
            }
          }
        }

        if (!successResult) {
          throw new Error('Upload stream finished without completion payload')
        }

        setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'success', progress: 100, stage: 'Indexed successfully!', chunks: successResult.chunksIndexed } : q))
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error', error: 'Upload cancelled', stage: 'Cancelled' } : q))
        } else {
          setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'error', progress: 0, stage: 'Failed Ingestion', error: err.message || 'Error occurred' } : q))
        }
      } finally {
        delete uploadAbortControllersRef.current[item.id]
      }
    }
    setIsUploading(false)
    fetchLibrary()
  }

  const deleteDocument = async (id: string, filename: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Document',
      message: `Are you sure you want to permanently delete "${filename}"? Its vector embeddings will be permanently removed from this workspace.`,
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/documents?id=${id}`, { method: 'DELETE' })
          if (res.ok) {
            setDocuments(prev => prev.filter(d => d.id !== id))
            setSelectedDocIds(prev => prev.filter(x => x !== id))
          }
        } catch (e) { }
      }
    })
  }

  const toggleSelectDoc = (id: string) => {
    setSelectedDocIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    )
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const pageDocIds = paginatedDocs.map(d => d.id)
      setSelectedDocIds(prev => Array.from(new Set([...prev, ...pageDocIds])))
    } else {
      const pageDocIds = paginatedDocs.map(d => d.id)
      setSelectedDocIds(prev => prev.filter(id => !pageDocIds.includes(id)))
    }
  }

  const deleteSelectedDocuments = async () => {
    if (selectedDocIds.length === 0) return
    setConfirmModal({
      isOpen: true,
      title: 'Delete Selected Documents',
      message: `Are you sure you want to permanently delete all ${selectedDocIds.length} selected documents? All associated vector embeddings will be destroyed.`,
      onConfirm: async () => {
        setIsLibraryLoading(true)
        try {
          const idsParam = selectedDocIds.join(',')
          const res = await fetch(`/api/documents?id=${idsParam}`, { method: 'DELETE' })
          if (res.ok) {
            setDocuments(prev => prev.filter(d => !selectedDocIds.includes(d.id)))
            setSelectedDocIds([])
          } else {
            alert("Failed to delete some documents")
          }
        } catch (e) {
          console.error(e)
          alert("Error deleting documents")
        } finally {
          setIsLibraryLoading(false)
        }
      }
    })
  }

  const isAllPageSelected = paginatedDocs.length > 0 && paginatedDocs.every(d => selectedDocIds.includes(d.id))

  const totalChunks = documents.reduce((sum, doc) => sum + doc.sectionCount, 0)
  const totalStorageBytes = documents.reduce((sum, doc) => sum + (Number(doc.meta?.size) || 0), 0)
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 KB'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }
  const formattedStorage = formatBytes(totalStorageBytes)
  const activeProject = projects.find(p => p.id === activeProjectId)
  const activeChannel = chatChannels.find(c => c.id === activeChatId)
  const activeChannelName = activeChannel?.name
  const chatProviderId = (activeProject?.chat_provider || 'groq') as ChatProviderId
  const chatProviderLabel = CHAT_PROVIDERS[chatProviderId]?.name?.replace(/ \(.*\)/, '') || 'Groq'
  const embedProviderId = (activeProject?.embedding_provider || 'cohere') as EmbeddingProviderId
  const embedProvider = EMBEDDING_PROVIDERS[embedProviderId]
  const showExpandedSidebar = sidebarExpanded || sidebarOpen

  const toggleSidebarPanel = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(v => !v)
    } else {
      setSidebarExpanded(v => !v)
    }
  }

  const chatComposerBlock = (
    <>
      {selectedFileIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 justify-center">
          {selectedFileIds.map(id => {
            const doc = documents.find(d => d.id === id)
            if (!doc) return null
            return (
              <span key={id} className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] font-medium">
                {getDocName(doc)}
                <button type="button" onClick={() => setSelectedFileIds(prev => prev.filter(x => x !== id))} className="p-0.5 rounded-full hover:bg-emerald-500/20" aria-label="Remove filter"><X className="w-3 h-3" /></button>
              </span>
            )
          })}
          <button type="button" onClick={() => setSelectedFileIds([])} className="text-[11px] text-zinc-500 hover:text-zinc-300 px-2">Clear</button>
        </div>
      )}
      <form onSubmit={handleSearchSubmit} className="vm-pill-input flex items-end gap-1 pl-1.5 pr-2 py-1.5 w-full">
        <div ref={toolsMenuRef} className="relative shrink-0 mb-[2px]">
          <button type="button" onClick={() => setToolsMenuOpen(!toolsMenuOpen)} className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:bg-white/5 hover:text-zinc-100" aria-label="More options">
            <PlusCircle className="w-5 h-5" />
          </button>
          {toolsMenuOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-white/10 bg-[#1e1f20] shadow-xl p-1.5 z-50 animate-slide-up">
              <button type="button" className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-zinc-200 hover:bg-white/5 flex items-center gap-2" onClick={() => { setActiveTab('database'); setTimeout(() => dbFileInputRef.current?.click(), 100); setToolsMenuOpen(false); }}>
                <UploadCloud className="w-4 h-4 text-emerald-400" /> Upload documents
              </button>
              <button type="button" className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-zinc-200 hover:bg-white/5 flex items-center gap-2" onClick={() => { setFileSelectorOpen(!fileSelectorOpen); setToolsMenuOpen(false) }}>
                <Paperclip className="w-4 h-4 text-emerald-400" /> Search specific files
              </button>
              <button type="button" className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-zinc-200 hover:bg-white/5 flex items-center justify-between" onClick={() => { setIsStrictRAGMode(!isStrictRAGMode); setToolsMenuOpen(false) }}>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" /> Only use my DB
                </div>
                {isStrictRAGMode && <Check className="w-4 h-4 text-emerald-400" />}
              </button>
              <button type="button" className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-zinc-200 hover:bg-white/5 flex items-center gap-2" onClick={() => { startNewChat(); setToolsMenuOpen(false) }}>
                <MessageSquare className="w-4 h-4 text-emerald-400" /> New chat
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <textarea 
            ref={chatInputRef} 
            disabled={!activeProjectId} 
            placeholder={!activeProjectId ? 'Create a workspace in the sidebar…' : 'Ask your documents anything…'} 
            value={searchQuery} 
            rows={1}
            onChange={e => {
              setSearchQuery(e.target.value);
              e.target.style.height = '44px';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (searchQuery.trim()) {
                  handleSearchSubmit(e as any);
                  // Reset height after submission
                  setTimeout(() => {
                    if (chatInputRef.current) {
                      chatInputRef.current.style.height = '44px';
                    }
                  }, 10);
                }
              }
            }}
            className="w-full bg-transparent py-2.5 px-1 outline-none text-zinc-100 placeholder:text-zinc-500 text-[15px] disabled:opacity-50 resize-none overflow-x-hidden overflow-y-auto whitespace-pre-wrap break-words leading-relaxed custom-scrollbar block" 
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
        </div>
        <div className="hidden sm:block w-28 shrink-0 mb-1">
          <CustomSelect value={activeProject?.chat_provider || 'groq'} onChange={handleUpdateChatProvider} options={CHAT_PROVIDER_OPTIONS} containerClassName="w-full" buttonClassName="flex h-9 w-full items-center justify-between rounded-full bg-white/5 px-3 text-xs text-zinc-300 hover:bg-white/10 border-0" dropdownPosition="bottom-full mb-2 left-0 right-0 z-[200] origin-bottom" />
        </div>
        {isSearchLoading ? (
          <button type="button" onClick={() => stop()} className="w-9 h-9 shrink-0 rounded-full bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-all flex items-center justify-center shadow-lg shadow-red-500/5 animate-pulse mb-1" aria-label="Stop">
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        ) : (
          <button type="submit" disabled={!searchQuery.trim() || !activeProjectId} className="w-9 h-9 shrink-0 rounded-full bg-emerald-500 text-[#0a0a0c] hover:bg-emerald-450 hover:scale-105 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 disabled:active:scale-100 transition-all flex items-center justify-center shadow-lg shadow-emerald-500/10 mb-1" aria-label="Search">
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        )}
      </form>
      <p className="text-center text-[10px] text-zinc-650 mt-2">
        {selectedFileIds.length === 0
          ? (documents.length === 1 ? 'Searches 1 workspace file' : `Searches all ${documents.length} workspace files`)
          : `Searching ${selectedFileIds.length} selected file(s)`
        } · Embed: <span className="text-emerald-400/80 font-medium">{embedProvider?.name || 'Cohere'}</span> + Chat: <span className="text-emerald-400/80 font-medium">{chatProviderLabel}</span>
      </p>
      {fileSelectorOpen && (
        <div ref={fileSelectorRef} className="mt-2 rounded-xl border border-white/10 bg-[#1e1f20] p-3 max-h-68 overflow-y-auto custom-scrollbar space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-zinc-450 uppercase tracking-wider">Pick files to search (optional)</p>
            {selectedFileIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedFileIds([])}
                className="text-[10px] text-red-400 hover:text-red-300 font-bold transition"
              >
                Clear all ({selectedFileIds.length})
              </button>
            )}
          </div>

          {/* Search box for filtering specific files */}
          <div className="relative">
            <input
              type="text"
              placeholder="Filter files by name..."
              value={specificFileSearchQuery}
              onChange={(e) => setSpecificFileSearchQuery(e.target.value)}
              className="w-full bg-zinc-950/60 hover:bg-zinc-950/80 focus:bg-zinc-950 border border-white/[0.06] focus:border-emerald-500/30 rounded-lg px-2.5 py-1.5 text-xs text-zinc-250 placeholder:text-zinc-600 outline-none transition-all"
            />
            {specificFileSearchQuery && (
              <button
                type="button"
                onClick={() => setSpecificFileSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-550 hover:text-zinc-300 text-[10px] font-bold"
              >
                Clear
              </button>
            )}
          </div>

          <div className="space-y-1 max-h-44 overflow-y-auto custom-scrollbar pr-0.5">
            {documents.length === 0 ? (
              <p className="text-xs text-zinc-500 py-3 text-center">No files uploaded yet.</p>
            ) : (() => {
              const filtered = documents.filter(doc => getDocName(doc).toLowerCase().includes(specificFileSearchQuery.toLowerCase()))
              if (filtered.length === 0) {
                return <p className="text-xs text-zinc-550 py-3 text-center">No matching files found.</p>
              }
              return filtered.map(doc => {
                const isChecked = selectedFileIds.includes(doc.id)
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setSelectedFileIds(prev => isChecked ? prev.filter(id => id !== doc.id) : [...prev, doc.id])}
                    className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-left transition ${isChecked ? 'bg-emerald-500/10 text-emerald-300 font-medium' : 'text-zinc-400 hover:bg-white/5'}`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-700 bg-zinc-900/50'}`}>
                      {isChecked && <Check className="w-2.5 h-2.5 text-[#0a0a0c] stroke-[3]" />}
                    </span>
                    <span className="truncate">{getDocName(doc)}</span>
                  </button>
                )
              })
            })()}
          </div>
        </div>
      )}
    </>
  )

  function navBtn(tab: 'chat' | 'dashboard' | 'database' | 'how-it-works', icon: React.ReactNode, label: string) {
    return (
      <button
        type="button"
        onClick={() => { setActiveTab(tab); if (window.innerWidth < 768) setSidebarOpen(false) }}
        title={label}
        aria-label={label}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${activeTab === tab ? 'bg-white/10 text-emerald-400' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}
      >
        {icon}
      </button>
    )
  }

  // --- Render ---
  return (
    <div className="flex h-[100dvh] w-full bg-[#131314] text-zinc-200 font-sans overflow-hidden selection:bg-zinc-800">
      <Head>
        <title>VectorMind</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </Head>

      {/* Particle Burst Container */}
      <div ref={particleRef} className="fixed inset-0 pointer-events-none z-[9999]" />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <button type="button" className="fixed inset-0 z-40 bg-black/60 md:hidden" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Unified Left Sidebar */}
      <div
        className={`fixed md:relative inset-y-0 left-0 z-50 flex shrink-0 border-r border-white/[0.06] bg-[#1a1a1c] transition-[width] duration-300 ease-out overflow-hidden ${showExpandedSidebar
          ? 'w-[min(100vw,332px)] md:w-[332px]'
          : 'w-0 md:w-[52px] border-r-0 md:border-r'
          }`}
      >
        {/* Leftmost Rail: Icons Only (Always visible on desktop) */}
        <aside className="w-[52px] shrink-0 flex flex-col items-center bg-[#131314] py-3 border-r border-white/[0.03]">
          <button
            type="button"
            onClick={toggleSidebarPanel}
            title={showExpandedSidebar ? "Collapse panel" : "Expand panel"}
            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 mb-2 group transition-all duration-200"
          >
            <SidebarToggleIcon className="w-5 h-5 text-zinc-400 group-hover:text-zinc-200 transition-colors" />
          </button>
          <div className="w-8 border-t border-white/[0.06] my-1" />
          {navBtn('dashboard', <LayoutDashboard className="w-5 h-5" />, 'Dashboard')}
          {navBtn('chat', <MessageSquare className="w-5 h-5" />, 'Chat')}
          {navBtn('database', <Database className="w-5 h-5" />, 'Library')}
          {/* {navBtn('how-it-works', <Info className="w-5 h-5" />, 'How it Works')} */}
          <div className="mt-auto flex flex-col items-center gap-2 pb-2">
            <button
              type="button"
              onClick={checkApiHealth}
              title={apiHealth === 'healthy' ? 'Connected' : apiHealth === 'checking' ? 'Checking…' : 'Setup needed'}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5"
            >
              <span className={`w-2.5 h-2.5 rounded-full ${apiHealth === 'healthy' ? 'bg-emerald-500' : apiHealth === 'checking' ? 'bg-amber-400 animate-pulse' : 'bg-red-500'}`} />
            </button>
          </div>
        </aside>

        {/* Right side of sidebar: Panel content, width 280px */}
        <div className={`flex flex-col h-full w-[280px] shrink-0 transition-opacity duration-200 ${showExpandedSidebar ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="h-14 px-4 flex items-center justify-between shrink-0 border-b border-white/[0.06]">
            <button
              type="button"
              onClick={toggleSidebarPanel}
              className="flex items-center gap-2 group text-left focus:outline-none select-none min-w-0"
              title="Collapse panel"
            >
              <div className="relative w-6 h-6 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-emerald-400 absolute transition-all duration-200 group-hover:opacity-0 group-hover:scale-75 group-hover:rotate-45" />
                <SidebarToggleIcon className="w-5 h-5 text-zinc-400 absolute opacity-0 scale-75 rotate-45 transition-all duration-200 group-hover:opacity-100 group-hover:scale-100 group-hover:rotate-0" />
              </div>
              <span className="font-semibold text-sm text-zinc-100 truncate group-hover:text-emerald-400 transition-colors">VectorMind</span>
            </button>

            {/* Mobile close button */}
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition-all shrink-0"
              title="Close sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Sidebar content conditional on active tab */}
          {activeTab === 'chat' ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Project Switcher */}
              <div className="p-4 border-b border-white/[0.06] relative z-20">
                <div className="text-[11px] font-medium text-zinc-500 mb-2">Workspace</div>
                <div className="relative">
                  <button onClick={() => setProjectDropdownOpen(!projectDropdownOpen)} className="flex h-10 w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 shadow-sm outline-none transition-colors hover:bg-zinc-900 hover:text-zinc-50">
                    <span className="text-sm font-medium truncate pr-2">
                      {activeProject?.name || 'Select Workspace'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-200 ${projectDropdownOpen ? 'rotate-180 text-zinc-50' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {projectDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setProjectDropdownOpen(false)} />
                      <div className="absolute top-full left-0 right-0 mt-1.5 z-50 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 text-zinc-550 shadow-md animate-slide-up origin-top">
                        {/* Search Workspace Input */}
                        <div className="px-2 py-1.5 border-b border-white/[0.04] mb-1">
                          <input
                            type="text"
                            placeholder="Search workspaces..."
                            value={sidebarProjSearch}
                            onChange={(e) => setSidebarProjSearch(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full px-2 py-1.5 bg-zinc-900 border border-white/5 rounded text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-emerald-500/30 transition-all"
                          />
                        </div>

                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                          {projects
                            .filter(p => p.name.toLowerCase().includes(sidebarProjSearch.toLowerCase()))
                            .map(p => (
                              <div key={p.id} className={`w-full flex items-center justify-between rounded-sm text-sm transition-colors ${activeProjectId === p.id ? 'bg-zinc-900 text-zinc-50 font-medium' : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50'}`}>
                                <button onClick={() => { setActiveProjectId(p.id); setProjectDropdownOpen(false); }} className="flex-1 text-left truncate px-2.5 py-2 flex items-center gap-2">
                                  <Folder className={`w-3.5 h-3.5 shrink-0 ${activeProjectId === p.id ? 'text-emerald-450' : 'text-zinc-500'}`} />
                                  {p.name}
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); deleteProject(p.id, p.name); }} className="p-1.5 text-zinc-400 hover:text-red-405 hover:bg-red-500/10 rounded mr-1 transition-all" title="Delete Workspace">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          {projects.filter(p => p.name.toLowerCase().includes(sidebarProjSearch.toLowerCase())).length === 0 && (
                            <div className="px-3 py-4 text-xs text-zinc-500 text-center">No matching workspaces.</div>
                          )}
                        </div>
                        <div className="border-t border-zinc-800 p-2 bg-zinc-950">
                          {isCreatingProject ? (
                            <form onSubmit={handleCreateProject} className="flex flex-col gap-2">
                              <input type="text" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Workspace Name..." className="w-full bg-zinc-955 border border-zinc-800 rounded-md px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-700 transition-colors" autoFocus />
                              <div className="flex gap-1.5 relative z-50">
                                <CustomSelect
                                  value={newEmbeddingProvider}
                                  onChange={setNewEmbeddingProvider}
                                  options={EMBEDDING_PROVIDER_OPTIONS}
                                  title="Embedding Model"
                                />
                                <CustomSelect
                                  value={newChatProvider}
                                  onChange={setNewChatProvider}
                                  options={CHAT_PROVIDER_OPTIONS}
                                  title="Chat Model"
                                />
                              </div>
                              <div className="text-[8px] text-zinc-500 leading-tight my-1">
                                <span className="text-emerald-500 font-bold">Tip:</span> Embedding is permanent per project. Chat LLMs can be freely swapped later!
                              </div>
                              <div className="flex gap-1.5">
                                <button type="submit" disabled={!newProjectName.trim()} className="flex-1 bg-zinc-50 text-zinc-950 px-3 py-1.5 rounded-md font-bold text-xs hover:bg-zinc-200 disabled:opacity-50">Create</button>
                                <button type="button" onClick={() => setIsCreatingProject(false)} className="bg-zinc-900 text-zinc-50 px-3 rounded-md font-bold hover:bg-zinc-800"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            </form>
                          ) : (
                            <button onClick={() => setIsCreatingProject(true)} className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-50 py-2 rounded-md hover:bg-zinc-900 transition-colors">
                              <FolderPlus className="w-3.5 h-3.5" /> Create Workspace
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Chat history */}
              <div className="px-2 py-3 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2 px-2 shrink-0">
                  <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Chats</span>
                  <button type="button" onClick={startNewChat} className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold px-2 py-1 rounded-md hover:bg-emerald-500/10">
                    <PlusCircle className="w-3.5 h-3.5" /> New
                  </button>
                </div>

                {/* Chat Search Bar */}
                <div className="px-2 mb-2 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Search chats..."
                      value={chatSearchQuery}
                      onChange={(e) => setChatSearchQuery(e.target.value)}
                      className="w-full bg-zinc-950/40 hover:bg-zinc-950/60 focus:bg-zinc-950 border border-white/[0.04] focus:border-emerald-500/30 rounded-lg pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-550 outline-none transition-all"
                    />
                    {chatSearchQuery && (
                      <button type="button" onClick={() => setChatSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5 px-1">
                  {chatChannels
                    .filter(c => c.name.toLowerCase().includes(chatSearchQuery.toLowerCase()))
                    .map(c => (
                      <div key={c.id} className={`group flex items-center gap-1 rounded-xl transition-colors relative ${activeChatId === c.id ? 'bg-[#1D9E75]/10 ring-1 ring-[#1D9E75]/25' : 'hover:bg-white/5'}`}>
                        {editingChatId === c.id ? (
                          <div className="flex-1 flex items-center gap-2.5 px-2.5 py-2.5 min-w-0">
                            <MessageSquare className="w-4 h-4 shrink-0 text-emerald-400" />
                            <form
                              onSubmit={(e) => {
                                e.preventDefault()
                                saveChatRename(c.id, editingChatName)
                              }}
                              className="flex-1 min-w-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                value={editingChatName}
                                onChange={(e) => setEditingChatName(e.target.value)}
                                onBlur={() => saveChatRename(c.id, editingChatName)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:border-emerald-500/30"
                                autoFocus
                              />
                            </form>
                          </div>
                        ) : (
                          <button type="button" onClick={() => switchChat(c.id)} className="flex-1 flex items-center gap-2 text-left px-2.5 py-2.5 min-w-0">
                            <MessageSquare className={`w-4 h-4 shrink-0 ${activeChatId === c.id ? 'text-emerald-400' : 'text-zinc-500'}`} />
                            <div className="min-w-0 flex-1">
                              <div className={`text-sm truncate font-medium ${activeChatId === c.id ? 'text-zinc-100' : 'text-zinc-300'}`}>{c.name}</div>
                              <div className="text-[10px] text-zinc-650 truncate">{c.messages.filter(m => m.text).length || 0} messages</div>
                            </div>
                          </button>
                        )}

                        {editingChatId !== c.id && (
                          <div className="relative shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveMenuChatId(activeMenuChatId === c.id ? null : c.id)
                                setActiveMenuProjectId(null)
                              }}
                              className="p-2 mr-1 rounded-lg text-zinc-500 hover:text-zinc-350 transition-colors shrink-0 options-menu-btn"
                              aria-label="Options"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>

                            {activeMenuChatId === c.id && (
                              <div className="absolute right-1 top-full mt-0.5 w-28 rounded-lg border border-white/10 bg-[#1e1f20] shadow-xl p-1 z-50 text-left options-menu-dropdown">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setEditingChatId(c.id)
                                    setEditingChatName(c.name)
                                    setActiveMenuChatId(null)
                                  }}
                                  className="w-full text-left px-2 py-1.5 rounded text-xs text-zinc-200 hover:bg-white/5 flex items-center gap-1.5"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-zinc-400" /> Rename
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    deleteChat(c.id, e as any)
                                    setActiveMenuChatId(null)
                                  }}
                                  className="w-full text-left px-2 py-1.5 rounded text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-1.5 font-bold"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-red-450" /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Workspaces List (Dashboard View) */}
              <div className="p-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
                <span className="text-[10px] font-bold text-zinc-555 uppercase tracking-wider flex items-center gap-1.5"><Folder className="w-3.5 h-3.5" /> Workspaces</span>
                <button
                  type="button"
                  onClick={() => setIsCreatingProject(true)}
                  className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold px-2 py-1 rounded-md hover:bg-emerald-500/10"
                >
                  <PlusCircle className="w-3.5 h-3.5" /> Create
                </button>
              </div>

              {/* Workspace Search Bar */}
              <div className="px-3 mb-2 mt-2 shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search workspaces..."
                    value={workspaceSearchQuery}
                    onChange={(e) => setWorkspaceSearchQuery(e.target.value)}
                    className="w-full bg-zinc-950/40 hover:bg-zinc-950/60 focus:bg-zinc-950 border border-white/[0.04] focus:border-emerald-500/30 rounded-lg pl-8 pr-7 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-550 outline-none transition-all"
                  />
                  {workspaceSearchQuery && (
                    <button type="button" onClick={() => setWorkspaceSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
                {projects
                  .filter(p => p.name.toLowerCase().includes(workspaceSearchQuery.toLowerCase()))
                  .map(p => (
                    <div key={p.id} className={`group flex items-center gap-1 rounded-xl transition-all relative ${activeProjectId === p.id ? 'bg-[#1D9E75]/10 border-l-2 border-[#1D9E75]' : 'hover:bg-white/5 border-l-2 border-transparent'}`}>
                      {editingProjectId === p.id ? (
                        <div className="flex-1 flex items-center gap-2.5 px-2.5 py-3 min-w-0">
                          <Folder className="w-4 h-4 shrink-0 text-emerald-400" />
                          <form
                            onSubmit={(e) => {
                              e.preventDefault()
                              saveProjectRename(p.id, editingProjectName)
                            }}
                            className="flex-1 min-w-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editingProjectName}
                              onChange={(e) => setEditingProjectName(e.target.value)}
                              onBlur={() => saveProjectRename(p.id, editingProjectName)}
                              className="w-full bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5 text-xs text-zinc-100 outline-none focus:border-emerald-500/30"
                              autoFocus
                            />
                          </form>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setActiveProjectId(p.id)}
                          className="flex-1 flex items-center gap-2.5 text-left px-2.5 py-3 min-w-0"
                        >
                          <Folder className={`w-4 h-4 shrink-0 ${activeProjectId === p.id ? 'text-emerald-400' : 'text-zinc-500'}`} />
                          <div className="min-w-0 flex-1">
                            <div className={`text-sm truncate font-medium ${activeProjectId === p.id ? 'text-zinc-100' : 'text-zinc-300'}`}>{p.name}</div>
                            <div className="text-[10px] text-zinc-550 truncate uppercase tracking-wider font-bold text-[8px] flex items-center gap-1.5 mt-0.5">
                              <span>Embed:</span> <span className="text-emerald-400 font-semibold">{p.embedding_provider || 'cohere'}</span>
                              <span className="text-zinc-700">·</span>
                              <span>Chat:</span> <span className="text-zinc-400">{p.chat_provider || 'groq'}</span>
                            </div>
                          </div>
                        </button>
                      )}

                      {editingProjectId !== p.id && (
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setActiveMenuProjectId(activeMenuProjectId === p.id ? null : p.id)
                              setActiveMenuChatId(null)
                            }}
                            className="p-2 mr-1 rounded-lg text-zinc-500 hover:text-zinc-350 transition-colors shrink-0 options-menu-btn"
                            title="Options"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>

                          {activeMenuProjectId === p.id && (
                            <div className="absolute right-1 top-full mt-0.5 w-28 rounded-lg border border-white/10 bg-[#1e1f20] shadow-xl p-1 z-50 text-left options-menu-dropdown">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditingProjectId(p.id)
                                  setEditingProjectName(p.name)
                                  setActiveMenuProjectId(null)
                                }}
                                className="w-full text-left px-2 py-1.5 rounded text-xs text-zinc-200 hover:bg-white/5 flex items-center gap-1.5"
                              >
                                <Edit2 className="w-3.5 h-3.5 text-zinc-400" /> Rename
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteProject(p.id, p.name)
                                  setActiveMenuProjectId(null)
                                }}
                                className="w-full text-left px-2 py-1.5 rounded text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-1.5 font-bold"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-450" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                {projects.length === 0 && (
                  <div className="text-zinc-500 text-center py-6 text-xs">No workspaces found.</div>
                )}
              </div>

              {/* Quick Workspace Creation form at bottom */}
              <div className="p-4 border-t border-white/[0.06] bg-zinc-950/20">
                {isCreatingProject ? (
                  <form onSubmit={handleCreateProject} className="flex flex-col gap-2 bg-zinc-950 p-3.5 rounded-xl border border-zinc-800 animate-slide-up">
                    <input type="text" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="Workspace Name..." className="w-full bg-zinc-950 border border-zinc-850 rounded-md px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-zinc-700 transition-colors" autoFocus />
                    <div className="flex gap-1.5 relative z-50">
                      <CustomSelect value={newEmbeddingProvider} onChange={setNewEmbeddingProvider} options={EMBEDDING_PROVIDER_OPTIONS} title="Embedding Model" />
                      <CustomSelect value={newChatProvider} onChange={setNewChatProvider} options={CHAT_PROVIDER_OPTIONS} title="Chat Model" />
                    </div>
                    <div className="flex gap-1.5 mt-1">
                      <button type="submit" disabled={!newProjectName.trim()} className="flex-1 bg-zinc-50 text-zinc-950 px-3 py-1.5 rounded-md font-bold text-xs hover:bg-zinc-200 disabled:opacity-50">Create</button>
                      <button type="button" onClick={() => setIsCreatingProject(false)} className="bg-zinc-900 text-zinc-50 px-3 rounded-md font-bold hover:bg-zinc-800"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </form>
                ) : (
                  <button
                    onClick={() => setIsCreatingProject(true)}
                    className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-50 py-2.5 rounded-xl border border-dashed border-zinc-800 hover:border-emerald-500/30 transition-all hover:bg-white/[0.01]"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-emerald-400" /> Create Workspace
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 relative z-10">
        <div className="h-14 border-b border-white/[0.06] bg-[#131314]/90 backdrop-blur-xl flex items-center justify-between px-4 shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button type="button" onClick={() => setSidebarOpen(true)} className="md:hidden p-2 rounded-full hover:bg-white/5 text-zinc-400 hover:text-zinc-200 transition-colors shrink-0"><SidebarToggleIcon className="w-5 h-5" /></button>

            {/* Active Tab Badge */}
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md shrink-0 select-none">
              {activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'chat' ? 'Chat' : activeTab === 'database' ? 'Library' : 'How it Works'}
            </span>

            <span className="text-zinc-700 text-xs shrink-0 select-none">/</span>            {/* Workspace Indicator Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNavbarDropdownOpen(!navbarDropdownOpen)}
                className="text-xs font-semibold text-zinc-300 hover:text-zinc-100 flex items-center gap-1.5 min-w-0 bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-lg border border-white/[0.04] transition-all cursor-pointer select-none"
              >
                <Folder className="w-3.5 h-3.5 text-emerald-450 shrink-0" />
                <span className="truncate max-w-[120px] sm:max-w-[200px]" title={activeProject?.name || 'No Workspace'}>
                  {activeProject?.name || 'Select Workspace'}
                </span>
                <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
              </button>
              {navbarDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNavbarDropdownOpen(false)} />
                  <div className="fixed top-14 left-0 mt-0.5 w-64 rounded-xl border border-white/10 bg-[#1e1f20] shadow-xl p-1.5 z-50 text-left animate-slide-up">
                    <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest px-2.5 py-1.5 border-b border-white/[0.04] mb-1.5">Switch Workspace</p>

                    {/* Search Workspace Input */}
                    <div className="px-2 py-1 mb-2">
                      <input
                        type="text"
                        placeholder="Search workspaces..."
                        value={navbarProjSearch}
                        onChange={(e) => setNavbarProjSearch(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full px-2 py-1.5 bg-zinc-900 border border-white/5 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-emerald-500/30 transition-all"
                      />
                    </div>

                    <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-0.5 px-0.5">
                      {projects
                        .filter(p => p.name.toLowerCase().includes(navbarProjSearch.toLowerCase()))
                        .map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setActiveProjectId(p.id)
                              setNavbarDropdownOpen(false)
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition flex items-center gap-2 ${activeProjectId === p.id
                              ? 'bg-[#1D9E75]/10 text-emerald-400 font-semibold'
                              : 'text-zinc-300 hover:bg-white/5'
                              }`}
                          >
                            <Folder className={`w-3.5 h-3.5 shrink-0 ${activeProjectId === p.id ? 'text-emerald-400' : 'text-zinc-500'}`} />
                            <span className="truncate flex-1">{p.name}</span>
                          </button>
                        ))}
                      {projects.filter(p => p.name.toLowerCase().includes(navbarProjSearch.toLowerCase())).length === 0 && (
                        <div className="text-[10px] text-zinc-555 text-center py-4">No matching workspaces.</div>
                      )}
                    </div>

                    {/* Create Workspace Inline Form */}
                    <div className="border-t border-white/[0.04] mt-2 pt-2 px-1 bg-zinc-950/20 rounded-b-xl">
                      {isCreatingProjectNavbar ? (
                        <form
                          onSubmit={handleCreateProjectNavbar}
                          onClick={(e) => e.stopPropagation()}
                          className="flex flex-col gap-2 p-1.5"
                        >
                          <input
                            type="text"
                            placeholder="Workspace name..."
                            autoFocus
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-white/5 rounded-lg text-xs text-zinc-200 outline-none focus:border-emerald-500/30"
                          />
                          <div className="flex gap-1.5 justify-end">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setIsCreatingProjectNavbar(false); }}
                              className="px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-200"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-450 text-[#0a0a0c] font-bold text-[10px] rounded"
                            >
                              Create
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setIsCreatingProjectNavbar(true); }}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg hover:bg-white/5 text-[11px] text-emerald-400 font-semibold transition"
                        >
                          <FolderPlus className="w-3.5 h-3.5 text-emerald-400" /> Create Workspace
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {activeTab === 'chat' && activeChannelName && (
              <>
                <span className="text-zinc-700 text-xs shrink-0 select-none">/</span>
                <div className="flex items-center gap-1 bg-[#1D9E75]/10 text-emerald-400 px-2.5 py-1.5 rounded-lg border border-[#1D9E75]/20 text-xs font-semibold max-w-[100px] sm:max-w-[150px] truncate select-none shadow-sm shadow-[#1D9E75]/5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-450 shrink-0" />
                  <span className="truncate">{activeChannelName}</span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {mounted && (
              <button
                onClick={toggleTheme}
                title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-emerald-400 border border-white/[0.04] transition-all no-invert"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            )}
            {isLibraryLoading && <Loader2 className="w-4 h-4 animate-spin text-zinc-550" />}
            {activeTab === 'chat' && activeProjectId && (
              <button
                type="button"
                onClick={startNewChat}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 hover:bg-white/5 text-zinc-300 hover:text-zinc-100 text-xs font-semibold transition-colors"
                title="New chat"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New Chat</span>
              </button>
            )}
          </div>
        </div>

        {configError && (
          <div className="bg-red-950/20 border-b border-red-900/30 text-red-400 p-3 text-xs font-medium flex items-center gap-2 justify-center backdrop-blur-md">
            <AlertCircle className="w-4 h-4" /> {configError}
          </div>
        )}

        {/* --- View: Dashboard (Project DB) --- */}
        {activeTab === 'dashboard' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-[#131314]">
            <div className="max-w-6xl mx-auto animate-page-load space-y-8">

              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-zinc-400 font-bold text-sm tracking-widest uppercase mb-1">
                    <BarChart3 className="w-4 h-4 text-zinc-500" /> Enterprise Analytics
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold text-zinc-100">{activeProject?.name || 'Workspace'}</h2>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setActiveTab('database')} className="flex items-center gap-2 px-3.5 py-2 border border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50 rounded-md text-xs font-semibold transition-colors">
                    <Database className="w-4 h-4 text-emerald-450" /> View Library
                  </button>
                  <button onClick={() => setActiveTab('chat')} className="flex items-center gap-2 px-3.5 py-2 border border-zinc-800 bg-transparent text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50 rounded-md text-xs font-semibold transition-colors">
                    <MessageSquare className="w-4 h-4 text-zinc-400" /> Chat
                  </button>
                </div>
              </div>

              {/* Stats Cards Grid (4 columns) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                <button
                  onClick={() => setActiveTab('database')}
                  className="w-full text-left bg-zinc-900/30 border border-zinc-850 hover:border-emerald-500/25 hover:bg-zinc-900/50 rounded-md p-6 relative overflow-hidden group transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-bold text-zinc-550 uppercase tracking-widest">Total Files</div>
                    <MiniSparkline value={documents.length} color="#1D9E75" />
                  </div>
                  <div className="text-5xl font-black text-zinc-100"><AnimatedNumber value={documents.length} /></div>
                  <div className="text-[10px] text-zinc-500 mt-2 font-medium">+{Math.min(documents.length, 1)} today</div>
                </button>

                <button
                  onClick={() => setActiveTab('database')}
                  className="w-full text-left bg-zinc-900/30 border border-zinc-850 hover:border-emerald-500/25 hover:bg-zinc-900/50 rounded-md p-6 relative overflow-hidden group transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-bold text-zinc-550 uppercase tracking-widest">Vector Chunks</div>
                    <MiniSparkline value={totalChunks} color="#1D9E75" />
                  </div>
                  <div className="text-5xl font-black text-zinc-100"><AnimatedNumber value={totalChunks} /></div>
                  <div className="text-[10px] text-zinc-500 mt-2 font-medium">last sync just now</div>
                </button>

                <button
                  onClick={() => setActiveTab('chat')}
                  className="w-full text-left bg-zinc-900/30 border border-zinc-850 hover:border-emerald-500/25 hover:bg-zinc-900/50 rounded-md p-6 relative overflow-hidden group transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-bold text-zinc-550 uppercase tracking-widest">Total Chats</div>
                    <MiniSparkline value={chatChannels.length} color="#1D9E75" />
                  </div>
                  <div className="text-5xl font-black text-zinc-100"><AnimatedNumber value={chatChannels.length} /></div>
                  <div className="text-[10px] text-zinc-500 mt-2 font-medium">active sessions</div>
                </button>

                <button
                  onClick={() => setActiveTab('database')}
                  className="w-full text-left bg-zinc-900/30 border border-zinc-850 hover:border-emerald-500/25 hover:bg-zinc-900/50 rounded-md p-6 relative overflow-hidden group transition-all duration-300"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-bold text-zinc-555 uppercase tracking-widest">Storage Volume</div>
                    <MiniSparkline value={totalStorageBytes > 0 ? 100 : 0} color="#1D9E75" />
                  </div>
                  <div className="text-4xl font-black text-zinc-100 mt-1">{formattedStorage}</div>
                  <div className="text-[10px] text-zinc-500 mt-3 font-medium">raw workspace content</div>
                </button>
              </div>

              {/* Layout split: limits on left, providers select on right */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 items-start">
                {/* Left: API limits quotas (2/3 width) */}
                <div className="lg:col-span-2 bg-zinc-900/30 border border-zinc-850 rounded-md p-5 shadow-inner">
                  <div className="flex items-center gap-2 text-zinc-450 font-bold text-[10px] uppercase tracking-widest mb-3">
                    <Activity className="w-3.5 h-3.5" /> API Quotas & Limits
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-zinc-400">
                    <div className="bg-zinc-950 p-3.5 rounded-md border border-zinc-850 relative overflow-hidden group">
                      <div className="text-zinc-250 font-bold mb-1.5 flex justify-between items-center">
                        Gemini API
                        <div className="flex items-center gap-1.5">
                          {!apiStats?.gemini?.chat?.ok && (
                            <div className="tooltip-wrapper">
                              <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold bg-red-955/20 text-red-400 animate-shake">
                                {apiStats?.gemini?.chat?.error?.error?.status === 'RESOURCE_EXHAUSTED' ? 'QUOTA EXCEEDED' : 'OFFLINE'}
                              </span>
                              <span className="tooltip-text">
                                {apiStats?.gemini?.chat?.error?.error?.message || 'Gemini API test failed. Check key configuration.'}
                              </span>
                            </div>
                          )}
                          {!apiStats?.gemini?.chat?.ok && (
                            <button onClick={() => handleUpdateChatProvider('groq')} className="text-[8px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded transition-colors">
                              Switch →
                            </button>
                          )}
                          {apiStats?.gemini?.chat?.ok && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold bg-emerald-950/20 text-emerald-400 border border-emerald-900/20">ONLINE</span>
                          )}
                        </div>
                      </div>
                      <div className="font-mono text-[10px]">15 Req/Min • 1,500 Req/Day</div>
                    </div>
                    <div className="bg-zinc-950 p-3.5 rounded-md border border-zinc-850 relative overflow-hidden group">
                      <div className="text-zinc-250 font-bold mb-1.5 flex justify-between items-center">
                        Cohere API
                        <div className="flex items-center gap-1.5">
                          {!apiStats?.cohere?.chat?.ok && (
                            <div className="tooltip-wrapper">
                              <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold bg-red-955/20 text-red-400 animate-shake">OFFLINE</span>
                              <span className="tooltip-text">
                                {apiStats?.cohere?.chat?.error?.message || apiStats?.cohere?.error || 'Cohere API test failed. Check key configuration.'}
                              </span>
                            </div>
                          )}
                          {!apiStats?.cohere?.chat?.ok && (
                            <button onClick={() => handleUpdateChatProvider('groq')} className="text-[8px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded transition-colors">
                              Switch →
                            </button>
                          )}
                          {apiStats?.cohere?.chat?.ok && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold bg-emerald-950/20 text-emerald-400 border border-emerald-900/20">ONLINE</span>
                          )}
                        </div>
                      </div>
                      <div className="font-mono text-[10px]">10 Req/Min • 1,000 Req/Month</div>
                    </div>
                    <div className="bg-zinc-950 p-3.5 rounded-md border border-zinc-850 relative overflow-hidden group">
                      <div className="text-zinc-250 font-bold mb-1.5 flex justify-between items-center">
                        Groq API
                        <div className="flex items-center gap-1.5">
                          {!apiStats?.groq?.ok && (
                            <div className="tooltip-wrapper">
                              <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold bg-red-955/20 text-red-400 animate-shake">
                                {apiStats?.groq?.error ? 'OFFLINE' : 'KEY MISSING'}
                              </span>
                              <span className="tooltip-text">
                                {apiStats?.groq?.error?.error?.message || apiStats?.groq?.error?.message || apiStats?.groq?.error || 'Groq API key not configured. Add GROQ_API_KEY to .env.local'}
                              </span>
                            </div>
                          )}
                          {!apiStats?.groq?.ok && (
                            <button onClick={() => handleUpdateChatProvider('gemini')} className="text-[8px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded transition-colors">
                              Switch →
                            </button>
                          )}
                          {apiStats?.groq?.ok && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold bg-emerald-950/20 text-emerald-400 border border-emerald-900/20">ONLINE</span>
                          )}
                        </div>
                      </div>
                      <div className="font-mono text-[10px]">30 Req/Min • 14,400 Tokens/Min</div>
                    </div>
                    <div className="bg-zinc-950 p-3.5 rounded-md border border-zinc-850 relative overflow-visible group">
                      <div className="text-zinc-250 font-bold mb-1.5 flex justify-between items-center">
                        OpenAI (ChatGPT)
                        <div className="flex items-center gap-1.5">
                          {!apiStats?.openai?.chat?.ok && apiStats?.openai && (
                            <div className="tooltip-wrapper">
                              <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold bg-red-955/20 text-red-400 animate-shake">
                                {apiStats?.openai?.chat?.error?.error?.code === 'insufficient_quota' ? 'QUOTA EXCEEDED' : 'OFFLINE'}
                              </span>
                              <span className="tooltip-text">
                                {apiStats?.openai?.chat?.error?.error?.message ||
                                  apiStats?.openai?.chat?.error?.message ||
                                  apiStats?.openai?.error ||
                                  'OpenAI API verification failed. Please check key/billing.'}
                              </span>
                            </div>
                          )}
                          {!apiStats?.openai?.chat?.ok && (
                            <button onClick={() => handleUpdateChatProvider('cohere')} className="text-[8px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded transition-colors">
                              Switch →
                            </button>
                          )}
                          {apiStats?.openai?.chat?.ok && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold bg-emerald-950/20 text-emerald-400 border border-emerald-900/20">ONLINE</span>
                          )}
                        </div>
                      </div>
                      <div className="font-mono text-[10px]">gpt-4o-mini · embed-3-small</div>
                    </div>
                  </div>
                  <div className="mt-3 text-[10px] text-zinc-550">
                    <strong className="text-zinc-400">Note:</strong> Free APIs do not return live remaining-token metrics. If a limit is reached, it shows as QUOTA EXCEEDED. Use the Switch button to swap providers instantly.
                  </div>
                </div>

                {/* Right: AI Providers selection (1/3 width) */}
                <div className="bg-zinc-900/30 border border-zinc-850 rounded-md p-6 relative overflow-visible">
                  <div className="text-xs font-bold text-zinc-550 uppercase tracking-widest mb-3">AI Providers</div>
                  <div className="space-y-3">
                    <div className="bg-zinc-950 border border-zinc-850 rounded-lg px-3 py-3 space-y-2 overflow-visible">
                      <div className="text-[10px] font-bold text-zinc-550 uppercase">Embedding</div>
                      <div className="text-sm font-semibold text-zinc-200">{embedProvider?.name || 'Cohere'}</div>
                      <div className="text-[9px] text-zinc-500 font-mono">{embedProvider?.dimension || 1024}d · {embedProvider?.model}</div>
                      <CustomSelect
                        value={activeProject?.embedding_provider || 'cohere'}
                        onChange={handleUpdateEmbeddingProvider}
                        options={EMBEDDING_PROVIDER_OPTIONS}
                        containerClassName="w-full relative z-30"
                        buttonClassName="w-full bg-[#1e1f20] border border-white/10 hover:border-white/20 rounded-lg py-2 px-3 text-xs text-zinc-200 flex items-center justify-between"
                        dropdownPosition="top-full mt-1 left-0 right-0 z-[200] origin-top"
                      />
                    </div>
                    <div className="bg-zinc-950 border border-zinc-850 rounded-lg px-3 py-3 space-y-2 overflow-visible relative z-20">
                      <div className="text-[10px] font-bold text-zinc-550 uppercase flex items-center gap-1.5">Chat LLM
                        {apiStats && (() => {
                          const cp = activeProject?.chat_provider || 'groq'
                          const isOk = cp === 'groq' ? apiStats.groq?.ok : cp === 'openai' ? apiStats.openai?.chat?.ok : cp === 'cohere' ? apiStats.cohere?.chat?.ok : apiStats.gemini?.chat?.ok
                          const latency = cp === 'groq' ? apiStats.groq?.latencyMs : cp === 'openai' ? apiStats.openai?.chat?.latencyMs : cp === 'cohere' ? apiStats.cohere?.chat?.latencyMs : apiStats.gemini?.chat?.latencyMs
                          return <span className={`w-2 h-2 rounded-full ${isOk ? 'bg-emerald-500' : 'bg-red-500'}`} title={latency ? `${latency} ms` : 'offline'} />
                        })()}
                      </div>
                      <div className="text-sm font-semibold text-zinc-200">{CHAT_PROVIDERS[chatProviderId]?.name}</div>
                      <div className="text-[9px] text-zinc-500 font-mono">{CHAT_PROVIDERS[chatProviderId]?.model}</div>
                      <CustomSelect
                        value={activeProject?.chat_provider || 'groq'}
                        onChange={handleUpdateChatProvider}
                        options={CHAT_PROVIDER_OPTIONS}
                        containerClassName="w-full relative z-30"
                        buttonClassName="w-full bg-[#1e1f20] border border-white/10 hover:border-white/20 rounded-lg py-2 px-3 text-xs text-zinc-200 flex items-center justify-between"
                        dropdownPosition="top-full mt-1 left-0 right-0 z-[200] origin-top"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* --- View: Database (Repository & Library) --- */}
        {activeTab === 'database' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-[#131314]">
            <div className="max-w-6xl mx-auto animate-page-load space-y-8">

              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-zinc-450 font-bold text-xs tracking-widest uppercase mb-1.5">
                    <Database className="w-3.5 h-3.5 text-zinc-500" /> Workspace Library
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black text-zinc-150 tracking-tight">{activeProject?.name || 'Workspace'} Files</h2>
                </div>
                <div className="flex gap-2.5">
                  <button onClick={() => setActiveTab('dashboard')} className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 border border-white/10 bg-transparent text-zinc-300 hover:bg-white/5 hover:text-zinc-100 rounded-xl text-xs font-semibold transition-all" title="View dashboard">
                    <LayoutDashboard className="w-3.5 h-3.5 text-emerald-450" /> Dashboard
                  </button>
                  <button onClick={() => setActiveTab('chat')} className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-900 border border-white/5 text-zinc-300 hover:bg-zinc-850 hover:text-zinc-100 rounded-xl text-xs font-semibold transition-all" title="Open chat session">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-400" /> Chat
                  </button>
                </div>
              </div>

              {/* Database View: Ingestion Hub (Top) + Repository (Bottom) */}
              <div className="flex flex-col gap-6 md:gap-8">

                {/* Top: Ingestion Hub (Full Width Card with Horizontal Split on desktop) */}
                <div className="bg-zinc-950/60 backdrop-blur-md border border-white/[0.05] rounded-2xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.3)] relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-[#1D9E75]/5 rounded-full blur-2xl group-hover:bg-[#1D9E75]/10 transition-all duration-300 pointer-events-none" />

                  <div className="flex flex-col lg:flex-row gap-6 items-stretch">
                    {/* Left half: Drag & Drop Dropzone */}
                    <div className="flex-1 space-y-4 flex flex-col justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                          <UploadCloud className="w-4 h-4 text-[#1D9E75]" /> Ingestion Hub
                        </h3>
                        <p className="text-[11px] text-zinc-500 mt-1">Vectorize files directly into this workspace database.</p>
                      </div>

                      <div
                        onDragOver={(e) => { e.preventDefault(); setDbDragActive(true); }}
                        onDragLeave={() => setDbDragActive(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDbDragActive(false);
                          if (e.dataTransfer.files) {
                            addFilesToQueue(Array.from(e.dataTransfer.files))
                          }
                        }}
                        onClick={() => dbFileInputRef.current?.click()}
                        className={`group/drop relative overflow-hidden rounded-xl p-8 text-center cursor-pointer transition-all duration-300 border border-dashed flex-1 flex flex-col justify-center min-h-[160px] ${dbDragActive
                          ? 'border-emerald-500 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                          : 'border-white/[0.08] hover:border-emerald-500/40 bg-zinc-950/40 hover:bg-zinc-900/10'
                          }`}
                      >
                        <input ref={dbFileInputRef} type="file" multiple className="hidden" accept=".pdf,.md,.txt,.json,.docx" onChange={(e) => { if (e.target.files) addFilesToQueue(Array.from(e.target.files)) }} />
                        <div className="w-10 h-10 mx-auto rounded-full flex items-center justify-center mb-2 bg-zinc-900/60 border border-white/[0.06] group-hover/drop:border-emerald-500/30 group-hover/drop:bg-zinc-900 transition-colors shadow-inner">
                          <UploadCloud className="w-4.5 h-4.5 text-zinc-400 group-hover/drop:text-emerald-450 transition-colors" />
                        </div>
                        <div className="text-xs font-bold text-zinc-200 mb-0.5">Drag & drop files here</div>
                        <div className="text-[10px] text-zinc-550 mb-2.5">or click to browse from device</div>
                        <div className="inline-flex gap-1.5 flex-wrap justify-center">
                          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/5 text-[9px] font-medium text-zinc-500 select-none">PDF</span>
                          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/5 text-[9px] font-medium text-zinc-500 select-none">Markdown</span>
                          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/5 text-[9px] font-medium text-zinc-500 select-none">TXT</span>
                          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/5 text-[9px] font-medium text-zinc-500 select-none">JSON</span>
                          <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-white/5 text-[9px] font-medium text-zinc-500 select-none">DOCX</span>
                        </div>
                      </div>
                    </div>

                    {/* Right half: Upload queue */}
                    <div className="flex-1 w-full border-t lg:border-t-0 lg:border-l border-white/[0.06] pt-6 lg:pt-0 lg:pl-6 flex flex-col justify-between min-h-[220px]">
                      {uploadQueue.filter(item => item.projectId === activeProjectId).length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                          <FileText className="w-10 h-10 text-zinc-800 mb-2" />
                          <div className="text-xs font-semibold text-zinc-500">No active ingestion jobs</div>
                          <div className="text-[10px] text-zinc-650 max-w-[240px] mt-1 font-medium">Queued files will appear here with progress bars and stages.</div>
                        </div>
                      ) : (
                        <div className="flex flex-col h-full justify-between gap-4">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest">Ingestion Jobs ({uploadQueue.filter(item => item.projectId === activeProjectId).length})</span>
                            <button
                              onClick={() => startUpload()}
                              disabled={isUploading}
                              className="text-[10px] bg-[#1D9E75] hover:bg-[#1D9E75]/80 text-[#0a0a0c] px-3 py-1.5 rounded-lg font-bold disabled:opacity-50 transition-all flex items-center gap-1 shadow-md shadow-[#1D9E75]/10"
                            >
                              {isUploading ? <><Loader2 className="w-2.5 h-2.5 animate-spin" /> Ingesting</> : 'Start Ingest'}
                            </button>
                          </div>
                          <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-1 flex-1">
                            {uploadQueue.filter(item => item.projectId === activeProjectId).map(item => {
                              const matchedDoc = documents.find(d => getDocName(d) === item.file.name)
                              return (
                                <div key={item.id} className="bg-zinc-950/80 border border-white/[0.04] rounded-xl p-3 text-xs relative overflow-hidden group">
                                  <div className="relative z-10 flex justify-between items-center gap-2">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                      <FileText className={`w-4 h-4 shrink-0 ${item.status === 'success' ? 'text-emerald-450' : 'text-zinc-500'}`} />
                                      <span className="truncate text-zinc-300 font-medium max-w-[200px]" title={item.file.name}>{item.file.name}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {item.status === 'success' ? (
                                        <>
                                          {matchedDoc && (
                                            <button
                                              type="button"
                                              onClick={() => openPreview(matchedDoc)}
                                              className="p-1 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded transition-all mr-0.5"
                                              title="Preview indexed document"
                                            >
                                              <Eye className="w-3.5 h-3.5" />
                                            </button>
                                          )}
                                          <CheckCircle className="w-4 h-4 text-emerald-450" />
                                        </>
                                      ) : item.status === 'error' ? (
                                        <span title={item.error}><XCircle className="w-4 h-4 text-red-400" /></span>
                                      ) : (
                                        <span className="text-[10px] font-mono font-bold text-emerald-400">{item.progress}%</span>
                                      )}

                                      {/* Remove or Stop button */}
                                      {item.status === 'uploading' ? (
                                        <button
                                          type="button"
                                          onClick={() => stopUpload(item.id, item.file.name, item.projectId)}
                                          className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-all ml-1 shrink-0"
                                          title="Stop and delete upload"
                                        >
                                          <XCircle className="w-4 h-4" />
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => removeQueueItem(item.id)}
                                          className="p-1 text-zinc-500 hover:text-red-405 hover:bg-white/5 rounded transition-all ml-1 shrink-0"
                                          title="Remove from queue"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {item.status === 'uploading' && (
                                    <div className="relative z-10 space-y-1.5 mt-2">
                                      <div className="h-1 bg-zinc-900 rounded-full overflow-hidden relative">
                                        <div className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 animate-pulse transition-all duration-300" style={{ width: `${item.progress}%` }} />
                                      </div>
                                      <div className="flex items-center justify-between text-[9px] text-zinc-500 font-medium">
                                        <div className="flex items-center gap-1">
                                          <Loader2 className="w-2.5 h-2.5 animate-spin text-emerald-400" />
                                          <span>{item.stage}</span>
                                        </div>
                                        <span>Ingesting...</span>
                                      </div>
                                    </div>
                                  )}
                                  {item.status === 'error' && <div className="text-[9px] text-red-400 mt-1.5 truncate bg-red-950/20 px-2 py-1 rounded-md border border-red-900/10 font-medium">{item.error}</div>}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom: Repository Table (Full Width) */}
                <div className="bg-zinc-950/60 backdrop-blur-md border border-white/[0.05] rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
                  <div className="p-5 border-b border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <h3 className="text-base font-bold text-zinc-200 flex items-center gap-2"><Database className="w-4 h-4 text-emerald-450" /> Repository</h3>
                      {selectedDocIds.length > 0 && (
                        <button
                          onClick={deleteSelectedDocuments}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg text-xs font-bold transition-all shadow-sm animate-fade-in"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedDocIds.length})
                        </button>
                      )}
                    </div>

                    {/* Global Search & Filter */}
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="flex flex-1 sm:flex-initial items-center gap-1.5 rounded-lg border border-white/[0.06] bg-zinc-950/40 hover:bg-zinc-950/60 focus-within:border-emerald-500/30 pl-3 pr-1 h-9 focus-within:ring-2 focus-within:ring-emerald-500/10 transition-all">
                        <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <input
                          type="text"
                          placeholder="Search files..."
                          value={fileSearchQuery}
                          onChange={(e) => { setFileSearchQuery(e.target.value); setDashboardPage(1); }}
                          className="w-full bg-transparent text-xs text-zinc-200 placeholder:text-zinc-550 outline-none"
                        />
                      </div>
                      <CustomSelect
                        value={formatFilter}
                        onChange={(val) => { setFormatFilter(val); setDashboardPage(1); }}
                        options={[
                          { value: 'all', label: 'All Formats' },
                          { value: '.pdf', label: 'PDF' },
                          { value: '.md', label: 'Markdown' },
                          { value: '.txt', label: 'Text' },
                          { value: '.json', label: 'JSON' },
                          { value: '.docx', label: 'DOCX' }
                        ]}
                        containerClassName="w-32 shrink-0"
                        buttonClassName="flex h-9 w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 shadow-sm outline-none transition-all hover:bg-zinc-900 hover:text-zinc-50"
                        dropdownPosition="top-full mt-1.5 right-0 w-36 origin-top"
                      />
                    </div>
                  </div>

                  {documents.length === 0 ? (
                    <div className="text-center py-16 px-4">
                      <FolderPlus className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
                      <h4 className="text-lg font-bold text-zinc-350">Repository is Empty</h4>
                      <p className="text-xs text-zinc-550 max-w-sm mx-auto mt-2 font-medium leading-relaxed">Upload your first batch of files using the Ingestion Hub on the right to start building the vector database.</p>
                    </div>
                  ) : filteredAndSortedDocs.length === 0 ? (
                    <div className="text-center py-16 px-4">
                      <Search className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                      <h4 className="text-lg font-bold text-zinc-350">No results found</h4>
                      <p className="text-xs text-zinc-555 max-w-sm mx-auto mt-2">Try adjusting your search query.</p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto min-h-[400px]">
                        <table className="w-full text-left text-sm text-zinc-400 whitespace-nowrap">
                          <thead className="text-[10px] uppercase tracking-widest bg-zinc-900/10 text-zinc-500 border-b border-white/[0.04]">
                            <tr>
                              <th className="w-12 px-3 sm:px-6 py-3.5">
                                <div
                                  onClick={() => handleSelectAll(!isAllPageSelected)}
                                  className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all ${isAllPageSelected ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'}`}
                                  title={isAllPageSelected ? "Deselect all page files" : "Select all page files"}
                                >
                                  {isAllPageSelected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                                </div>
                              </th>
                              <th className="px-3 sm:px-6 py-3.5 font-bold cursor-pointer hover:text-zinc-200 transition group select-none" onClick={() => requestSort('name')}>
                                <div className="flex items-center gap-1">Filename <ArrowUpDown className={`w-3 h-3 ${sortConfig.key === 'name' ? 'text-zinc-300' : 'opacity-0 group-hover:opacity-100'}`} /></div>
                              </th>
                              <th className="px-3 sm:px-6 py-3.5 font-bold cursor-pointer hover:text-zinc-200 transition group select-none hidden sm:table-cell" onClick={() => requestSort('size')}>
                                <div className="flex items-center gap-1">Size <ArrowUpDown className={`w-3 h-3 ${sortConfig.key === 'size' ? 'text-zinc-300' : 'opacity-0 group-hover:opacity-100'}`} /></div>
                              </th>
                              <th className="px-3 sm:px-6 py-3.5 font-bold cursor-pointer hover:text-zinc-200 transition group select-none hidden md:table-cell" onClick={() => requestSort('chunks')}>
                                <div className="flex items-center gap-1">Vectors <ArrowUpDown className={`w-3 h-3 ${sortConfig.key === 'chunks' ? 'text-zinc-300' : 'opacity-0 group-hover:opacity-100'}`} /></div>
                              </th>
                              <th className="px-3 sm:px-6 py-3.5 font-bold text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.03]">
                            {paginatedDocs.map(doc => {
                              const name = getDocName(doc)
                              const sizeStr = doc.meta?.size ? formatBytes(Number(doc.meta.size)) : '0 B'
                              const chunkCount = doc.sectionCount || 0
                              const isSelected = selectedDocIds.includes(doc.id)
                              const extension = name.substring(name.lastIndexOf('.')).toLowerCase()
                              return (
                                <tr key={doc.id} className={`hover:bg-white/[0.01] transition-colors ${isSelected ? 'bg-emerald-500/[0.02]' : ''}`}>
                                  <td className="px-3 sm:px-6 py-3.5">
                                    <div
                                      onClick={() => toggleSelectDoc(doc.id)}
                                      className={`w-4 h-4 rounded border flex items-center justify-center cursor-pointer transition-all ${isSelected ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'}`}
                                      title={isSelected ? "Deselect file" : "Select file"}
                                    >
                                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-6 py-3.5 font-medium text-zinc-200 max-w-xs md:max-w-md truncate">
                                    <div className="flex items-center gap-2.5">
                                      {extension === '.pdf' ? <FileText className="w-4 h-4 text-rose-400 shrink-0" /> :
                                        extension === '.md' ? <FileText className="w-4 h-4 text-sky-400 shrink-0" /> :
                                          extension === '.json' ? <FileText className="w-4 h-4 text-amber-400 shrink-0" /> :
                                            extension === '.docx' ? <FileText className="w-4 h-4 text-blue-400 shrink-0" /> :
                                              <FileText className="w-4 h-4 text-emerald-450 shrink-0" />}
                                      <span className="truncate" title={name}>{name}</span>
                                    </div>
                                  </td>
                                  <td className="px-3 sm:px-6 py-3.5 text-xs text-zinc-450 hidden sm:table-cell">{sizeStr}</td>
                                  <td className="px-3 sm:px-6 py-3.5 text-xs text-zinc-450 hidden md:table-cell">
                                    <span className="px-2 py-0.5 bg-zinc-900 border border-white/5 rounded text-[10px] font-mono text-zinc-350">{chunkCount}</span>
                                  </td>
                                  <td className="px-3 sm:px-6 py-3.5 text-right text-xs">
                                    <div className="flex justify-end gap-1.5">
                                      <button
                                        onClick={() => openPreview(doc)}
                                        className="p-1.5 text-zinc-450 hover:text-zinc-250 hover:bg-white/5 rounded transition-all"
                                        title="Preview content"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => deleteDocument(doc.id, name)}
                                        className="p-1.5 text-zinc-450 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                                        title="Delete file"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      {totalPages > 1 && (
                        <div className="p-4 border-t border-white/[0.05] flex items-center justify-between bg-zinc-950/20">
                          <div className="text-xs text-zinc-500">
                            Showing <span className="font-semibold text-zinc-350">{(dashboardPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-semibold text-zinc-350">{Math.min(dashboardPage * ITEMS_PER_PAGE, filteredAndSortedDocs.length)}</span> of <span className="font-semibold text-zinc-350">{filteredAndSortedDocs.length}</span> files
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setDashboardPage(p => Math.max(1, p - 1))} disabled={dashboardPage === 1} className="p-1.5 rounded-lg border border-white/5 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition text-zinc-300"><ChevronLeft className="w-4 h-4" /></button>
                            <span className="text-xs font-semibold text-zinc-450 px-2">Page {dashboardPage} of {totalPages}</span>
                            <button onClick={() => setDashboardPage(p => Math.min(totalPages, p + 1))} disabled={dashboardPage === totalPages} className="p-1.5 rounded-lg border border-white/5 hover:bg-white/5 disabled:opacity-30 disabled:hover:bg-transparent transition text-zinc-300"><ChevronRight className="w-4 h-4" /></button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- View: How it Works (Architecture) --- */}
        {activeTab === 'how-it-works' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8 custom-scrollbar bg-[#131314]">
            <div className="max-w-5xl mx-auto animate-page-load space-y-8 pb-12">
              <div className="flex flex-col items-start gap-4 border-b border-white/[0.06] pb-6">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <Zap className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">System Architecture & Flow</h2>
                  <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
                    A deep dive into VectorMind&apos;s proprietary RAG architecture. This section breaks down the entire lifecycle of a document, the retrieval algorithms, and the multi-LLM orchestration pipeline.
                  </p>
                </div>
              </div>

              {/* Flowchart Section */}
              <div className="bg-zinc-950/80 border border-white/[0.06] p-6 md:p-8 rounded-2xl overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[80px] -mr-20 -mt-20 pointer-events-none" />
                <h3 className="text-lg font-bold text-zinc-100 mb-6 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-400" />
                  End-to-End Execution Flow
                </h3>

                <div className="flex flex-col gap-2 font-mono text-xs md:text-sm">
                  {/* Step 1 */}
                  <div className="flex items-center gap-4">
                    <div className="w-24 text-right text-emerald-400/80 shrink-0">Upload</div>
                    <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded p-3 text-zinc-300 relative">
                      <div className="absolute left-[-17px] top-1/2 -translate-y-1/2 w-4 h-[2px] bg-emerald-500/30" />
                      Frontend extracts raw file (PDF/MD/TXT) → encodes to Base64 → sends to <code>/api/upload</code>
                    </div>
                  </div>
                  <div className="flex items-center gap-4"><div className="w-24 shrink-0" /><div className="w-px h-6 bg-zinc-800 ml-4" /></div>

                  {/* Step 2 */}
                  <div className="flex items-center gap-4">
                    <div className="w-24 text-right text-blue-400/80 shrink-0">Processing</div>
                    <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded p-3 text-zinc-300 relative">
                      <div className="absolute left-[-17px] top-1/2 -translate-y-1/2 w-4 h-[2px] bg-blue-500/30" />
                      PDF parsed via <code>pdf-parse</code> / <code>unpdf</code> → text sanitized (null bytes stripped) → hierarchical sliding-window chunking
                    </div>
                  </div>
                  <div className="flex items-center gap-4"><div className="w-24 shrink-0" /><div className="w-px h-6 bg-zinc-800 ml-4" /></div>

                  {/* Step 3 */}
                  <div className="flex items-center gap-4">
                    <div className="w-24 text-right text-purple-400/80 shrink-0">Embedding</div>
                    <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded p-3 text-zinc-300 relative">
                      <div className="absolute left-[-17px] top-1/2 -translate-y-1/2 w-4 h-[2px] bg-purple-500/30" />
                      Batch embedding generation (Gemini: 768-dim, Cohere: 1024-dim, OpenAI: 1536-dim)
                    </div>
                  </div>
                  <div className="flex items-center gap-4"><div className="w-24 shrink-0" /><div className="w-px h-6 bg-zinc-800 ml-4" /></div>

                  {/* Step 4 */}
                  <div className="flex items-center gap-4">
                    <div className="w-24 text-right text-amber-400/80 shrink-0">Storage</div>
                    <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded p-3 text-zinc-300 relative">
                      <div className="absolute left-[-17px] top-1/2 -translate-y-1/2 w-4 h-[2px] bg-amber-500/30" />
                      Supabase pgvector indexing. Original files cached securely.
                    </div>
                  </div>
                  <div className="flex items-center gap-4"><div className="w-24 shrink-0" /><div className="w-px h-6 bg-zinc-800 ml-4" /></div>

                  {/* Step 5 */}
                  <div className="flex items-center gap-4">
                    <div className="w-24 text-right text-rose-400/80 shrink-0">Retrieval</div>
                    <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded p-3 text-zinc-300 relative">
                      <div className="absolute left-[-17px] top-1/2 -translate-y-1/2 w-4 h-[2px] bg-rose-500/30" />
                      HyDE Query Expansion → pgvector <code>&lt;#&gt;</code> match → MMR + RRF Re-ranking → LLM Context Injection
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Tech & Libraries */}
                <div className="bg-zinc-950/50 border border-white/[0.04] p-6 rounded-2xl relative overflow-hidden group hover:border-emerald-500/20 transition-colors">
                  <Database className="w-6 h-6 text-emerald-400 mb-4" />
                  <h3 className="text-lg font-bold text-zinc-100 mb-4">Tech Stack & Libraries</h3>
                  <div className="space-y-4 text-sm text-zinc-400">
                    <div>
                      <div className="text-zinc-200 font-semibold mb-1">Core Framework</div>
                      <p>Next.js 13 (Pages Router) for full-stack API routes & React frontend. Styled with Tailwind CSS & Lucide icons.</p>
                    </div>
                    <div>
                      <div className="text-zinc-200 font-semibold mb-1">Database & Vectors</div>
                      <p>Supabase PostgreSQL with the <code>pgvector</code> extension. Utilizes custom RPC functions for high-speed similarity search.</p>
                    </div>
                    <div>
                      <div className="text-zinc-200 font-semibold mb-1">Document Parsing</div>
                      <p><code>pdf-parse</code> and <code>unpdf</code> for binary PDF streams. Native extraction for DOCX, MD, and code files.</p>
                    </div>
                  </div>
                </div>

                {/* AI Models & Limits */}
                <div className="bg-zinc-950/50 border border-white/[0.04] p-6 rounded-2xl relative overflow-hidden group hover:border-blue-500/20 transition-colors">
                  <Bot className="w-6 h-6 text-blue-400 mb-4" />
                  <h3 className="text-lg font-bold text-zinc-100 mb-4">Models & Configurations</h3>
                  <div className="space-y-4 text-sm text-zinc-400">
                    <div>
                      <div className="flex justify-between font-semibold mb-1"><span className="text-zinc-200">Google Gemini</span><span className="text-emerald-400 text-xs">Default</span></div>
                      <p>Embeddings: <code>gemini-embedding-2</code> (768-dim)<br />Chat: <code>gemini-2.0-flash</code> (15 RPM limit on free tier)</p>
                    </div>
                    <div>
                      <div className="flex justify-between font-semibold mb-1"><span className="text-zinc-200">Cohere</span><span className="text-blue-400 text-xs">High-dim</span></div>
                      <p>Embeddings: <code>embed-english-v3.0</code> (1024-dim)<br />Chat: <code>command-a-03-2025</code> (1000 calls/mo limit)</p>
                    </div>
                    <div>
                      <div className="flex justify-between font-semibold mb-1"><span className="text-zinc-200">Groq (Llama 3.3)</span><span className="text-purple-400 text-xs">Ultra-fast</span></div>
                      <p>Chat: <code>llama-3.3-70b-versatile</code> (1000 RPD free). Groq provides sub-second inference speeds.</p>
                    </div>
                    <div>
                      <div className="flex justify-between font-semibold mb-1"><span className="text-zinc-200">OpenAI</span><span className="text-amber-400 text-xs">Premium</span></div>
                      <p>Embeddings: <code>text-embedding-3-small</code> (1536-dim)<br />Chat: <code>gpt-4o-mini</code> (Pay-as-you-go limits)</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Search & Algorithms */}
                <div className="bg-zinc-950/50 border border-white/[0.04] p-6 rounded-2xl relative overflow-hidden group hover:border-purple-500/20 transition-colors">
                  <Search className="w-6 h-6 text-purple-400 mb-4" />
                  <h3 className="text-lg font-bold text-zinc-100 mb-4">Search & Ranking Algorithms</h3>
                  <div className="space-y-4 text-sm text-zinc-400">
                    <div>
                      <div className="text-zinc-200 font-semibold mb-1">Negative Dot Product (<code>&lt;#&gt;</code>)</div>
                      <p>Instead of cosine similarity, Postgres uses <code>embedding &lt;#&gt; query * -1</code>. Because LLM embeddings are L2 normalized, dot product gives identical results to cosine similarity but skips the CPU-expensive square root math.</p>
                    </div>
                    <div>
                      <div className="text-zinc-200 font-semibold mb-1">HyDE (Hypothetical Doc Embeddings)</div>
                      <p>When you ask a question, an LLM first guesses the answer. The system then embeds the <em>guess</em> along with your query to find much more semantically accurate matches.</p>
                    </div>
                    <div>
                      <div className="text-zinc-200 font-semibold mb-1">MMR & RRF</div>
                      <p>Maximal Marginal Relevance filters out redundant chunks. Reciprocal Rank Fusion combines the scores of multiple parallel vector queries into one master rank.</p>
                    </div>
                  </div>
                </div>

                {/* Security & System */}
                <div className="bg-zinc-950/50 border border-white/[0.04] p-6 rounded-2xl relative overflow-hidden group hover:border-rose-500/20 transition-colors">
                  <span className="w-6 h-6 text-rose-400 mb-4 block"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></span>
                  <h3 className="text-lg font-bold text-zinc-100 mb-4">Security & Processing Defenses</h3>
                  <ul className="space-y-3 text-sm text-zinc-400">
                    <li className="flex gap-2.5"><span className="text-rose-500 mt-0.5">•</span> <strong>Null Byte Stripping:</strong> Postgres crashes if a text string contains <code>\u0000</code>. The ingestion pipeline strictly regex-sanitizes all extracted text.</li>
                    <li className="flex gap-2.5"><span className="text-rose-500 mt-0.5">•</span> <strong>Cascade Deletion:</strong> Deleting a workspace or document automatically triggers a database cascade, securely destroying all vector embeddings.</li>
                    <li className="flex gap-2.5"><span className="text-rose-500 mt-0.5">•</span> <strong>API Route Protection:</strong> Payload size limits are enforced (<code>50mb</code> max) and rate limiting delays are injected directly into the embedding API retry loop.</li>
                    <li className="flex gap-2.5"><span className="text-rose-500 mt-0.5">•</span> <strong>Server-Side Only:</strong> No API keys are leaked to the client. All Supabase, OpenAI, Gemini, and Cohere requests happen purely on Next.js backend edge routes.</li>
                  </ul>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* --- Chat (Gemini-style) --- */}
        {activeTab === 'chat' && (
          <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
            <div className="gemini-glow" aria-hidden />


            <div className={`flex-1 min-h-0 flex flex-col relative z-10 ${messages.length === 0 ? 'justify-center' : ''}`}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center px-4 py-8 max-w-5xl mx-auto w-full">
                  <h1 className="text-3xl md:text-4xl font-normal text-zinc-100 text-center mb-8 tracking-tight">
                    {activeProject?.name
                      ? `Ask anything about ${activeProject.name}`
                      : 'What would you like to know?'}
                  </h1>
                  {documents.length === 0 && activeProjectId && (
                    <p className="text-xs text-zinc-500 text-center mb-6 max-w-md font-medium leading-relaxed">
                      This workspace has no documents yet. Please <button type="button" className="text-emerald-400 hover:text-emerald-350 underline transition-colors" onClick={() => { setActiveTab('database'); setTimeout(() => dbFileInputRef.current?.click(), 100); }}>upload files</button> to get started.
                    </p>
                  )}
                  {apiHealth === 'error' && (
                    <div className="w-full max-w-xl mb-6 p-4 rounded-2xl bg-red-950/30 border border-red-900/40 text-left">
                      <p className="text-sm text-red-300 font-medium mb-2">Setup needed</p>
                      <p className="text-xs text-red-300/80 mb-3">Add API keys to <code className="bg-black/30 px-1 rounded">.env.local</code> and run the database migration.</p>
                      <button type="button" onClick={checkApiHealth} className="text-xs font-semibold text-red-400 flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Check again</button>
                    </div>
                  )}
                  <div className="w-full mt-6">{chatComposerBlock}</div>
                </div>
              ) : (
                <div
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto custom-scrollbar w-full px-4 sm:px-8 pt-2 pb-4 relative"
                  onScroll={(e) => {
                    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
                    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 150)
                  }}
                >
                  <div className="max-w-5xl mx-auto space-y-6 w-full">
                    {messages.map((msg) => (
                      <div key={msg.id} className={`flex gap-3 md:gap-5 animate-slide-up ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                          <div className="w-10 h-10 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 shadow-sm mt-1">
                            <Bot className="w-5 h-5 text-zinc-400" />
                          </div>
                        )}

                        <div className={`max-w-[95%] md:max-w-[85%] rounded-lg border text-sm shadow-sm ${msg.role === 'user' ? 'bg-zinc-900 border-zinc-800 text-zinc-50' : 'bg-zinc-950 border-zinc-850 text-zinc-200'}`}>
                          <div className="px-5 py-4">

                            {/* Rich Loading Visualizer */}
                            {msg.isLoading && !msg.text ? (
                              <div className="py-2 min-w-[280px]">
                                <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                                  <Activity className="w-4 h-4 animate-pulse" /> Processing Query
                                </div>
                                <div className="space-y-6 relative">
                                  <div className="absolute left-[11px] top-3 bottom-3 w-px bg-zinc-800 z-0" />

                                  <div className="flex items-start gap-4 relative z-10">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors duration-500 shadow-sm ${searchStep === 'hyde' ? 'bg-zinc-950 border-zinc-500 text-zinc-400' : searchStep !== 'idle' ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-zinc-950 border-zinc-800 text-zinc-600'}`}>
                                      {searchStep === 'hyde' ? <span className="w-2 h-2 bg-zinc-400 rounded-full animate-pulse" /> : searchStep !== 'idle' ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="text-[10px] font-bold">1</span>}
                                    </div>
                                    <div>
                                      <div className={`text-sm font-semibold ${searchStep === 'hyde' ? 'text-zinc-50' : 'text-zinc-500'}`}>HyDE Expansion</div>
                                      {searchStep === 'hyde' && <div className="text-xs text-zinc-450 mt-1">Generating semantic variations...</div>}
                                    </div>
                                  </div>

                                  <div className="flex items-start gap-4 relative z-10">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors duration-500 shadow-sm ${searchStep === 'search' ? 'bg-zinc-950 border-zinc-500 text-zinc-400' : (searchStep === 'rrf' || searchStep === 'synth') ? 'bg-zinc-900 border-zinc-800 text-zinc-400' : 'bg-zinc-950 border-zinc-800 text-zinc-600'}`}>
                                      {searchStep === 'search' ? <span className="w-2 h-2 bg-zinc-400 rounded-full animate-pulse" /> : (searchStep === 'rrf' || searchStep === 'synth') ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="text-[10px] font-bold">2</span>}
                                    </div>
                                    <div>
                                      <div className={`text-sm font-semibold ${searchStep === 'search' ? 'text-zinc-50' : 'text-zinc-500'}`}>Hybrid Search</div>
                                      {searchStep === 'search' && <div className="text-xs text-zinc-450 mt-1">Scanning pgvector indexes...</div>}
                                    </div>
                                  </div>

                                  <div className="flex items-start gap-4 relative z-10">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors duration-500 shadow-sm ${searchStep === 'rrf' ? 'bg-zinc-950 border-zinc-500 text-zinc-400' : searchStep === 'synth' ? 'bg-zinc-900 border-zinc-800 text-zinc-450' : 'bg-zinc-950 border-zinc-800 text-zinc-600'}`}>
                                      {searchStep === 'rrf' ? <span className="w-2 h-2 bg-zinc-400 rounded-full animate-pulse" /> : searchStep === 'synth' ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="text-[10px] font-bold">3</span>}
                                    </div>
                                    <div>
                                      <div className={`text-sm font-semibold ${searchStep === 'rrf' ? 'text-zinc-50' : 'text-zinc-500'}`}>Rank Fusion & Filtering</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className={`leading-relaxed text-[14.5px] ${msg.role === 'assistant' ? 'prose-chat' : 'font-medium tracking-wide'}`}>
                                {msg.role === 'assistant'
                                  ? <>
                                    {renderMarkdown(msg.text, (citationId) => {
                                      const citation = msg.citations?.find(c => c.id === citationId)
                                      if (citation) setActiveCitation(citation)
                                    })}
                                    {msg.isLoading && <TypingIndicator />}
                                  </>
                                  : <span className="text-zinc-100">{msg.text}</span>
                                }
                              </div>
                            )}

                            {/* Assistant Message Actions & Metadata */}
                            {msg.role === 'assistant' && !msg.isLoading && (
                              <div className="mt-2 flex flex-col gap-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    {msg.cached && (
                                      <div className="text-[10px] font-bold px-2.5 py-1 rounded-md border flex items-center gap-1.5 shadow-sm bg-yellow-500/10 text-yellow-500 border-yellow-500/20" title="Served from semantic cache">
                                        <Zap className="w-3 h-3" /> CACHED
                                      </div>
                                    )}
                                    {/* CONFIDENCE TAG — temporarily hidden, re-enable when needed
                                    {msg.confidence && msg.confidence.level !== 'LOW' && (
                                      <div className={`text-[10px] font-bold px-2.5 py-1 rounded-md border flex items-center gap-1.5 shadow-sm ${msg.confidence.level === 'HIGH' ? 'bg-zinc-900 text-zinc-200 border-zinc-800' :
                                          msg.confidence.level === 'MEDIUM' ? 'bg-zinc-900 text-zinc-350 border-zinc-800' :
                                            'bg-red-955/20 text-red-400 border-red-900/30'
                                        }`}>
                                        {msg.confidence.level === 'HIGH' && <CheckCircle className="w-3 h-3" />}
                                        {msg.confidence.level === 'MEDIUM' && <AlertCircle className="w-3 h-3" />}
                                        {msg.confidence.level === 'LOW' && <XCircle className="w-3 h-3" />}
                                        {msg.confidence.level} CONFIDENCE
                                      </div>
                                    )}
                                    */}
                                  </div>

                                  {/* AI Action Buttons */}
                                  <div className="flex items-center gap-1.5 mt-1 -ml-1">
                                    <button onClick={() => handleCopy(msg.id, msg.text)} className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-md transition-colors" title="Copy response">
                                      {copiedId === msg.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                                    </button>

                                    {isSearchLoading && activeMessageIdRef.current === msg.id ? (
                                      <button onClick={() => stop()} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-white/5 rounded-md transition-colors" title="Stop generating">
                                        <Square className="w-4 h-4" />
                                      </button>
                                    ) : (
                                      <button onClick={() => handleSearchSubmit(undefined, messages.filter(m => m.role === 'user').pop()?.text)} className={`p-1.5 transition-colors rounded-md ${msg.error ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-400/10' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}`} title="Regenerate response">
                                        <RefreshCw className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Source Citations with SaaS styling */}
                                {msg.citations && msg.citations.length > 0 && /\[\d+(?:,\s*\d+)*\]/.test(msg.text) && (
                                  <div>
                                    <div className="text-[9px] font-bold text-zinc-550 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                      <LinkIcon className="w-3 h-3" /> Cited Sources
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      {Array.from(new Map(msg.citations.map(c => [c.sourceName, c])).values()).map((cit, idx) => (
                                        <button
                                          key={idx}
                                          onClick={() => setActiveCitation(cit as any)}
                                          className="group relative overflow-hidden flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs transition-all duration-200 bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700 cursor-pointer hover:bg-zinc-855"
                                        >
                                          <FileText className="w-3.5 h-3.5 shrink-0 text-zinc-400 group-hover:text-zinc-300" />
                                          <span className="truncate max-w-[180px] font-medium">{(cit as any).sourceName || `Source ${(cit as any).id}`}</span>
                                          <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 absolute right-3 text-zinc-450 transition-opacity" />
                                          <span className="w-4 h-full bg-gradient-to-l from-zinc-900 group-hover:from-zinc-850 to-transparent absolute right-0" />
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Follow-up Suggestions */}
                                {msg.suggestions && msg.suggestions.length > 0 && (
                                  <div className="mt-4 pt-4 border-t border-zinc-850/50 flex flex-col gap-2.5 animate-fade-in">
                                    <div className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest">Suggested Follow-ups</div>
                                    <div className="flex flex-wrap gap-2">
                                      {msg.suggestions.map((suggestion, idx) => (
                                        <button
                                          key={idx}
                                          type="button"
                                          onClick={() => setSearchQuery(suggestion)}
                                          className="text-[13px] text-zinc-350 hover:text-zinc-50 bg-zinc-900/60 hover:bg-zinc-850/80 border border-zinc-800/80 hover:border-zinc-700/80 px-3.5 py-1.5 rounded-full transition-all duration-200 active:scale-95 shadow-sm"
                                        >
                                          {suggestion}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {msg.role === 'user' && (
                          <div className="w-10 h-10 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 shadow-sm mt-1">
                            <User className="w-5 h-5 text-zinc-400" />
                          </div>
                        )}
                      </div>
                    ))}
                    <div ref={chatEndRef} className="h-10" />
                  </div>
                </div>
              )}
            </div>

            {messages.length > 0 && (
              <div className="relative z-20 shrink-0 w-full px-4 sm:px-8 pb-6 pt-3 bg-gradient-to-t from-[#131314] via-[#131314] to-transparent">
                <div className="max-w-5xl mx-auto relative">
                  {showScrollBottom && (
                    <button
                      onClick={() => chatContainerRef.current?.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' })}
                      className="absolute -top-14 left-1/2 -translate-x-1/2 p-2 bg-[#1A1A1F] hover:bg-[#222228] border border-white/10 text-zinc-300 hover:text-white rounded-full shadow-2xl transition-all animate-fade-in z-[100] flex items-center justify-center group"
                    >
                      <ArrowDown className="w-4 h-4 group-hover:text-emerald-400" />
                    </button>
                  )}
                  {messages.filter(m => !m.isLoading && m.text && !m.error).length > 0 && (
                    <div className="flex items-center gap-1.5 justify-center mb-2.5 text-[10px] text-emerald-400 font-bold uppercase tracking-wider animate-pulse">
                      <Zap className="w-3 h-3 fill-current" /> Conversation context active
                    </div>
                  )}
                  {chatComposerBlock}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* --- Citation Popover Modal --- */}
      {activeCitation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in" onClick={() => setActiveCitation(null)}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col relative z-10 animate-scale-in overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="flex flex-col">
                  <span className="text-zinc-100 font-bold text-sm tracking-wide">{activeCitation.sourceName || `Citation [${activeCitation.id}]`}</span>
                  <span className="text-[10px] text-zinc-400 font-medium flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-500" /> Semantic Match Score: {(activeCitation.score * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <button onClick={() => setActiveCitation(null)} className="p-1.5 text-zinc-400 hover:text-zinc-200 bg-transparent hover:bg-zinc-900 rounded-md transition-colors border border-transparent hover:border-zinc-800">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 flex overflow-hidden">
              {/* Left Side: PDF Preview */}
              <div className="flex-1 border-r border-zinc-800 bg-zinc-950/50">
                {activeCitation?.storageUrl || activeCitation?.sourceName ? (
                  <iframe src={activeCitation.storageUrl ? `/api/proxy?url=${encodeURIComponent(activeCitation.storageUrl)}#view=FitH` : `/api/preview/${encodeURIComponent(activeCitation.sourceName || '')}`} className="w-full h-full" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-4">
                    <FileText className="w-12 h-12 opacity-50" />
                    <p className="text-sm font-medium">Document preview unavailable</p>
                  </div>
                )}
              </div>
              {/* Right Side: Extracted Chunk */}
              <div className="w-full sm:w-[350px] lg:w-[400px] flex-shrink-0 bg-zinc-950 flex flex-col">
                <div className="px-5 py-4 border-b border-zinc-800">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" /> Extracted Context
                  </h3>
                  <p className="text-[10px] text-zinc-500 mt-1">This is the exact snippet retrieved from the document used to generate the answer.</p>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
                  <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap font-medium font-mono text-[13px] bg-black/40 rounded-lg border border-white/5 p-4">
                    {activeCitation.chunk}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- Premium PDF Preview Modal --- */}
      {previewPdfUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setPreviewPdfUrl(null)} />
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg shadow-lg w-full max-w-6xl h-full sm:h-[90vh] flex flex-col relative z-10 animate-scale-in overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950">
              <div className="flex items-center gap-3 font-semibold text-zinc-200">
                <div className="w-8 h-8 rounded-md bg-zinc-900 flex items-center justify-center border border-zinc-800">
                  <Eye className="w-4 h-4 text-zinc-405" />
                </div>
                Document Viewer
              </div>
              <div className="flex items-center gap-3">
                <a href={previewPdfUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-zinc-300 hover:text-zinc-550 bg-transparent hover:bg-zinc-900 px-3.5 py-1.5 rounded-md border border-zinc-800 transition-colors">
                  Open External
                </a>
                <button onClick={() => setPreviewPdfUrl(null)} className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-zinc-550 bg-transparent hover:bg-zinc-900 rounded-md transition-colors border border-zinc-800">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-zinc-900 relative p-1 flex items-center justify-center">
              {previewPdfUrl.toLowerCase().includes('.docx') ? (
                <div className="text-center p-8 max-w-md mx-auto space-y-4">
                  <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto text-blue-450 shadow-inner animate-pulse">
                    <FileText className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-zinc-200 font-semibold text-lg">DOCX Word Document</h3>
                    <p className="text-zinc-450 text-xs mt-2 leading-relaxed">
                      Word Documents cannot be rendered directly inside the browser. However, all text content has been successfully extracted, chunked, and fully indexed in your vector database.
                    </p>
                  </div>
                  <div className="pt-2">
                    <a
                      href={previewPdfUrl}
                      download
                      className="inline-flex items-center gap-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-lg shadow transition-colors"
                    >
                      <Download className="w-4 h-4" /> Download DOCX File
                    </a>
                  </div>
                </div>
              ) : (
                <iframe src={`${previewPdfUrl}#view=FitH`} className="w-full h-full rounded-md bg-white border-0" title="PDF Preview" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Confirm Modal */}
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setConfirmModal(null)} />
          <div className="relative bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-md shadow-lg overflow-hidden animate-slide-up">
            <div className="p-6">
              <div className="w-10 h-10 rounded-full bg-red-955/20 flex items-center justify-center mb-4 border border-red-900/30">
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-50 mb-1">{confirmModal.title}</h3>
              <p className="text-xs text-zinc-400 leading-relaxed mb-6">
                {confirmModal.message}
              </p>
              <div className="flex gap-2.5 justify-end">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-3.5 py-2 rounded-md text-xs font-medium border border-zinc-800 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await confirmModal.onConfirm()
                    setConfirmModal(null)
                  }}
                  className="px-3.5 py-2 rounded-md text-xs font-semibold bg-red-650 hover:bg-red-500 text-white shadow-sm transition-colors"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
