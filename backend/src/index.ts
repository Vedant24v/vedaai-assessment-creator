import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { connectDB } from './lib/db';
import assignmentRoutes from './routes/assignments';
import uploadRoutes from './routes/upload';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    callback(null, origin || '*');
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// DB connection (cached for serverless)
let dbConnected = false;
app.use(async (_req, _res, next) => {
  if (!dbConnected) {
    try {
      await connectDB();
      dbConnected = true;
    } catch {
      // Continue even if DB fails on first request
    }
  }
  next();
});

// Routes
app.use('/api/assignments', assignmentRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const isVercel = !!process.env.VERCEL;

if (!isVercel) {
  // Only run persistent server + WebSocket locally
  const PORT = parseInt(process.env.PORT || '5000', 10);

  async function start() {
    try {
      await connectDB();
      dbConnected = true;

      // Only init Redis + Socket.IO locally
      try {
        const { initRedis } = await import('./lib/redis');
        await initRedis();
      } catch {
        console.warn('Redis not available, running without queue support');
      }

      try {
        const { initSocket } = await import('./lib/socket');
        initSocket(httpServer);
      } catch {
        console.warn('Socket.IO init failed');
      }

      httpServer.listen(PORT, () => {
        console.log(`🚀 VedaAI Backend running on http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  }

  start();
}

export default app;
