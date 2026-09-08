import Head from 'next/head'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Zap, Database, Search, Cpu, Layers, FileText, Check, Copy, ExternalLink,
  Shield, ArrowRight, ChevronRight, ChevronLeft, Terminal, Sliders, Eye, RefreshCw,
  Code, GitBranch, Server, Activity, Menu, X, ChevronDown,
  Lock, Smartphone, ArrowUpRight, BarChart2,
  HardDrive, FileCode, Play, Pause, CheckCircle, Github, GitFork, CornerDownRight,
  Upload, MessageSquare, Settings, BookOpen, Image as ImageIcon,
  Linkedin
} from 'lucide-react'

import { AccountMenu } from '@/components/AccountMenu'

const DarkVeil = dynamic(() => import('@/components/DarkVeil'), { ssr: false })

// ─── TYPES & CONSTANTS ────────────────────────────────────────────────────────
interface StepDetail {
  step: number
  title: string
  shortTitle: string
  subtitle: string
  description: string
  codeSnippet: string
  metrics: { label: string; value: string }[]
}

interface FeatureCard {
  icon: React.ReactNode
  title: string
  description: string
}

const STEPS_DATA: StepDetail[] = [
  {
    step: 1,
    title: 'Multi-Format File Ingestion',
    shortTitle: 'Ingest',
    subtitle: 'Extract text, tables & image OCR',
    description: 'Accepts PDF, DOCX, TXT, MD, and image uploads. Automatic client-side extraction and server-side tesseract OCR for scanned docs.',
    codeSnippet: `// lib/ocr.ts - Extracting text from document uploads
export async function processDocument(file: File) {
  const text = await extractTextFromPDF(file)
  const tables = await parseDocumentTables(file)
  return { content: text, metadata: { pages: file.size, type: file.type } }
}`,
    metrics: [{ label: 'Format Support', value: 'PDF, DOCX, TXT, PNG, JPG' }, { label: 'OCR Speed', value: '< 450ms / page' }]
  },
  {
    step: 2,
    title: 'Text Extraction & Parsing',
    shortTitle: 'Extract',
    subtitle: 'Recursive boundary-aware split',
    description: 'Split text into 512-token chunks with 64-token overlap, preserving paragraph context and markdown structure.',
    codeSnippet: `// lib/chunking.ts - Recursive boundary-aware splitter
export function chunkDocument(text: string, chunkSize = 512, overlap = 64) {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap: overlap })
  return splitter.splitText(text)
}`,
    metrics: [{ label: 'Chunk Size', value: '512 tokens' }, { label: 'Context Overlap', value: '64 tokens' }]
  },
  {
    step: 3,
    title: 'Adaptive Chunking Engine',
    shortTitle: 'Chunk',
    subtitle: 'Boundary-aware splitting',
    description: 'Intelligent chunking preserving paragraph boundaries, code blocks, and markdown structure.',
    codeSnippet: `// lib/chunking.ts
function adaptiveChunk(text: string) {
  const boundaries = detectBoundaries(text) // paragraphs, code fences, headers
  return splitAtBoundaries(text, boundaries, { maxSize: 512, overlap: 64 })
}`,
    metrics: [{ label: 'Boundary Types', value: 'Paragraph, Code, H1-H6' }, { label: 'Avg Chunk', value: '480 tokens' }]
  },
  {
    step: 4,
    title: 'Multi-Model Dense Embeddings',
    shortTitle: 'Embed',
    subtitle: 'Vector representations via Gemini & Cohere',
    description: 'Generates 768d or 1024d dense vector embeddings using Google Gemini text-embedding-004 or Cohere embed-english-v3.0.',
    codeSnippet: `// lib/generate-embeddings.ts
const response = await googleAI.embedContent({
  model: 'text-embedding-004',
  content: { parts: [{ text: chunk }] }
})
const embedding = response.embedding.values`,
    metrics: [{ label: 'Embedding Model', value: 'text-embedding-004' }, { label: 'Dimensions', value: '768d dense vector' }]
  },
  {
    step: 5,
    title: 'HNSW Indexing in pgvector',
    shortTitle: 'Index',
    subtitle: 'Sub-millisecond ANN search',
    description: 'Stores vectors in Supabase PostgreSQL using pgvector with HNSW index configuration (m=16, ef_construction=64).',
    codeSnippet: `-- Supabase SQL: HNSW Vector Indexing
CREATE INDEX ON document_chunks 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);`,
    metrics: [{ label: 'Index Algorithm', value: 'HNSW Cosine' }, { label: 'Search Latency', value: '1.8 ms' }]
  },
  {
    step: 6,
    title: 'HyDE Query Expansion',
    shortTitle: 'Understand',
    subtitle: 'Hypothetical Document Embeddings',
    description: 'Generates synthetic answer for incoming queries to bridge vocabulary mismatch between user questions and technical corpus.',
    codeSnippet: `// lib/retrieval.ts - HyDE Expansion
const hypotheticalDoc = await generateSyntheticAnswer(userQuery)
const hydeVector = await getEmbedding(hypotheticalDoc)`,
    metrics: [{ label: 'Recall Boost', value: '+34%' }, { label: 'Vocabulary Match', value: 'Zero-shot HyDE' }]
  },
  {
    step: 7,
    title: 'Hybrid BM25 + Vector Search',
    shortTitle: 'Retrieve',
    subtitle: 'Full-text + Cosine distance',
    description: 'Combines PostgreSQL tsvector keyword matching with pgvector cosine similarity.',
    codeSnippet: `-- Hybrid SQL Query
SELECT id, chunk_content,
  ts_rank_cd(text_vector, websearch_to_tsquery(query_text)) AS bm25_score,
  1 - (embedding <=> query_embedding) AS vector_score
FROM document_chunks WHERE workspace_id = $1`,
    metrics: [{ label: 'BM25 Weight', value: '0.4' }, { label: 'Vector Weight', value: '0.6' }]
  },
  {
    step: 8,
    title: 'Reciprocal Rank Fusion',
    shortTitle: 'Generate',
    subtitle: 'RRF k=60 unification',
    description: 'Merges BM25 and vector search using RRF formula without score normalization bias.',
    codeSnippet: `// RRF Calculation
function rrfScore(rankBM25: number, rankVector: number, k = 60) {
  return (1 / (k + rankBM25)) + (1 / (k + rankVector))
}`,
    metrics: [{ label: 'RRF Constant k', value: '60' }, { label: 'Precision@5', value: '96.2%' }]
  },
  {
    step: 9,
    title: 'Multi-Model Streaming LLM',
    shortTitle: 'Answer',
    subtitle: 'Gemini, Groq, Cohere & OpenAI',
    description: 'Streams response directly to user with exact file name and page citations using Server-Sent Events (SSE).',
    codeSnippet: `// pages/api/chat.ts - Streaming Response
const stream = await aiProvider.streamText({
  model: selectedModel,
  system: 'You are VectorMind Assistant. Answer strictly using cited context.',
  prompt: formattedPrompt
})
return new StreamingTextResponse(stream)`,
    metrics: [{ label: 'TTFT', value: '140ms' }, { label: 'Supported Models', value: 'Gemini, Groq, Cohere, OpenAI' }]
  }
]

const FEATURES: FeatureCard[] = [
  { icon: <Eye className="w-5 h-5" />, title: 'Multimodal OCR', description: 'Extract text, tables, diagrams and more.' },
  { icon: <Search className="w-5 h-5" />, title: 'Hybrid Retrieval', description: 'Semantic + keyword search.' },
  { icon: <Cpu className="w-5 h-5" />, title: 'HyDE Expansion', description: 'Bridge vocab with hypothetical queries.' },
  { icon: <Layers className="w-5 h-5" />, title: 'Rank Fusion', description: 'RRF for maximum relevant results.' },
  { icon: <FileText className="w-5 h-5" />, title: 'File-Level Context', description: 'Associate entire document mapping.' },
  { icon: <Server className="w-5 h-5" />, title: 'Multi-Model', description: 'Gemini, Groq, Cohere, OpenAI.' },
  { icon: <GitBranch className="w-5 h-5" />, title: 'Workspaces', description: 'Organize knowledge by projects.' },
  { icon: <Activity className="w-5 h-5" />, title: 'Streaming Answers', description: 'Fast, real-time SSE responses.' },
  { icon: <Smartphone className="w-5 h-5" />, title: 'PWA Ready', description: 'Install on any device.' },
  { icon: <Code className="w-5 h-5" />, title: 'Developer Friendly', description: 'Open source, self-hostable.' },
]

const FILE_TYPES = [
  { label: 'PDF', icon: <FileText className="w-6 h-6" />, color: 'text-red-400' },
  { label: 'DOCX', icon: <FileCode className="w-6 h-6" />, color: 'text-blue-400' },
  { label: 'TXT', icon: <FileText className="w-6 h-6" />, color: 'text-zinc-400' },
  { label: 'Images', icon: <ImageIcon className="w-6 h-6" />, color: 'text-amber-400' },
  { label: 'Code', icon: <Code className="w-6 h-6" />, color: 'text-emerald-400' },
  { label: 'Data', icon: <Database className="w-6 h-6" />, color: 'text-purple-400' },
]

// ─── SCROLL REVEAL HOOK ────────────────────────────────────────────────────────
function useScrollReveal() {
  useEffect(() => {
    const revealElements = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale, .reveal-cta')
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active')
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )

    revealElements.forEach((el) => observer.observe(el))

    return () => {
      revealElements.forEach((el) => observer.unobserve(el))
    }
  }, [])
}

// ─── SYNTAX HIGHLIGHTER HELPER ────────────────────────────────────────────────
function renderSyntaxCode(code: string) {
  const lines = code.split('\n')
  return (
    <div className="font-mono text-[12px] leading-relaxed select-text space-y-0.5">
      {lines.map((line, idx) => {
        if (line.trim().startsWith('//') || line.trim().startsWith('--') || line.trim().startsWith('#')) {
          return (
            <div key={idx} className="flex items-center">
              <span className="w-7 shrink-0 text-zinc-600 text-[10px] select-none text-right pr-3 opacity-40 font-mono">{idx + 1}</span>
              <span className="text-emerald-400/90 italic font-mono">{line}</span>
            </div>
          )
        }
        
        const tokens = line.split(/(\s+|[(){}[\].,;:=<>+*\-/])/).map((token, tIdx) => {
          if (['export', 'async', 'function', 'const', 'let', 'var', 'return', 'await', 'import', 'from', 'SELECT', 'FROM', 'WHERE', 'CREATE', 'INDEX', 'ON', 'USING', 'WITH', 'AS'].includes(token)) {
            return <span key={tIdx} className="text-purple-400 font-bold">{token}</span>
          }
          if (['processDocument', 'extractTextFromPDF', 'parseDocumentTables', 'chunkDocument', 'adaptiveChunk', 'detectBoundaries', 'splitAtBoundaries', 'embedContent', 'generateSyntheticAnswer', 'getEmbedding', 'rrfScore', 'streamText'].includes(token)) {
            return <span key={tIdx} className="text-cyan-300 font-medium">{token}</span>
          }
          if (['File', 'RecursiveCharacterTextSplitter', 'StreamingTextResponse', 'hnsw', 'vector_cosine_ops', 'tsvector', 'ts_rank_cd', 'websearch_to_tsquery'].includes(token)) {
            return <span key={tIdx} className="text-amber-300">{token}</span>
          }
          if (token.startsWith("'") || token.startsWith('"') || token.startsWith("`")) {
            return <span key={tIdx} className="text-teal-300">{token}</span>
          }
          if (!isNaN(Number(token)) && token.trim() !== '') {
            return <span key={tIdx} className="text-orange-400 font-bold">{token}</span>
          }
          return <span key={tIdx}>{token}</span>
        })

        return (
          <div key={idx} className="flex items-center">
            <span className="w-7 shrink-0 text-zinc-600 text-[10px] select-none text-right pr-3 opacity-40 font-mono">{idx + 1}</span>
            <span className="text-zinc-200">{tokens}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function VectorMindLanding() {
  const [selectedStep, setSelectedStep] = useState<number>(1)
  const [isAutoPlaying, setIsAutoPlaying] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [canInstallPWA, setCanInstallPWA] = useState(false)
  const [showPWAModal, setShowPWAModal] = useState(false)

  // Track PWA installation prompt
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setCanInstallPWA(true)
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
  }, [])

  const installPWA = useCallback(async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') {
        setCanInstallPWA(false)
      }
      setDeferredPrompt(null)
    } else {
      setShowPWAModal(true)
    }
  }, [deferredPrompt])

  // Auto-play steps timer
  useEffect(() => {
    if (!isAutoPlaying) return
    const timer = setInterval(() => {
      setSelectedStep((prev) => (prev >= 9 ? 1 : prev + 1))
    }, 3500)
    return () => clearInterval(timer)
  }, [isAutoPlaying])

  // Activate scroll reveal
  useScrollReveal()

  // Track scroll for dynamic navbar transformation
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setScrolled(true)
      } else {
        setScrolled(false)
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Copy code helper
  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCode(id)
    setTimeout(() => setCopiedCode(null), 2000)
  }, [])

  const currentStepData = useMemo(() => {
    return STEPS_DATA.find((s) => s.step === selectedStep) || STEPS_DATA[0]
  }, [selectedStep])

  return (
    <div className="min-h-screen bg-[#050709] text-zinc-100 font-sans selection:bg-emerald-500 selection:text-zinc-950 relative overflow-x-hidden">
      <Head>
        <title>VectorMind — Hybrid RAG &amp; CAG Document Intelligence Platform</title>
        <meta name="description" content="Production-grade document intelligence platform featuring Hybrid RAG + CAG, pgvector HNSW indexing, HyDE query expansion, BM25 rank fusion, and multi-model LLM router." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* ── Background Ambient Effects ── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-emerald-500/[0.015] blur-[180px] rounded-full float-orb-1" />
        <div className="absolute top-[500px] right-[-100px] w-[400px] h-[400px] bg-teal-500/[0.01] blur-[140px] rounded-full float-orb-2" />
        <div className="absolute bottom-[200px] left-[-80px] w-[350px] h-[350px] bg-emerald-600/[0.01] blur-[120px] rounded-full float-orb-1" />
        {/* Subtle lavender/sand warm undertone */}
        <div className="absolute top-[300px] left-[40%] w-[500px] h-[300px] bg-violet-500/[0.015] blur-[160px] rounded-full float-orb-2" />
        <div className="absolute bottom-[400px] right-[20%] w-[400px] h-[250px] bg-amber-500/[0.01] blur-[140px] rounded-full float-orb-1" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370a_1px,transparent_1px),linear-gradient(to_bottom,#1f29370a_1px,transparent_1px)] bg-[size:48px_48px]" />
      </div>

      {/* ════════════════════════════════════════════════════════
          NAVIGATION BAR (Dynamic Glassmorphism Header)
          ════════════════════════════════════════════════════════ */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out ${
          scrolled
            ? 'py-3 bg-[#050709]/85 backdrop-blur-2xl border-b border-emerald-500/20 shadow-[0_10px_30px_rgba(0,0,0,0.8)] shadow-emerald-950/20'
            : 'py-6 bg-transparent border-b border-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-400 p-0.5 shadow-[0_0_18px_rgba(16,185,129,0.3)] group-hover:shadow-[0_0_28px_rgba(16,185,129,0.5)] group-hover:scale-105 transition-all duration-300">
                <div className="w-full h-full bg-[#050709] rounded-[10px] flex items-center justify-center">
                  <Zap className="w-4.5 h-4.5 text-emerald-400 fill-current" />
                </div>
              </div>
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-zinc-100 to-emerald-400 bg-clip-text text-transparent">
                VectorMind
              </span>
            </Link>
          </div>

          {/* Desktop Nav Links (Pill Style Container) */}
          <div className="hidden md:flex items-center gap-1 px-4 py-1.5 rounded-full bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-xl shadow-inner text-[13px] font-medium text-zinc-400 hover:border-zinc-700/60 transition-all duration-300">
            <a href="#product" className="px-3.5 py-1.5 rounded-full hover:text-white hover:bg-zinc-800/60 transition-all duration-200">Product</a>
            <a href="#architecture" className="px-3.5 py-1.5 rounded-full hover:text-white hover:bg-zinc-800/60 transition-all duration-200">Architecture</a>
            <a href="#features" className="px-3.5 py-1.5 rounded-full hover:text-white hover:bg-zinc-800/60 transition-all duration-200">Features</a>
            <a href="#docs" className="px-3.5 py-1.5 rounded-full hover:text-white hover:bg-zinc-800/60 transition-all duration-200">Docs</a>
          </div>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="https://github.com/krishsoni15/VectorMind"
              target="_blank"
              rel="noreferrer"
              className="w-9 h-9 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/40 flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition-all duration-300 shadow-sm group"
              aria-label="GitHub Repository"
              title="GitHub Repository"
            >
              <Github className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </a>
            <AccountMenu />
          </div>

          {/* Mobile Menu Toggle */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl bg-zinc-900/90 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-zinc-800 bg-[#050709]/95 backdrop-blur-2xl px-4 py-4 space-y-3 text-sm animate-slide-up">
            <a href="#product" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-zinc-300 hover:text-emerald-400 transition-colors">Product</a>
            <a href="#architecture" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-zinc-300 hover:text-emerald-400 transition-colors">Architecture</a>
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-zinc-300 hover:text-emerald-400 transition-colors">Features</a>
            <a href="#docs" onClick={() => setMobileMenuOpen(false)} className="block py-2 text-zinc-300 hover:text-emerald-400 transition-colors">Docs</a>
            <div className="pt-2 flex flex-col gap-2">
              <a href="https://github.com/krishsoni15/VectorMind" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white">
                <Github className="w-4 h-4" /> GitHub
              </a>
              <Link href="/app" className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20">
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* ════════════════════════════════════════════════════════
          HERO SECTION (Powered by DarkVeil WebGL Background)
          ════════════════════════════════════════════════════════ */}
      <section className="relative pt-20 pb-20 md:pt-28 md:pb-32 z-10 overflow-hidden min-h-[650px] lg:min-h-[720px] flex items-center">
        {/* Full-bleed WebGL DarkVeil background */}
        <div className="absolute inset-0 z-0 opacity-40 pointer-events-auto">
          <DarkVeil
            hueShift={135}
            noiseIntensity={0.02}
            scanlineIntensity={0.04}
            speed={0.35}
            scanlineFrequency={0.15}
            warpAmount={0.18}
            resolutionScale={1}
            lightMode={false}
          />
        </div>

        {/* Ambient Top & Bottom Vignette Overlay for smooth page integration */}
        <div className="absolute inset-0 z-[1] bg-gradient-to-b from-[#050709]/90 via-[#050709]/40 to-[#050709] pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-12 items-center">
            
            {/* Left Column: Text Content */}
            <div className="text-left">
              {/* Badge */}
              <div className="hero-entrance hero-entrance-1 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono mb-6 shadow-[0_0_15px_rgba(16,185,129,0.15)] backdrop-blur-md">
                <Zap className="w-3.5 h-3.5 fill-current text-emerald-400" />
                <span className="font-semibold">AI KNOWLEDGE INFRASTRUCTURE</span>
              </div>

              {/* Main Title */}
              <h1 className="hero-entrance hero-entrance-2 text-4xl sm:text-5xl lg:text-[3.8rem] font-extrabold tracking-tight text-white leading-[1.08] mb-6">
                Turn your documents into an{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300 text-gradient-animate">
                  intelligent knowledge system.
                </span>
              </h1>

              {/* Description */}
              <p className="hero-entrance hero-entrance-3 text-base sm:text-lg text-zinc-300 max-w-xl leading-relaxed mb-9 font-normal drop-shadow-sm">
                VectorMind combines Hybrid RAG, CAG, semantic retrieval, vector search, and multi-model orchestration into one powerful workspace for querying complex knowledge bases.
              </p>

              {/* CTAs */}
              <div className="hero-entrance hero-entrance-4 flex flex-col sm:flex-row items-start gap-4 mb-9">
                <Link
                  href="/app"
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold text-sm font-mono flex items-center justify-center gap-2.5 shadow-[0_0_24px_rgba(16,185,129,0.3)] hover:shadow-[0_0_36px_rgba(16,185,129,0.5)] transition-all duration-300 btn-hover-lift"
                >
                  Get Started <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="#architecture"
                  className="w-full sm:w-auto px-8 py-4 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/80 hover:border-emerald-500/50 text-zinc-200 text-sm font-mono flex items-center justify-center gap-2 transition-all duration-300 btn-hover-lift backdrop-blur-xl"
                >
                  View Architecture
                </a>
              </div>

              {/* Tech Chips */}
              <div className="hero-entrance hero-entrance-5 flex flex-wrap items-center gap-2.5 text-xs font-mono text-zinc-300">
                {['RAG', 'CAG', 'pgvector', 'HyDE', 'RRF', 'Multi-Model'].map((chip) => (
                  <span key={chip} className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-md shadow-sm">
                    <span className="text-emerald-400 font-bold">&bull;</span> {chip}
                  </span>
                ))}
              </div>
            </div>

            {/* Right Column: Hero Visual */}
            <div className="hero-entrance hero-entrance-5 relative flex items-center justify-center lg:justify-end">
              <div className="relative w-full max-w-lg lg:max-w-xl">
                {/* Background Ambient Glow */}
                <div className="absolute inset-0 bg-emerald-500/[0.04] blur-[100px] rounded-full pointer-events-none" />
                
                {/* Large Robot Head Image */}
                <img
                  src="/images/hero_robot_clean.png"
                  alt="VectorMind AI Intelligence Engine"
                  className="relative z-10 w-full h-auto object-contain breathe-glow hero-robot-blend pointer-events-none drop-shadow-[0_0_30px_rgba(16,185,129,0.15)]"
                  width={640}
                  height={640}
                />

                {/* Floating Label - Top Right */}
                <div className="absolute top-12 right-2 lg:right-[-12px] z-20 text-right animate-float">
                  <div className="text-xs font-mono text-zinc-300 tracking-[0.2em] uppercase font-medium leading-tight">
                    YOUR<br />
                    DOCUMENTS<br />
                    <span className="text-zinc-100 font-bold tracking-[0.22em]">AMPLIFIED</span>
                  </div>
                  <div className="mt-2.5 w-10 h-[2px] bg-emerald-400 ml-auto shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                </div>

                {/* Floating Label - Bottom Right */}
                <div className="absolute bottom-16 right-2 lg:right-[-8px] z-20 text-right animate-float" style={{ animationDelay: '1.2s' }}>
                  <div className="border-r-2 border-emerald-400 pr-3.5 py-1">
                    <span className="text-xs font-mono italic text-zinc-200 font-medium">
                      &ldquo;From files<br />to intelligence.&rdquo;
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          TRUSTED BY SECTION
          ════════════════════════════════════════════════════════ */}
      <section className="py-12 md:py-16 border-t border-zinc-800/40 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="reveal">
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 font-bold">
              Trusted by Knowledge Workers
            </span>
          </div>
          <div className="reveal reveal-delay-2 mt-6 flex flex-wrap items-center justify-center gap-3">
            {['Developers', 'Researchers', 'Businesses', 'Educators', 'Individuals'].map((label, idx) => (
              <span
                key={label}
                className="px-5 py-2 rounded-full bg-zinc-900/60 border border-zinc-800/80 text-xs font-medium text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/40 transition-all duration-300 cursor-default card-hover-glow"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          PROBLEM & SOLUTION SECTION (Exact match to User Screenshot)
          ════════════════════════════════════════════════════════ */}
      <section id="architecture" className="py-20 md:py-28 border-t border-zinc-800/40 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            
            {/* THE PROBLEM (Left Column - 5 cols) */}
            <div className="lg:col-span-5">
              <div className="reveal">
                <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-500 font-bold">
                  THE PROBLEM
                </span>
                <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
                  Your knowledge is everywhere.
                </h2>
              </div>

              {/* Scattered File Cards Cluster */}
              <div className="reveal reveal-delay-2 mt-8 grid grid-cols-3 gap-3 max-w-sm">
                <div className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex flex-col items-center justify-center gap-1.5 card-hover-glow card-shine">
                  <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-300 font-bold">PDF</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex flex-col items-center justify-center gap-1.5 card-hover-glow card-shine mt-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-300 font-bold">DOCX</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex flex-col items-center justify-center gap-1.5 card-hover-glow card-shine">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-300 font-bold">TXT</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex flex-col items-center justify-center gap-1.5 card-hover-glow card-shine">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Code className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-300 font-bold">CODE</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex flex-col items-center justify-center gap-1.5 card-hover-glow card-shine mt-4">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-300 font-bold">IMAGES</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 flex flex-col items-center justify-center gap-1.5 card-hover-glow card-shine">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400">
                    <Database className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-300 font-bold">DATA</span>
                </div>
              </div>
            </div>

            {/* Center Arrow Connector (1 col on desktop) */}
            <div className="hidden lg:flex lg:col-span-1 items-center justify-center relative">
              <div className="w-12 h-12 rounded-full bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.2)] animate-pulse">
                <ArrowRight className="w-5 h-5" />
              </div>
            </div>

            {/* THE SOLUTION (Right Column - 6 cols) */}
            <div className="lg:col-span-6">
              <div className="reveal-right">
                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed mb-6">
                  PDFs, docs, code, reports, images &mdash; important information is scattered across different files and tools, making it hard to search, connect and get real insights.
                </p>
                <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-emerald-400 font-bold">
                  THE SOLUTION
                </span>
                <h2 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight mb-6">
                  One searchable intelligence layer.
                </h2>
              </div>

              {/* VectorMind Core Engine Node Box */}
              <div className="reveal-right reveal-delay-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/15 backdrop-blur-xl p-6 text-center shadow-[0_0_28px_rgba(16,185,129,0.1)]">
                <div className="flex items-center justify-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-emerald-400 fill-current" />
                  </div>
                  <span className="text-xl font-extrabold text-white">VectorMind</span>
                </div>
                <div className="mt-2 text-xs font-mono text-zinc-400">
                  RAG &bull; CAG &bull; Multi-Model
                </div>
              </div>

              {/* SVG Connecting Branches */}
              <div className="reveal-right reveal-delay-4 relative -mt-1 z-0">
                <svg className="w-full h-10 text-emerald-400/60" viewBox="0 0 400 30" fill="none">
                  <path d="M200 0 C200 15, 50 10, 50 30" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                  <path d="M200 0 C200 15, 150 10, 150 30" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                  <path d="M200 0 C200 15, 250 10, 250 30" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                  <path d="M200 0 C200 15, 350 10, 350 30" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
                </svg>
              </div>

              {/* 4 Feature Action Nodes */}
              <div className="reveal-right reveal-delay-5 grid grid-cols-4 gap-2 text-center mt-1">
                {[
                  { label: 'Search', icon: <Search className="w-3.5 h-3.5" /> },
                  { label: 'Understand', icon: <Cpu className="w-3.5 h-3.5" /> },
                  { label: 'Reason', icon: <Zap className="w-3.5 h-3.5" /> },
                  { label: 'Cite', icon: <CheckCircle className="w-3.5 h-3.5" /> },
                ].map((node) => (
                  <div key={node.label} className="flex flex-col items-center gap-1.5">
                    <div className="w-8 h-8 rounded-full bg-zinc-900 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.15)]">
                      {node.icon}
                    </div>
                    <span className="text-[10px] font-mono text-zinc-300 font-semibold">{node.label}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          REAL PRODUCT WORKSPACE DEMO (Exact match to User Screenshot)
          ════════════════════════════════════════════════════════ */}
      <section id="product" className="py-20 md:py-28 border-t border-zinc-800/40 relative z-10 bg-zinc-950/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            
            {/* Left Column (5 cols) */}
            <div className="lg:col-span-5">
              <div className="reveal-left">
                <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-emerald-400 font-bold">
                  REAL PRODUCT
                </span>
                <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
                  A clean workspace for deeper thinking.
                </h2>
                <p className="mt-4 text-sm text-zinc-400 leading-relaxed">
                  Search knowledge, inspect sources, switch models, and reason across documents &mdash; all in one place.
                </p>
              </div>

              {/* 4 Green Rounded Square Icon Items */}
              <div className="reveal-left reveal-delay-3 mt-8 space-y-4 text-sm text-zinc-200 font-medium">
                {[
                  { label: 'Chat with your documents', icon: <MessageSquare className="w-4 h-4" /> },
                  { label: 'View source citations', icon: <FileText className="w-4 h-4" /> },
                  { label: 'Switch between AI models', icon: <Cpu className="w-4 h-4" /> },
                  { label: 'Organize with workspaces', icon: <GitBranch className="w-4 h-4" /> },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                      {item.icon}
                    </div>
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="reveal-left reveal-delay-5 mt-8 flex flex-col sm:flex-row items-center gap-3">
                <Link
                  href="/app"
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs font-mono flex items-center justify-center gap-2 transition-all duration-300 btn-hover-lift shadow-[0_0_18px_rgba(16,185,129,0.2)]"
                >
                  Try Live Demo <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <a
                  href="https://github.com/krishsoni15/VectorMind"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/60 hover:border-emerald-500/40 text-zinc-200 text-xs font-mono flex items-center justify-center gap-2 transition-all duration-300 btn-hover-lift"
                >
                  <Github className="w-4 h-4" /> View on GitHub
                </a>
              </div>
            </div>

            {/* Right Column: Interactive App Workspace Mockup (7 cols) */}
            <div className="lg:col-span-7 reveal-right reveal-delay-2">
              <div className="rounded-2xl border border-emerald-500/25 bg-[#090b0d] p-4 sm:p-5 shadow-[0_0_40px_rgba(0,0,0,0.7)] backdrop-blur-xl card-hover-glow">
                
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                  
                  {/* Left Sidebar inside Mockup (4 cols) */}
                  <div className="hidden sm:flex sm:col-span-4 flex-col justify-between border-r border-zinc-800/80 pr-4 py-1 space-y-4">
                    <div className="space-y-4">
                      {/* Logo */}
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-emerald-500 flex items-center justify-center text-zinc-950 font-bold">
                          <Zap className="w-3.5 h-3.5 fill-current" />
                        </div>
                        <span className="text-xs font-bold text-white tracking-tight">VectorMind</span>
                      </div>

                      {/* New Chat Button */}
                      <div className="py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.2)] transition-all">
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>New Chat</span>
                      </div>

                      {/* Navigation Links */}
                      <div className="space-y-1 text-[11px] font-mono">
                        <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-zinc-900/80 text-zinc-300">
                          <Search className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Search</span>
                        </div>
                        <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 cursor-pointer">
                          <FileText className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Documents</span>
                        </div>
                        <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 cursor-pointer">
                          <GitBranch className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Workspaces</span>
                        </div>
                        <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 cursor-pointer">
                          <Settings className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Settings</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Profile */}
                    <div className="flex items-center gap-2 pt-3 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-300">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-[10px] font-bold">
                        K
                      </div>
                      <span className="font-semibold">Krish</span>
                    </div>
                  </div>

                  {/* Right Chat Area inside Mockup (8 cols) */}
                  <div className="sm:col-span-8 flex flex-col justify-between space-y-4">
                    
                    {/* Header Bar */}
                    <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-300 flex items-center gap-1.5">
                          <Cpu className="w-3 h-3 text-emerald-400" />
                          Gemini Flash
                          <ChevronDown className="w-3 h-3 text-zinc-500" />
                        </span>
                      </div>
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-[10px] font-bold">
                        K
                      </div>
                    </div>

                    {/* User Prompt Bubble */}
                    <div className="flex justify-end">
                      <div className="px-3.5 py-2 rounded-xl bg-zinc-800/90 border border-zinc-700/60 text-[11px] text-zinc-200 font-mono max-w-[85%]">
                        What are the key findings from the Q3 research report?
                      </div>
                    </div>

                    {/* AI Response Card */}
                    <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800/80 text-xs text-zinc-300 space-y-2.5 leading-relaxed">
                      <p className="font-semibold text-white text-[11px]">Based on the documents, here are the key findings:</p>
                      
                      <div className="space-y-2 text-[11px] font-sans text-zinc-300">
                        <div>
                          <div className="font-bold text-white flex items-center gap-1">
                            <span>1. Market Growth</span>
                          </div>
                          <p className="text-zinc-400 text-[10px] pl-3">
                            The platform saw a 42% increase in user engagement in Q3 compared to the previous quarter.
                          </p>
                        </div>

                        <div>
                          <div className="font-bold text-white flex items-center gap-1">
                            <span>2. Revenue Trends</span>
                          </div>
                          <p className="text-zinc-400 text-[10px] pl-3">
                            Revenue grew by 28%, with significant contributions from enterprise clients.
                          </p>
                        </div>

                        <div>
                          <div className="font-bold text-white flex items-center gap-1">
                            <span>3. User Feedback</span>
                          </div>
                          <p className="text-zinc-400 text-[10px] pl-3">
                            Users highlighted improved performance and requested more integrations.
                          </p>
                        </div>
                      </div>

                      {/* Source Citation Pills */}
                      <div className="pt-2 border-t border-zinc-800/60">
                        <span className="text-[10px] font-mono text-zinc-500 uppercase block mb-1.5">Sources:</span>
                        <div className="flex flex-wrap gap-1.5 text-[9px] font-mono">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Q3-report.pdf
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> analysis.md
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-red-500/15 border border-red-500/30 text-red-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> survey.pdf
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Prompt Input Bar */}
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex-1 h-9 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center px-3 text-[11px] text-zinc-500 font-mono">
                        Ask a follow-up question...
                      </div>
                      <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center text-zinc-950 font-bold shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                        <ArrowUpRight className="w-4 h-4 stroke-[3]" />
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          POWERFUL FEATURES GRID
          ════════════════════════════════════════════════════════ */}
      <section id="features" className="py-20 md:py-28 border-t border-zinc-800/40 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <div className="reveal">
              <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500 font-bold">
                Powerful Features
              </span>
              <h2 className="mt-3 text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
                Everything you need. Nothing extra.
              </h2>
            </div>
          </div>

          <div className="mt-14 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {FEATURES.map((feature, idx) => (
              <div
                key={feature.title}
                className={`reveal reveal-delay-${Math.min(idx + 1, 10)} p-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/30 card-hover-glow card-shine flex flex-col gap-3`}
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  {feature.icon}
                </div>
                <h3 className="text-sm font-bold text-white leading-snug">{feature.title}</h3>
                <p className="text-[11px] text-zinc-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          RETRIEVAL PIPELINE (React Bits Style Interactive Stepper)
          ════════════════════════════════════════════════════════ */}
      <section id="pipeline" className="py-20 md:py-28 border-t border-zinc-800/40 relative z-10 bg-[#06080a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Header Bar */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono font-bold tracking-widest uppercase mb-3">
                <Zap className="w-3.5 h-3.5 fill-current" />
                HOW IT WORKS
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
                From documents to intelligent answers.
              </h2>
            </div>
            
            {/* Auto-Play & Navigation Controls */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                className={`px-3.5 py-2 rounded-xl border text-xs font-mono font-semibold flex items-center gap-2 transition-all duration-300 ${
                  isAutoPlaying
                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                    : 'bg-zinc-900/80 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                }`}
              >
                {isAutoPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{isAutoPlaying ? 'Autoplay Active' : 'Autoplay'}</span>
              </button>

              <div className="flex items-center gap-1.5 bg-zinc-900/80 border border-zinc-800 p-1 rounded-xl">
                <button
                  onClick={() => setSelectedStep((prev) => (prev <= 1 ? 9 : prev - 1))}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  aria-label="Previous step"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono font-bold text-zinc-300 px-1">
                  {selectedStep} / 9
                </span>
                <button
                  onClick={() => setSelectedStep((prev) => (prev >= 9 ? 1 : prev + 1))}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                  aria-label="Next step"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Animated Progress Bar */}
          <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden mb-8 border border-zinc-800/80">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 transition-all duration-500 ease-out rounded-full shadow-[0_0_12px_rgba(16,185,129,0.5)]"
              style={{ width: `${(selectedStep / 9) * 100}%` }}
            />
          </div>

          {/* React Bits Interactive Tab Grid / Pill Slider */}
          <div className="no-scrollbar overflow-x-auto pb-4 mb-8">
            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2.5 min-w-[700px] lg:min-w-0">
              {[
                { step: 1, title: 'Ingest', sub: 'Documents', icon: <FileText className="w-4 h-4" /> },
                { step: 2, title: 'Extract', sub: 'OCR & Parsing', icon: <Search className="w-4 h-4" /> },
                { step: 3, title: 'Chunk', sub: 'Smart Split', icon: <Sliders className="w-4 h-4" /> },
                { step: 4, title: 'Embed', sub: 'Dense Vector', icon: <Cpu className="w-4 h-4" /> },
                { step: 5, title: 'Index', sub: 'pgvector HNSW', icon: <Database className="w-4 h-4" /> },
                { step: 6, title: 'Retrieve', sub: 'Hybrid Search', icon: <Zap className="w-4 h-4" /> },
                { step: 7, title: 'RRF', sub: 'Rank Fusion', icon: <Activity className="w-4 h-4" /> },
                { step: 8, title: 'Generate', sub: 'Multi-Model', icon: <Shield className="w-4 h-4" /> },
                { step: 9, title: 'Answer', sub: 'Citations', icon: <MessageSquare className="w-4 h-4" /> },
              ].map((st) => (
                <button
                  key={st.step}
                  onClick={() => {
                    setSelectedStep(st.step)
                    setIsAutoPlaying(false)
                  }}
                  className={`relative p-3.5 rounded-2xl border text-left transition-all duration-300 flex flex-col justify-between gap-3 group overflow-hidden ${
                    selectedStep === st.step
                      ? 'border-emerald-500 bg-emerald-500/12 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/40'
                      : 'border-zinc-800/80 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 hover:bg-zinc-900/70'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      selectedStep === st.step
                        ? 'bg-emerald-500 text-zinc-950 shadow-[0_0_10px_rgba(16,185,129,0.4)]'
                        : 'bg-zinc-800/80 text-emerald-400 group-hover:bg-zinc-800'
                    }`}>
                      {st.icon}
                    </div>
                    <span className={`text-[10px] font-mono font-extrabold ${
                      selectedStep === st.step ? 'text-emerald-400' : 'text-zinc-600'
                    }`}>
                      0{st.step}
                    </span>
                  </div>

                  <div>
                    <div className="font-extrabold text-xs tracking-tight text-white">{st.title}</div>
                    <div className="text-[10px] font-mono text-zinc-500 font-medium truncate mt-0.5">{st.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* React Bits Card Container for Selected Step */}
          <div className="relative rounded-3xl border border-emerald-500/30 bg-[#090b0e]/95 p-6 sm:p-10 font-mono text-xs backdrop-blur-2xl shadow-[0_0_50px_rgba(16,185,129,0.08)] overflow-hidden">
            {/* Ambient Corner Glow */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-teal-500/5 rounded-full blur-[80px] pointer-events-none" />

            <div className="relative z-10">
              {/* Header Info Bar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 border-b border-zinc-800/80 pb-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      STEP {currentStepData.step} OF 9
                    </span>
                    <span className="text-zinc-500 text-xs font-mono font-medium">| {currentStepData.subtitle}</span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{currentStepData.title}</h3>
                  <p className="text-zinc-300 text-xs font-sans max-w-2xl leading-relaxed">{currentStepData.description}</p>
                </div>

                {/* Metrics Pill Cards */}
                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  {currentStepData.metrics.map((m, idx) => (
                    <div key={idx} className="px-4 py-3 rounded-2xl bg-zinc-950/90 border border-zinc-800/90 shadow-sm flex flex-col gap-0.5">
                      <div className="text-[10px] text-zinc-500 uppercase font-semibold tracking-wider">{m.label}</div>
                      <div className="text-xs font-extrabold text-emerald-400 font-mono">{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Code Sandbox Preview Box */}
              <div className="mt-6">
                <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/90 overflow-hidden shadow-inner">
                  {/* Code Bar Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/80 border-b border-zinc-800/80">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
                        <span className="w-3 h-3 rounded-full bg-yellow-500/80 inline-block" />
                        <span className="w-3 h-3 rounded-full bg-green-500/80 inline-block" />
                      </div>
                      <span className="text-zinc-400 text-xs font-mono font-medium ml-2 flex items-center gap-1.5">
                        <Code className="w-3.5 h-3.5 text-emerald-400" /> Implementation Source
                      </span>
                    </div>

                    <button
                      onClick={() => copyToClipboard(currentStepData.codeSnippet, `step-${currentStepData.step}`)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-300 hover:text-emerald-400 transition-all text-[11px] font-mono flex items-center gap-1.5"
                    >
                      {copiedCode === `step-${currentStepData.step}` ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Code Display with VS Code Syntax Highlighting */}
                  <div className="p-5 overflow-x-auto no-scrollbar bg-[#07090c]">
                    {renderSyntaxCode(currentStepData.codeSnippet)}
                  </div>
                </div>
              </div>

              {/* Bottom Step Switcher Footer */}
              <div className="mt-8 pt-6 border-t border-zinc-800/80 flex items-center justify-between gap-4">
                <button
                  disabled={selectedStep === 1}
                  onClick={() => {
                    setSelectedStep((prev) => Math.max(1, prev - 1))
                    setIsAutoPlaying(false)
                  }}
                  className={`px-5 py-2.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 transition-all ${
                    selectedStep === 1
                      ? 'opacity-40 border-zinc-800 text-zinc-600 cursor-not-allowed'
                      : 'border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:text-white hover:border-emerald-500/40 hover:bg-zinc-800'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" /> Previous Step
                </button>

                <button
                  disabled={selectedStep === 9}
                  onClick={() => {
                    setSelectedStep((prev) => Math.min(9, prev + 1))
                    setIsAutoPlaying(false)
                  }}
                  className={`px-6 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all shadow-md ${
                    selectedStep === 9
                      ? 'opacity-40 border border-zinc-800 text-zinc-600 cursor-not-allowed'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-[0_0_18px_rgba(16,185,129,0.3)]'
                  }`}
                >
                  <span>Next Step: Step {selectedStep === 9 ? 9 : selectedStep + 1}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

            </div>
          </div>

        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FULL-WIDTH CTA BANNER (Placed directly above Footer)
          ════════════════════════════════════════════════════════ */}
      <section className="w-full relative z-10 overflow-hidden border-t border-b border-emerald-500/30 bg-[#050709]">
        {/* Background Landscape Image - Edge to Edge */}
        <div className="absolute inset-0 z-0">
          <img
            src="/images/cta_landscape.png"
            alt="VectorMind Landscape CTA"
            className="w-full h-full object-cover opacity-85"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-950/95 via-[#050709]/90 to-[#050709]/80" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
                Ready to build your own knowledge system?
              </h2>
              <p className="mt-4 text-sm sm:text-base text-zinc-300 max-w-xl leading-relaxed">
                Get started with VectorMind and turn your documents into intelligence.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-start gap-4">
                <Link
                  href="/app"
                  className="px-8 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-sm font-mono flex items-center gap-2.5 shadow-[0_0_28px_rgba(16,185,129,0.3)] hover:shadow-[0_0_40px_rgba(16,185,129,0.5)] transition-all duration-300 btn-hover-lift"
                >
                  Get Started <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="https://github.com/krishsoni15/VectorMind"
                  target="_blank"
                  rel="noreferrer"
                  className="px-8 py-4 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/80 hover:border-emerald-500/40 text-zinc-200 text-sm font-mono flex items-center gap-2 transition-all duration-300 btn-hover-lift backdrop-blur-xl"
                >
                  <BookOpen className="w-4 h-4" /> View Documentation
                </a>
              </div>
            </div>

            {/* Right Side Typography Badge */}
            <div className="hidden lg:flex lg:col-span-4 flex-col items-end text-right">
              <div className="text-emerald-400 font-mono text-sm sm:text-base leading-snug font-medium border-r-2 border-emerald-400 pr-4">
                Documents<br />today.<br />
                <span className="text-emerald-300 font-bold">Intelligence<br />tomorrow.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FOOTER
          ════════════════════════════════════════════════════════ */}
      <footer className="py-12 md:py-16 border-t border-zinc-800/40 z-10 relative bg-[#030405] text-xs font-mono">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="reveal">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-zinc-800/40">
              {/* Brand */}
              <div className="md:col-span-2">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Zap className="w-4 h-4 fill-current" />
                  </div>
                  <span className="text-white font-bold text-sm">VectorMind</span>
                </div>
                <p className="text-zinc-500 text-[11px] max-w-xs leading-relaxed mb-4">
                  An open knowledge infrastructure for the next generation. Built with purpose.
                </p>
                <div className="flex items-center gap-3">
                  <a href="https://github.com/krishsoni15/VectorMind" target="_blank" rel="noreferrer" className="w-8 h-8 rounded-lg bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-center text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/40 transition-all" aria-label="GitHub">
                    <Github className="w-4 h-4" />
                  </a>
                  <a href="#" className="w-8 h-8 rounded-lg bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-center text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/40 transition-all" aria-label="X (Twitter)">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  </a>
                  <a href="#" className="w-8 h-8 rounded-lg bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-center text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/40 transition-all" aria-label="LinkedIn">
                    <Linkedin className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Product */}
              <div>
                <span className="text-zinc-400 font-bold uppercase text-[10px] tracking-wider">Product</span>
                <div className="mt-3 space-y-2 text-zinc-500">
                  <a href="#features" className="block hover:text-emerald-400 transition-colors">Features</a>
                  <a href="#architecture" className="block hover:text-emerald-400 transition-colors">Architecture</a>
                  <a href="#pipeline" className="block hover:text-emerald-400 transition-colors">RAG Pipeline</a>
                  <a href="#docs" className="block hover:text-emerald-400 transition-colors">Quickstart</a>
                </div>
              </div>

              {/* Technical */}
              <div>
                <span className="text-zinc-400 font-bold uppercase text-[10px] tracking-wider">Technical</span>
                <div className="mt-3 space-y-2 text-zinc-500">
                  <a href="#pipeline" className="block hover:text-emerald-400 transition-colors">Hybrid RAG</a>
                  <a href="#pipeline" className="block hover:text-emerald-400 transition-colors">CAG</a>
                  <a href="#pipeline" className="block hover:text-emerald-400 transition-colors">pgvector</a>
                  <a href="#pipeline" className="block hover:text-emerald-400 transition-colors">Multi-Model</a>
                </div>
              </div>
            </div>
          </div>

          <div className="reveal reveal-delay-2 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-zinc-600">
            <div>&copy; 2026 VectorMind. All rights reserved.</div>
            <div>Built by developers, for knowledge workers.</div>
          </div>
        </div>
      </footer>

    </div>
  )
}
