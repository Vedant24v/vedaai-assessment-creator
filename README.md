# VedaAI – AI Assessment Creator

> Full-stack AI-powered assessment generation system built for teachers.

[![Tech Stack](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org)
[![Backend](https://img.shields.io/badge/Express-TypeScript-blue)](https://expressjs.com)
[![Database](https://img.shields.io/badge/MongoDB-Mongoose-green)](https://mongodb.com)

---

## 📸 Features

- **AI Question Paper Generation** — Generates structured, section-wise question papers using Google Gemini
- **Real-time Updates** — WebSocket (Socket.IO) notifies the frontend when generation is complete
- **Background Job Queue** — BullMQ + Redis for scalable, async processing
- **Assignment Management** — Create, view, delete assignments with full persistence
- **PDF Export** — Download question papers as PDF
- **Responsive Design** — Works on mobile and desktop

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│                  Frontend                    │
│  Next.js 14 + TypeScript + Zustand           │
│  Socket.IO client (real-time updates)        │
└──────────────┬──────────────────────────────┘
               │ HTTP + WebSocket
┌──────────────▼──────────────────────────────┐
│                  Backend                     │
│  Express + TypeScript                        │
│  Socket.IO server                            │
│  POST /api/assignments → BullMQ Queue        │
└──────┬───────────────────────────────────────┘
       │
┌──────▼──────┐   ┌──────────────┐   ┌──────────────┐
│  MongoDB    │   │    Redis     │   │  BullMQ      │
│  Assignments│   │  Job Cache   │   │  Worker      │
│  & Papers   │   │  & Queues    │   │  → Gemini AI │
└─────────────┘   └──────────────┘   └──────────────┘
```

### Flow

1. Teacher fills the Create Assignment form
2. Frontend `POST /api/assignments` → backend creates assignment + queues BullMQ job
3. BullMQ worker picks up job → calls Gemini AI with structured prompt
4. Worker parses JSON response → saves to MongoDB
5. Worker emits `job:complete` via Socket.IO
6. Frontend receives event → displays structured question paper

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Redis (local or Upstash)
- Gemini API key (free at [aistudio.google.com](https://aistudio.google.com/app/apikey))

### Option A: Docker (Recommended for MongoDB + Redis)

```bash
docker-compose up -d
```

### Setup Backend

```bash
cd backend
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
npm install
npm run dev
```

### Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit: http://localhost:3000

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/vedaai` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `GEMINI_API_KEY` | Google Gemini API key | **Required** |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3000` |

### Frontend (`frontend/.env.local`)

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:5000` |
| `NEXT_PUBLIC_WS_URL` | WebSocket server URL | `http://localhost:5000` |

---

## 📁 Project Structure

```
VedaAI/
├── frontend/                    # Next.js 14 App
│   └── src/
│       ├── app/
│       │   ├── assignments/
│       │   │   ├── page.tsx              # Dashboard
│       │   │   ├── create/page.tsx       # Create form
│       │   │   └── [id]/output/page.tsx  # Question paper
│       │   ├── layout.tsx
│       │   └── globals.css
│       ├── components/
│       │   ├── Sidebar.tsx
│       │   ├── Header.tsx
│       │   └── AssignmentCard.tsx
│       ├── store/
│       │   └── assignmentStore.ts        # Zustand store
│       └── lib/
│           └── socket.ts                 # Socket.IO client
│
├── backend/                     # Express + TypeScript
│   └── src/
│       ├── index.ts                      # App entrypoint
│       ├── models/
│       │   └── Assignment.ts             # Mongoose schema
│       ├── routes/
│       │   ├── assignments.ts            # CRUD + generation
│       │   └── upload.ts                 # File upload
│       ├── workers/
│       │   └── questionWorker.ts         # BullMQ worker
│       └── lib/
│           ├── db.ts                     # MongoDB connection
│           ├── redis.ts                  # Redis + BullMQ
│           ├── socket.ts                 # Socket.IO server
│           └── gemini.ts                 # AI generation
│
├── docker-compose.yml
└── README.md
```

---

## 🤖 AI Approach

The system uses **Google Gemini 1.5 Flash** for question generation:

1. **Structured Prompt Engineering**: Input parameters (subject, class, question types, marks) are converted into a detailed prompt specifying exact output format
2. **JSON-only Response**: The prompt instructs Gemini to return valid JSON only — no markdown, no prose
3. **Post-processing**: Response is parsed, validated, and stored in MongoDB
4. **Fallback Mode**: If no API key is configured, a deterministic mock generator creates sample questions

---

## 🎨 Design

Pixel-perfect implementation of the provided Figma designs:
- VedaAI brand colors (orange `#E8521A`)
- Clean white sidebar with smooth hover states
- Assignment cards with context menus
- Exam paper typography (Times New Roman)
- Difficulty badges (Easy/Moderate/Hard with color coding)
- Mobile-responsive layout

---

## ✨ Bonus Features Implemented

- [x] PDF export (browser print dialog with print CSS)
- [x] Regenerate button on output page
- [x] Difficulty badges with visual color coding
- [x] Answer key section
- [x] Real-time WebSocket updates during generation
- [x] Fallback inline processing when Redis unavailable
- [x] File upload with PDF text extraction
