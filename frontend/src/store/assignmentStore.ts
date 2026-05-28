import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

export interface QuestionType {
  type: string;
  count: number;
  marks: number;
}

export interface Assignment {
  _id: string;
  title: string;
  subject: string;
  className: string;
  dueDate: string;
  totalMarks: number;
  duration: number;
  questionTypes: QuestionType[];
  additionalInstructions?: string;
  uploadedFileName?: string;
  jobStatus: 'pending' | 'processing' | 'completed' | 'failed';
  jobError?: string;
  generatedPaper?: GeneratedPaper;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedQuestion {
  id: string;
  text: string;
  difficulty: 'easy' | 'medium' | 'hard';
  marks: number;
  type: string;
}

export interface GeneratedSection {
  id: string;
  title: string;
  instruction: string;
  questions: GeneratedQuestion[];
}

export interface GeneratedPaper {
  schoolName: string;
  subject: string;
  className: string;
  totalMarks: number;
  duration: number;
  sections: GeneratedSection[];
  answerKey?: { questionId: string; answer: string }[];
}

export interface CreateAssignmentInput {
  title: string;
  subject: string;
  className: string;
  dueDate: string;
  totalMarks: number;
  duration: number;
  questionTypes: QuestionType[];
  additionalInstructions?: string;
  uploadedFileName?: string;
  contentText?: string;
}

interface AssignmentStore {
  assignments: Assignment[];
  currentAssignment: Assignment | null;
  isLoading: boolean;
  isCreating: boolean;
  error: string | null;

  // Actions
  fetchAssignments: () => Promise<void>;
  fetchAssignment: (id: string) => Promise<void>;
  createAssignment: (data: CreateAssignmentInput) => Promise<string>;
  deleteAssignment: (id: string) => Promise<void>;
  regenerateAssignment: (id: string) => Promise<void>;

  // Real-time updates
  updateAssignmentStatus: (id: string, status: string, paper?: GeneratedPaper, error?: string) => void;
  addAssignment: (assignment: Assignment) => void;
  removeAssignment: (id: string) => void;
  setCurrentAssignment: (assignment: Assignment | null) => void;
  clearError: () => void;
}

export const useAssignmentStore = create<AssignmentStore>()(
  devtools(
    (set) => ({
      assignments: [],
      currentAssignment: null,
      isLoading: false,
      isCreating: false,
      error: null,

      fetchAssignments: async () => {
        set({ isLoading: true, error: null });
        try {
          const res = await api.get('/api/assignments');
          set({ assignments: res.data.data, isLoading: false });
        } catch (err) {
          const message = axios.isAxiosError(err) ? err.message : 'Failed to fetch assignments';
          set({ error: message, isLoading: false });
        }
      },

      fetchAssignment: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
          const res = await api.get(`/api/assignments/${id}`);
          set({ currentAssignment: res.data.data, isLoading: false });
        } catch (err) {
          const message = axios.isAxiosError(err) ? err.message : 'Failed to fetch assignment';
          set({ error: message, isLoading: false });
        }
      },

      createAssignment: async (data: CreateAssignmentInput) => {
        set({ isCreating: true, error: null });
        try {
          const res = await api.post('/api/assignments', data);
          set({ isCreating: false });
          return res.data.data._id;
        } catch (err) {
          const message = axios.isAxiosError(err)
            ? err.response?.data?.error || err.message
            : 'Failed to create assignment';
          set({ error: message, isCreating: false });
          throw new Error(message);
        }
      },

      deleteAssignment: async (id: string) => {
        try {
          await api.delete(`/api/assignments/${id}`);
          set((state) => ({
            assignments: state.assignments.filter((a) => a._id !== id),
          }));
        } catch (err) {
          const message = axios.isAxiosError(err) ? err.message : 'Failed to delete assignment';
          set({ error: message });
          throw new Error(message);
        }
      },

      regenerateAssignment: async (id: string) => {
        try {
          const res = await api.patch(`/api/assignments/${id}/regenerate`);
          const updated = res.data.data as Assignment | undefined;
          set((state) => ({
            assignments: state.assignments.map((a) =>
              a._id === id
                ? updated || { ...a, jobStatus: 'processing', generatedPaper: undefined }
                : a
            ),
            currentAssignment:
              state.currentAssignment?._id === id
                ? updated || { ...state.currentAssignment, jobStatus: 'processing', generatedPaper: undefined }
                : state.currentAssignment,
          }));
        } catch (err) {
          const message = axios.isAxiosError(err) ? err.message : 'Failed to regenerate';
          set({ error: message });
        }
      },

      updateAssignmentStatus: (id: string, status: string, paper?: GeneratedPaper, error?: string) => {
        set((state) => ({
          assignments: state.assignments.map((a) =>
            a._id === id
              ? { ...a, jobStatus: status as Assignment['jobStatus'], generatedPaper: paper ?? a.generatedPaper, jobError: error }
              : a
          ),
          currentAssignment:
            state.currentAssignment?._id === id
              ? {
                  ...state.currentAssignment,
                  jobStatus: status as Assignment['jobStatus'],
                  generatedPaper: paper ?? state.currentAssignment.generatedPaper,
                  jobError: error,
                }
              : state.currentAssignment,
        }));
      },

      addAssignment: (assignment: Assignment) => {
        set((state) => ({
          assignments: [assignment, ...state.assignments],
        }));
      },

      removeAssignment: (id: string) => {
        set((state) => ({
          assignments: state.assignments.filter((a) => a._id !== id),
        }));
      },

      setCurrentAssignment: (assignment) => {
        set({ currentAssignment: assignment });
      },

      clearError: () => set({ error: null }),
    }),
    { name: 'assignment-store' }
  )
);

// Selector hooks
export const useAssignments = () => useAssignmentStore((s) => s.assignments);
export const useCurrentAssignment = () => useAssignmentStore((s) => s.currentAssignment);
export const useAssignmentLoading = () => useAssignmentStore((s) => s.isLoading);
export const useAssignmentError = () => useAssignmentStore((s) => s.error);
