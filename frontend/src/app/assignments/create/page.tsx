'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useAssignmentStore, QuestionType } from '@/store/assignmentStore';
import { joinAssignmentRoom } from '@/lib/socket';
import { useSocket } from '@/lib/socket';

const QUESTION_TYPE_OPTIONS = [
  'Multiple Choice Questions',
  'Short Answer Questions',
  'Long Answer Questions',
  'Diagram-based Questions',
  'Numerical Problems',
  'Fill in the Blanks',
  'True / False',
  'Match the Following',
];

interface FormErrors {
  title?: string;
  subject?: string;
  className?: string;
  dueDate?: string;
  questionTypes?: string;
}

export default function CreateAssignmentPage() {
  const router = useRouter();
  const { createAssignment, isCreating, error, clearError } = useAssignmentStore();
  
  // Initialize WebSocket
  useSocket();

  // Form state
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [className, setClassName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [duration, setDuration] = useState(45);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([
    { type: 'Multiple Choice Questions', count: 5, marks: 1 },
    { type: 'Short Answer Questions', count: 5, marks: 3 },
    { type: 'Diagram-based Questions', count: 5, marks: 5 },
    { type: 'Numerical Problems', count: 5, marks: 5 },
  ]);
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [uploadError, setUploadError] = useState('');

  // Calculated totals
  const totalQuestions = questionTypes.reduce((sum, qt) => sum + qt.count, 0);
  const totalMarks = questionTypes.reduce((sum, qt) => sum + qt.count * qt.marks, 0);

  // Validation
  function validate(): boolean {
    const newErrors: FormErrors = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    if (!subject.trim()) newErrors.subject = 'Subject is required';
    if (!className.trim()) newErrors.className = 'Class is required';
    if (!dueDate) newErrors.dueDate = 'Due date is required';
    if (questionTypes.length === 0) newErrors.questionTypes = 'Add at least one question type';
    if (questionTypes.some(qt => qt.count <= 0 || qt.marks <= 0)) {
      newErrors.questionTypes = 'Count and marks must be positive numbers';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  // File drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const handleFileSelect = (file: File) => {
    const allowed = ['.pdf', '.txt', '.doc', '.docx'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowed.includes(ext)) {
      setUploadError('Only PDF, TXT, DOC, DOCX files are allowed');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size must be under 10MB');
      return;
    }
    setUploadError('');
    setUploadedFile(file);
    setUploadedFileName(file.name);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  // Question type handlers
  const addQuestionType = () => {
    const usedTypes = questionTypes.map(qt => qt.type);
    const available = QUESTION_TYPE_OPTIONS.find(t => !usedTypes.includes(t));
    setQuestionTypes([...questionTypes, { type: available || QUESTION_TYPE_OPTIONS[0], count: 5, marks: 1 }]);
  };

  const updateQuestionType = (index: number, field: keyof QuestionType, value: string | number) => {
    const updated = [...questionTypes];
    if (field === 'count' || field === 'marks') {
      const n = parseInt(value as string, 10);
      if (isNaN(n) || n < 0) return;
      updated[index] = { ...updated[index], [field]: n };
    } else {
      updated[index] = { ...updated[index], type: value as string };
    }
    setQuestionTypes(updated);
  };


  const removeQuestionType = (index: number) => {
    if (questionTypes.length === 1) return;
    setQuestionTypes(questionTypes.filter((_, i) => i !== index));
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!validate()) return;

    try {
      const assignmentId = await createAssignment({
        title,
        subject,
        className,
        dueDate,
        totalMarks,
        duration,
        questionTypes,
        additionalInstructions: additionalInstructions || undefined,
        uploadedFileName: uploadedFileName || undefined,
      });

      // Join the WebSocket room to get real-time updates
      joinAssignmentRoom(assignmentId);
      
      // Navigate to output page
      router.push(`/assignments/${assignmentId}/output`);
    } catch {
      // Error handled in store
    }
  };

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="app-main">
        <Header breadcrumb="Assignments" showBack />

        <div className="page-content" style={{ maxWidth: '720px', margin: '0 auto', marginTop: 'var(--header-height)', padding: '24px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px', color: 'var(--color-text-primary)' }}>
            Create Assignment
          </h1>

          {error && (
            <div style={{
              padding: '12px 16px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-error)',
              fontSize: '13px',
              marginBottom: '20px',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} id="create-assignment-form">
            {/* Section 1: Assignment Details */}
            <div className="form-section">
              <h2 className="form-section-title">Assignment Details</h2>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '20px', marginTop: '-12px' }}>
                Enter basic information about your assignment.
              </p>

              {/* File Upload */}
              <div style={{ marginBottom: '24px' }}>
                <label className="form-label">Upload Material (Optional)</label>
                <div
                  className={`upload-area ${isDragging ? 'dragging' : ''}`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-input')?.click()}
                  role="button"
                  aria-label="Upload file area"
                  id="file-upload-area"
                >
                  <input
                    type="file"
                    id="file-input"
                    accept=".pdf,.txt,.doc,.docx"
                    style={{ display: 'none' }}
                    onChange={handleFileInputChange}
                  />
                  {uploadedFileName ? (
                    <div className="upload-success">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {uploadedFileName}
                    </div>
                  ) : (
                    <>
                      <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="upload-text">Choose a file or drag & drop here</p>
                      <p className="upload-subtext">PDF, DOC, DOCX or TXT — Max 10MB</p>
                    </>
                  )}
                </div>
                {uploadError && <p className="form-error">{uploadError}</p>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="assignment-title">Assignment Title *</label>
                <input
                  id="assignment-title"
                  type="text"
                  className={`form-input ${errors.title ? 'error' : ''}`}
                  placeholder="e.g. Quiz on Electricity"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setErrors(p => ({ ...p, title: undefined })); }}
                />
                {errors.title && <p className="form-error">{errors.title}</p>}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="subject">Subject *</label>
                  <input
                    id="subject"
                    type="text"
                    className={`form-input ${errors.subject ? 'error' : ''}`}
                    placeholder="e.g. Science, Mathematics"
                    value={subject}
                    onChange={(e) => { setSubject(e.target.value); setErrors(p => ({ ...p, subject: undefined })); }}
                  />
                  {errors.subject && <p className="form-error">{errors.subject}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="class-name">Class *</label>
                  <input
                    id="class-name"
                    type="text"
                    className={`form-input ${errors.className ? 'error' : ''}`}
                    placeholder="e.g. Class 10B, Grade 8"
                    value={className}
                    onChange={(e) => { setClassName(e.target.value); setErrors(p => ({ ...p, className: undefined })); }}
                  />
                  {errors.className && <p className="form-error">{errors.className}</p>}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="due-date">Due Date *</label>
                  <input
                    id="due-date"
                    type="date"
                    className={`form-input ${errors.dueDate ? 'error' : ''}`}
                    value={dueDate}
                    onChange={(e) => { setDueDate(e.target.value); setErrors(p => ({ ...p, dueDate: undefined })); }}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  {errors.dueDate && <p className="form-error">{errors.dueDate}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="duration">Duration (minutes)</label>
                  <input
                    id="duration"
                    type="number"
                    className="form-input"
                    placeholder="45"
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value) || 45)}
                    min={5}
                    max={300}
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Question Types */}
            <div className="form-section">
              <h2 className="form-section-title">Question Type</h2>

              <table className="question-type-table" id="question-types-table">
                <thead>
                  <tr>
                    <th style={{ width: '45%' }}>Type</th>
                    <th style={{ width: '20%', textAlign: 'center' }}>No. of Questions</th>
                    <th style={{ width: '20%', textAlign: 'center' }}>Marks</th>
                    <th style={{ width: '15%' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {questionTypes.map((qt, index) => (
                    <tr key={index}>
                      <td>
                        <select
                          className="question-type-select"
                          value={qt.type}
                          onChange={(e) => updateQuestionType(index, 'type', e.target.value)}
                          id={`question-type-select-${index}`}
                        >
                          {QUESTION_TYPE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="number"
                          className="number-input"
                          value={qt.count}
                          onChange={(e) => updateQuestionType(index, 'count', e.target.value)}
                          min={1}
                          max={50}
                          id={`question-count-${index}`}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="number"
                          className="number-input"
                          value={qt.marks}
                          onChange={(e) => updateQuestionType(index, 'marks', e.target.value)}
                          min={1}
                          max={100}
                          id={`question-marks-${index}`}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => removeQuestionType(index)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--color-text-muted)', padding: '4px',
                            borderRadius: 'var(--radius-sm)',
                          }}
                          aria-label="Remove question type"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {errors.questionTypes && <p className="form-error">{errors.questionTypes}</p>}

              <button
                type="button"
                className="add-question-type-btn"
                onClick={addQuestionType}
                id="add-question-type-btn"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Question Type
              </button>

              <div className="question-totals">
                <span>Total Questions: <strong>{totalQuestions}</strong></span>
                <span>Total Marks: <strong>{totalMarks}</strong></span>
              </div>
            </div>

            {/* Section 3: Additional Instructions */}
            <div className="form-section">
              <h2 className="form-section-title">Additional Information (for better output)</h2>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="additional-instructions">
                  Any specific instructions or topics to focus on (optional)
                </label>
                <textarea
                  id="additional-instructions"
                  className="form-input"
                  rows={4}
                  placeholder="e.g. Focus on Chapter 3 - Electric Circuits. Include questions about Ohm's Law and series circuits. CBSE Grade 8 syllabus."
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  style={{ resize: 'vertical', minHeight: '100px' }}
                />
              </div>
            </div>

            {/* Form Actions */}
            <div className="form-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => router.back()}
                id="cancel-assignment-btn"
              >
                ← Previous
              </button>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={isCreating}
                id="submit-assignment-btn"
              >
                {isCreating ? (
                  <>
                    <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                    Generating...
                  </>
                ) : (
                  <>
                    Next →
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
