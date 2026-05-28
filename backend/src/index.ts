import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { connectDB } from './lib/db';
import assignmentRoutes from './routes/assignments';
import uploadRoutes from './routes/upload';

const app = express();
const httpServer = createServer(app);

app.use(
  cors({
    origin(origin, callback) {
      callback(null, origin || true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch {
    next();
  }
});

app.use('/api/assignments', assignmentRoutes);
app.use('/api/upload', uploadRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

if (!process.env.VERCEL) {
  const PORT = parseInt(process.env.PORT || '5000', 10);

  async function start() {
    try {
      await connectDB();

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
        console.log(`VedaAI Backend running on http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  }

  start();
}

export default app;
