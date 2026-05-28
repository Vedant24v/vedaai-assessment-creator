# VedaAI – AI Assessment Creator

> Full-stack AI-powered assessment generation system for teachers. Built for structured prompt engineering, JSON parsing, and production-style async job handling.

**Submission:** [Google Form](https://docs.google.com/forms/d/e/1FAIpQLSeL19GVvVT8vZrTx67hMWKTXLyJSyhkW5XGyzh7Ppt5w8P1jw/viewform?usp=dialog)

---

## Features

- **AI question paper generation** — Section-wise papers via Google Gemini (JSON mode) with a deterministic mock fallback
- **Prompt structuring + parsing** — Strict JSON schema in the prompt; server-side extraction, normalization, and validation
- **Real-time updates** — Socket.IO on the API server; optional BullMQ worker with Redis pub/sub bridge
- **Background jobs** — BullMQ + Redis when available; inline generation when Redis is missing
- **Assignment CRUD** — Create, list, view, delete, regenerate
- **Reference uploads** — PDF, TXT, DOC, DOCX text extraction to steer generation
- **PDF export** — Browser print-to-PDF with dedicated `@media print` styles
- **Responsive UI** — Dashboard, multi-step create flow, exam-paper output view

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 16 + TypeScript + Zustand)                 │
│  • Create / dashboard / output pages                          │
│  • Socket.IO client + 3s polling fallback on output page      │
└───────────────────────────┬──────────────────────────────────┘
                            │ REST + WebSocket
┌───────────────────────────▼──────────────────────────────────┐
│  Backend (Express + TypeScript)                                │
│  • POST /api/assignments → queue or inline generation          │
│  • POST /api/upload → extract reference text                   │
│  • Socket.IO rooms per assignment                              │
└───────┬─────────────────┬──────────────────┬─────────────────┘
        │                 │                  │
┌───────▼───────┐ ┌───────▼───────┐ ┌────────▼─────────────────┐
│  MongoDB      │ │  Redis        │ │  BullMQ worker (optional) │
│  assignments  │ │  job queue +  │ │  Gemini / mock generation │
│  + papers     │ │  socket bridge│ │  → pub/sub → Socket.IO    │
└───────────────┘ └───────────────┘ └──────────────────────────┘
```

### End-to-end flow

1. Teacher completes the **Create Assignment** wizard (details → question types → optional file upload).
2. Frontend `POST /api/assignments` with `questionTypes`, marks, and optional `contentText`.
3. Backend persists the assignment and either:
   - enqueues a BullMQ job (Redis 5+), or
   - runs `processInline()` on the API process (no Redis / queue unavailable).
4. Worker or inline handler calls **Gemini** with a structured prompt (`responseMimeType: application/json`).
5. Response is parsed (`extractJson`), normalized to exact section/question counts, and saved to MongoDB.
6. `job:complete` is emitted via Socket.IO (direct emit or Redis bridge from worker).
7. Output page renders the paper; **Download as PDF** uses `window.print()` with print-only CSS.

---

## Approach (LLM + parsing)

| Step | Implementation |
|------|----------------|
| **Model** | Google Gemini (`GEMINI_MODEL`, default `gemini-2.0-flash`) via `@google/generative-ai` |
| **Prompt** | `buildPrompt()` in `backend/src/lib/gemini.ts` — subject, class, marks, per-type section plan, difficulty mix, optional teacher notes and uploaded excerpt (≤3000 chars) |
| **Structured output** | `generationConfig.responseMimeType: 'application/json'` plus explicit JSON shape in the prompt |
| **Parsing** | `extractJson()` strips fences/prose; `JSON.parse`; `normalizePaper()` enforces counts, IDs, difficulties, and answer key |
| **Resilience** | Mock generator when API key missing, quota exceeded, or parse/API errors |

Swapping models (Claude, GPT, OSS) would mean replacing `getModel()` / `generateContent` while keeping the same prompt contract and `normalizePaper()` pipeline.

---

## Quick start

### Prerequisites

- **Node.js** 18+
- **MongoDB** (local via Docker or Atlas)
- **Redis** 5+ (optional; recommended for queue + worker path)
- **Gemini API key** — [Google AI Studio](https://aistudio.google.com/app/apikey) (optional: mock mode without a valid key)

### 1. Infrastructure (MongoDB + Redis)

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# Set GEMINI_API_KEY in .env
npm install
npm run dev
```

### 3. Worker (only when Redis is running)

In a **second terminal**:

```bash
cd backend
npm run worker
```

Without Redis, the API falls back to **inline generation** on the same process; the worker is not required.

### 4. Frontend

```bash
cd frontend
npm install
# Optional: frontend/.env.local
# NEXT_PUBLIC_API_URL=http://localhost:5000
# NEXT_PUBLIC_WS_URL=http://localhost:5000
npm run dev
```

Open **http://localhost:3000**

### Verify builds

```bash
cd backend && npm run build
cd frontend && npm run build
```

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP port | `5000` |
| `MONGO_URI` | MongoDB URI | `mongodb://localhost:27017/vedaai` |
| `REDIS_URL` | Redis URL | `redis://localhost:6379` |
| `GEMINI_API_KEY` | Gemini API key | Required for live AI (mock if missing/invalid) |
| `GEMINI_MODEL` | Model id | `gemini-2.0-flash` |
| `FRONTEND_URL` | CORS / Socket origin | `http://localhost:3000` |

### Frontend (`frontend/.env.local`)

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend REST base | `http://localhost:5000` |
| `NEXT_PUBLIC_WS_URL` | Socket.IO server | `http://localhost:5000` |

---

## Project structure

```
VedaAI/
├── frontend/                 # Next.js app
│   └── src/
│       ├── app/assignments/  # Dashboard, create, output
│       ├── components/       # Sidebar, Header, cards
│       ├── store/            # Zustand + API client
│       └── lib/socket.ts     # Real-time client
├── backend/
│   └── src/
│       ├── index.ts          # Express + Socket.IO + Redis bridge
│       ├── routes/           # assignments, upload
│       ├── workers/          # BullMQ consumer
│       └── lib/              # gemini, redis, db, socket
├── docker-compose.yml        # MongoDB + Redis
└── README.md
```

---

## Bonus features (verified)

| Feature | Status | Notes |
|---------|--------|--------|
| **PDF export** | Working | `Download as PDF` → `window.print()`; `@media print` hides chrome, sidebar, action bar |
| **Caching / performance** | Partial | Mongoose connection reuse (`db.ts`); Redis queue with job retention; output page polls every 3s while generating |
| **UI polish** | Working | Brand styling, stepper create flow, difficulty badges, generating state, answer key, mobile breakpoints |
| **Regenerate** | Working | `PATCH /api/assignments/:id/regenerate` |
| **File upload** | Working | `POST /api/upload`; text passed as `contentText` into generation (including BullMQ jobs) |
| **WebSocket** | Working | Inline jobs emit directly; worker jobs use Redis `socket-events` bridge on API server |

### Manual test checklist

- [ ] `docker compose up -d` → Mongo + Redis healthy
- [ ] Backend `npm run dev` + worker `npm run worker` (if using Redis)
- [ ] Create assignment → output shows generating → completed paper
- [ ] **Download as PDF** → print preview shows paper only (no sidebar)
- [ ] Upload a PDF on create → questions reference uploaded content (with valid `GEMINI_API_KEY`)
- [ ] Delete assignment from dashboard
- [ ] Regenerate on output page

---

## Design

- VedaAI brand accent (`#E8521A`)
- Exam paper typography (serif body on output)
- Difficulty badges: Easy / Moderate / Hard
- Layout aligned to provided Figma references

---

## Tech stack

| Layer | Stack |
|-------|--------|
| Frontend | Next.js 16, React 19, TypeScript, Zustand, Socket.IO client |
| Backend | Express, TypeScript, Mongoose, BullMQ, Socket.IO |
| AI | Google Generative AI SDK (Gemini) |
| Data | MongoDB, Redis |

---

## License

MIT (or your chosen license for submission).
