'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAssignmentStore, GeneratedPaper } from '@/store/assignmentStore';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:5000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { updateAssignmentStatus, addAssignment, removeAssignment } = useAssignmentStore();

  useEffect(() => {
    const s = getSocket();
    socketRef.current = s;

    s.on('connect', () => {
      console.log('WebSocket connected:', s.id);
    });

    s.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    s.on('job:progress', (data: { assignmentId: string; status: string; message: string }) => {
      console.log('Job progress:', data);
      updateAssignmentStatus(data.assignmentId, data.status);
    });

    s.on('job:complete', (data: { assignmentId: string; status: string; paper: GeneratedPaper }) => {
      console.log('Job complete:', data.assignmentId);
      updateAssignmentStatus(data.assignmentId, 'completed', data.paper);
    });

    s.on('job:failed', (data: { assignmentId: string; status: string; error: string }) => {
      console.error('Job failed:', data);
      updateAssignmentStatus(data.assignmentId, 'failed', undefined, data.error);
    });

    s.on('assignment:created', (data: { _id: string }) => {
      // Only add if not already in store
      const existing = useAssignmentStore.getState().assignments.find(a => a._id === data._id);
      if (!existing) {
        addAssignment(data as Parameters<typeof addAssignment>[0]);
      }
    });

    s.on('assignment:deleted', (data: { _id: string }) => {
      removeAssignment(data._id);
    });

    return () => {
      s.off('job:progress');
      s.off('job:complete');
      s.off('job:failed');
      s.off('assignment:created');
      s.off('assignment:deleted');
      s.off('connect');
      s.off('disconnect');
    };
  }, [updateAssignmentStatus, addAssignment, removeAssignment]);

  return socketRef.current;
}

export function joinAssignmentRoom(assignmentId: string) {
  const s = getSocket();
  s.emit('join:assignment', assignmentId);
}
