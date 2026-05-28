import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: SocketIOServer;

export function initSocket(httpServer: HttpServer): void {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join:assignment', (assignmentId: string) => {
      socket.join(`assignment:${assignmentId}`);
      console.log(`Socket ${socket.id} joined room assignment:${assignmentId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  console.log('✅ Socket.IO initialized');
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

// Emit to all sockets in an assignment room
export function emitToAssignment(assignmentId: string, event: string, data: unknown): void {
  if (io) {
    io.to(`assignment:${assignmentId}`).emit(event, data);
  }
}

// Emit to all connected sockets (broadcast)
export function broadcast(event: string, data: unknown): void {
  if (io) {
    io.emit(event, data);
  }
}
