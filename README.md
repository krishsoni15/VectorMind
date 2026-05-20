# Gemini Chatbot Workspace - System Architecture & Documentation

This repository houses the **Gemini Chatbot Workspace**, a production-grade, Retrieval-Augmented Generation (RAG) platform that enables semantic question-answering over custom user documents. The application is built using **Next.js**, **Google Gemini**, and **Supabase (PostgreSQL + pgvector)**.

---

## 🏛️ System Architecture

The following diagram illustrates the ingestion flow (how files are parsed, embedded, and stored) and the query loop (how the chatbot retrieves context and generates answers).

```mermaid
flowchart TD
    subgraph Ingestion Pipeline (Upload)
        A[User Uploads Files] -->|Up to 100 Files| B[Next.js Client]
        B -->|Base64 Payload| C[API endpoint: /api/upload]
        C -->|File Copy| CA[(Local disk: public/uploads)]
        C -->|Check Format| D{Is PDF?}
        D -->|Yes| E[pdf-parse Extraction]
        D -->|No| F[UTF-8 Text Extraction]
        E --> G[Text Sanitation: Remove Null Bytes]
        F --> G
        G --> H[Chunking: 1000 char size, 200 overlap]
        H --> I[Gemini: text-embedding-004]
        I -->|768-Dimension Vector| J[(Supabase DB: pgvector)]
    end

    subgraph RAG Query Loop (Chat)
        K[User Query] -->|Ask Chatbot| L[API endpoint: /api/vector-search]
        L --> M[Gemini: text-embedding-004]
        M -->|Query Vector| N[Supabase Cosine Distance RPC]
        N -->|Select Sections| O[Relevant Context Chunks]
        O --> P[Inject Context into Prompt]
        P --> Q[Gemini: gemini-2.5-flash]
        Q -->|Streaming response| R[Next.js Client Chatbot UI]
    end
```

---

## 🛠️ Deep-Dive Algorithmic Workflow

### 1. Document Extraction & Sanitation
When a file is uploaded, the frontend reads the content into a Base64 string to avoid transmission corruption.
* **PDF Parsing**: Instantiates a stream via the `pdf-parse` constructor, extracting characters from binary pages.
* **Sanitation**: Before writing to PostgreSQL, the backend strips out null bytes (`\u0000`) and escaped nulls (`\\u0000`) to prevent DB query crashes.
* **Local Persistence**: A copy of the raw document is stored inside `public/uploads/` to enable in-app browser document previews.

### 2. Semantic Chunking
Extracted text is split into sequential chunks using a sliding window:
* **Chunk Size**: `1000` characters.
* **Overlap**: `200` characters (ensures sentence-level context remains intact across boundaries).
* **Identifier**: A SHA-256 checksum is computed for the entire document to skip processing duplicate uploads.

### 3. Vector Embeddings
Each text chunk is mapped to high-dimensional coordinate spaces to represent its semantic meaning:
* **Model**: `text-embedding-004` (Google Gemini Embedding API).
* **Dimensionality**: `768` dimensions.

### 4. Similarity Matching (pgvector RPC)
When a user asks a question, the query is converted into a 768-dimensional vector. The system queries Supabase using the `match_page_sections` stored procedure:
```sql
create or replace function match_page_sections(
  embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  page_id bigint,
  slug text,
  heading text,
  content text,
  similarity float
)
language plpgsql as $$
begin
  return query
  select
    nods_page_section.id,
    nods_page_section.page_id,
    nods_page.slug,
    nods_page_section.heading,
    nods_page_section.content,
    1 - (nods_page_section.embedding <=> match_page_sections.embedding) as similarity
  from nods_page_section
  join nods_page on nods_page.id = nods_page_section.page_id
  where 1 - (nods_page_section.embedding <=> match_page_sections.embedding) > match_threshold
  order climb by nods_page_section.embedding <=> match_page_sections.embedding
  limit match_count;
end;
$$;
```
* **Search Metric**: Cosine Distance (`<=>` operator).
* **Threshold**: `0.3` similarity boundary.
* **Match Count**: Top `10` matching sections are selected.

### 5. Context Injection & Streaming Response
The matching text sections are formatted and appended to a system template:
```text
You are a very helpful assistant. Given the following sections from the documentation, 
answer the question using only that information. If the answer is not contained, state so.

Context:
---
[Document Chunk 1]
---
[Document Chunk 2]

Question: [User's Question]
Answer:
```
This is sent to `gemini-2.5-flash` using the Vercel AI SDK Edge runtime, streaming responses instantly to the user interface.

---

## 🗄️ Database Schema & Storage

The database stores metadata and vectors in two relational tables inside Supabase:

### `nods_page` (Documents)
Tracks the files uploaded to the workspace.
* `id` (bigint, PK)
* `path` (text): Local file path or descriptor.
* `checksum` (text): SHA-256 file contents hash.
* `type` (text): Type of document (`uploaded`, `markdown`, etc.).
* `source` (text): Upload origin (e.g. `web_upload`).
* `meta` (jsonb): Stores file size, original filename, and upload timestamp.

### `nods_page_section` (Document Chunks)
Stores chunks and their computed vector coordinates.
* `id` (bigint, PK)
* `page_id` (bigint, FK referencing `nods_page.id` ON DELETE CASCADE)
* `slug` (text): Anchor name.
* `heading` (text): Subheading structure.
* `content` (text): The raw text chunk (~1000 characters).
* `embedding` (vector(768)): Dimensional representation.

---

## 🔑 Required API Keys & Env Variables

Create a `.env` file at the root of the project with the following configuration:

```ini
# Google AI Studio API Key (For embeddings & chat completion)
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase API Settings
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_private_service_role_key_here
```

---

## 📊 Scale Limits & Capabilities

* **Simultaneous Batch Capacity**: Upload and index up to `100` files concurrently.
* **File Types Supported**: Text (`.txt`), Markdown (`.md`, `.mdx`), Configuration (`.json`, `.csv`, `.xml`), Source Code (`.js`, `.ts`, `.html`, `.css`), and Portable Documents (`.pdf`).
* **Chunk Bounds**: ~`1,000` characters per block.
* **Embedding Limit**: Handles embedding blocks of up to `3,072` tokens per vector request.

---

## 🚀 Deployment Guide (Vercel + Supabase)

Deploying this platform is fully automated and takes less than 3 minutes using **Vercel**:

### Step 1: Push Code to GitHub
Initialize your Git repository, commit the files, and push to GitHub:
```bash
git init
git add .
git commit -m "feat: init gemini chatbot workspace"
git remote add origin your-github-repo-url
git branch -M main
git push -u origin main
```

### Step 2: Import Project to Vercel
1. Log in to the [Vercel Dashboard](https://vercel.com).
2. Click **Add New** > **Project**.
3. Import your GitHub repository from the listed repositories.

### Step 3: Configure Environment Variables
In the Vercel **Environment Variables** settings panel, copy and paste the keys from your local `.env` file:
* `GEMINI_API_KEY` (Your Google AI Studio Key)
* `NEXT_PUBLIC_SUPABASE_URL` (Your Supabase endpoint URL)
* `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Your Supabase Client Anon Key)
* `SUPABASE_SERVICE_ROLE_KEY` (Your Supabase Private Service Key)

### Step 4: Click Deploy
Click the **Deploy** button. Vercel automatically:
1. Installs all packages (including `pdf-parse`, `@supabase/supabase-js`, and Next.js).
2. Compiles Next.js edge and serverless routes.
3. Provisions a global edge CDN with a secure HTTPS domain.

