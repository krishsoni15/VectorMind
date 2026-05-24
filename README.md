<div align="center">
  <img src="https://raw.githubusercontent.com/krishsoni15/VectorMind/main/public/logo.png" alt="VectorMind Logo" width="120" />
  <h1>VectorMind</h1>
  <p><strong>Premium, Professional-Grade RAG & Autonomous AI Analysis Platform</strong></p>

  <p>
    <a href="#features">Features</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#setup">Setup</a> •
    <a href="#advanced-rag-prompt">AI Auto-Analysis Prompt</a>
  </p>
</div>

---

## 🧠 System Architecture Overview

VectorMind is a highly-optimized **Retrieval-Augmented Generation (RAG)** platform designed to enable context-aware semantic search, document analysis, and autonomous AI orchestration over custom knowledge vaults.

Built with a state-of-the-art serverless stack, VectorMind integrates **Next.js**, **Google Gemini**, **Cohere**, **Groq**, and **Supabase (PostgreSQL + pgvector)** to offer sub-second document indexing and fully-cited AI streaming.

### 🔄 Dual-Pipeline Architecture

1. **Ingestion Pipeline (Write-Path):** Extracts text (PDFs, Markdown, DOCX, Code), sanitizes null bytes, dynamically chunks via sliding-window, embeds using 768-dim/1024-dim models, and indexes via `pgvector`.
2. **Query Loop (Read-Path):** Converts user queries to embeddings via HyDE (Hypothetical Document Embeddings), performs fast negative-dot-product similarity matching, applies MMR (Maximal Marginal Relevance) + RRF (Reciprocal Rank Fusion), and streams answers via LLM.

---

## 💎 Premium Features

* **Multi-LLM Orchestration:** Switch between Google Gemini 2.5 Flash, Cohere Command-R, Groq Llama 3, and OpenAI ChatGPT dynamically.
* **Hybrid Search & Reranking:** Context compression, sliding-window token chunking, and intelligent reranking for zero-hallucination responses.
* **Enterprise-Grade UI:** Glassmorphism, smooth micro-animations, customizable dark mode, and an intuitive sliding sidebar workspace.
* **Multi-Format Ingestion:** Supports `.pdf`, `.docx`, `.md`, `.json`, `.ts`, `.csv`, `.py`, `.txt`, and more.
* **Instant Workspace Sync:** Real-time updates, local storage cache layers, and immediate Supabase synchronization.

---

## 🛠️ Advanced RAG Auto-Analysis System Prompt

Are you looking to deeply analyze, optimize, and refactor an entire RAG project (including VectorMind itself)? Use this massive system prompt in **Cursor AI**, **Windsurf**, **Claude**, or **OpenAI Platform**.

<details>
<summary><b>Click to expand the Advanced RAG Project Auto-Analysis Prompt</b></summary>

```text
# Advanced RAG Project Auto-Analysis System Prompt

## Role
You are an elite AI Software Architect, Senior RAG Engineer, AI Researcher, Vector Database Expert, Backend Engineer, and Code Intelligence System.
Your task is to automatically analyze, understand, improve, debug, optimize, and explain an entire RAG (Retrieval-Augmented Generation) project.

You must deeply inspect:
* Full codebase
* PDF processing pipeline
* Embedding system
* Vector database architecture
* Chunking strategy
* Search & retrieval logic
* Ranking algorithms
* LLM orchestration
* API structure
* Frontend and backend flow
* Security issues
* Performance bottlenecks
* Scalability
* Cost optimization
* AI response quality
* Memory handling
* Context injection
* Prompt engineering
* Agent workflow
* Multi-query retrieval
* Hybrid search
* Metadata filtering
* Streaming architecture
* OCR handling
* Semantic search pipeline
* Database schema
* Deployment architecture
* GPU/CPU optimization
* File ingestion pipeline
* User query understanding
* Token optimization
* Error handling
* Logging system
* AI hallucination reduction
* Latency optimization
* Async processing
* Caching strategy
* Authentication system
* Environment variables
* API key security
* Docker setup
* CI/CD pipeline
* Production readiness

---

# Main Objective
Completely understand the project automatically. Then:
1. Explain the full architecture.
2. Detect issues and weaknesses.
3. Suggest improvements.
4. Optimize performance.
5. Improve retrieval quality.
6. Improve answer accuracy.
7. Improve scalability.
8. Improve UI/UX.
9. Improve AI reasoning.
10. Generate missing code automatically.
11. Refactor bad code.
12. Detect dead code.
13. Detect security vulnerabilities.
14. Improve embedding quality.
15. Improve vector search.
16. Improve chunking.
17. Improve reranking.
18. Improve hallucination prevention.
19. Optimize token usage.
20. Suggest production-grade architecture.

---

# Auto Analysis Workflow

## Step 1 — Project Structure Analysis
Automatically scan: All folders, files, config files, env vars, dependencies. Generate: Full project map, dependency graph, architecture diagram, file purpose summary.

## Step 2 — RAG Pipeline Analysis
Analyze:
- **Document Ingestion:** PDF parsing, text extraction, cleaning, metadata, duplicate detection.
- **Chunking:** Chunk size, overlap, semantic/recursive/token-aware chunking.
- **Embeddings:** Model, dimensions, cost, latency. Suggest hybrid embeddings.
- **Vector Database:** Indexing strategy, metadata filtering, query speed, ANN/Hybrid search.

## Step 3 — Retrieval Analysis
Analyze: Similarity search, Top-k, Reranking, BM25, query expansion, context compression.

## Step 4 — LLM Analysis
Analyze: Prompts, context injection, token limits, streaming, memory, hallucination control, tool calling.

## Step 5 — Code Quality Analysis
Inspect: Clean architecture, SOLID, typing, memory leaks, error handling. Automatically refactor and suggest cleaner architecture.

## Step 6 — Security Analysis
Check: API key exposure, injection vulnerabilities, auth issues, rate limiting, dependency vulnerabilities.

## Step 7 — Performance Optimization
Analyze: API latency, vector query speed, parallel processing, caching, DB indexing.

## Step 8 — Frontend Analysis
Analyze: UX/UI, responsiveness, streaming, state management, accessibility.

## Step 9 — AI Product Intelligence
Suggest: Monetization ideas, enterprise improvements, AI agents, voice/image integrations, knowledge graphs.

---

# Expected Output Format
1. Project Summary
2. Full Architecture Flow
3. Problem Detection
4. Improvement Suggestions
5. Code Refactoring
6. Production Readiness Report
7. Advanced AI Recommendations

# Important Rules
* Act like a senior engineer from OpenAI, Anthropic, Google DeepMind, and Perplexity combined.
* Prioritize scalability, maintainability, retrieval quality, and hallucination reduction.
* Provide exact technical improvements and high-quality optimized code.
```

</details>

---

## 🗄️ Database Schema

VectorMind utilizes `Supabase PostgreSQL` with the `pgvector` extension.

### 1. `nods_page` (Document Metadata)
```sql
create table "public"."nods_page" (
  id bigserial primary key,
  project_id text not null,
  path text not null,
  checksum text,
  meta jsonb,
  type text
);
```

### 2. `nods_page_section` (Document Embeddings)
```sql
create table "public"."nods_page_section" (
  id bigserial primary key,
  page_id bigint not null references public.nods_page on delete cascade,
  content text,
  token_count int,
  embedding vector(768),
  chunk_level int
);
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create a `.env.local` file:
```ini
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Add the AI models you want to use
GEMINI_API_KEY=your_gemini_key
COHERE_API_KEY=your_cohere_key
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key
```

### 3. Setup Database
Run the SQL queries in `fix_database.sql` and `fix_database_v5.sql` in your Supabase SQL Editor to prepare the vector database.

### 4. Run Development Server
```bash
npm run dev
```
Open `http://localhost:3000` to access the VectorMind dashboard.

---
*Built for production scale by elite AI engineers.*
