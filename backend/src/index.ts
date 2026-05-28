import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { connectDB } from './lib/db';
import { initSocket } from './lib/socket';
import { initRedis } from './lib/redis';
import assignmentRoutes from './routes/assignments';
import uploadRoutes from './routes/upload';

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

const PORT = parseInt(process.env.PORT || '5000', 10);

async function start() {
  try {
    await connectDB();
    await initRedis();
    initSocket(httpServer);

    httpServer.listen(PORT, () => {
      console.log(`🚀 VedaAI Backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
