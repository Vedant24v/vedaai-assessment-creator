'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { QuestionType, useAssignmentStore } from '@/store/assignmentStore';
import { joinAssignmentRoom, useSocket } from '@/lib/socket';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

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

type Step = 0 | 1 | 2;

interface FormErrors {
  title?: string;
  subject?: string;
  className?: string;
  dueDate?: string;
  duration?: string;
  questionTypes?: string;
}

export default function CreateAssignmentPage() {
  const router = useRouter();
  const { createAssignment, isCreating, error, clearError } = useAssignmentStore();
  useSocket();

  const [step, setStep] = useState<Step>(0);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [className, setClassName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [duration, setDuration] = useState(45);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([
    { type: 'Multiple Choice Questions', count: 5, marks: 1 },
    { type: 'Short Answer Questions', count: 4, marks: 3 },
    { type: 'Long Answer Questions', count: 2, marks: 5 },
  ]);
  const [additionalInstructions, setAdditionalInstructions] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [contentText, setContentText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});

  const totalQuestions = useMemo(
    () => questionTypes.reduce((sum, qt) => sum + qt.count, 0),
    [questionTypes]
  );
  const totalMarks = useMemo(
    () => questionTypes.reduce((sum, qt) => sum + qt.count * qt.marks, 0),
    [questionTypes]
  );

  function validateDetails() {
    const nextErrors: FormErrors = {};
    if (!title.trim()) nextErrors.title = 'Title is required';
    if (!subject.trim()) nextErrors.subject = 'Subject is required';
    if (!className.trim()) nextErrors.className = 'Class is required';
    if (!dueDate) nextErrors.dueDate = 'Due date is required';
    if (!duration || duration < 5) nextErrors.duration = 'Duration must be at least 5 minutes';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function validateQuestionTypes() {
    const nextErrors: FormErrors = {};
    if (questionTypes.length === 0) nextErrors.questionTypes = 'Add at least one question type';
    if (questionTypes.some((qt) => qt.count <= 0 || qt.marks <= 0)) {
      nextErrors.questionTypes = 'Count and marks must be positive numbers';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function canAdvance() {
    if (step === 0) return !isUploading;
    if (step === 1) return validateDetails();
    return validateQuestionTypes();
  }

  function goNext() {
    clearError();
    if (!canAdvance()) return;
    setStep((current) => Math.min(2, current + 1) as Step);
  }

  function goBack() {
    clearError();
    if (step === 0) {
      router.back();
      return;
    }
    setStep((current) => Math.max(0, current - 1) as Step);
  }

  const uploadSelectedFile = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    setUploadError('');

    try {
      const uploadRes = await axios.post(`${API_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        withCredentials: true,
      });

      setContentText(uploadRes.data.data.extractedText || '');
      setUploadedFileName(uploadRes.data.data.fileName || file.name);
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : 'File parsing failed';
      setUploadError(message);
      setUploadedFile(null);
      setUploadedFileName('');
      setContentText('');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleFileSelect = useCallback(
    (file: File) => {
      const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
      if (!['.pdf', '.txt', '.doc', '.docx'].includes(ext)) {
        setUploadError('Only PDF, TXT, DOC, DOCX files are allowed');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        setUploadError('File size must be under 10MB');
        return;
      }

      setUploadedFile(file);
      setUploadedFileName(file.name);
      void uploadSelectedFile(file);
    },
    [uploadSelectedFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  function addQuestionType() {
    const usedTypes = questionTypes.map((qt) => qt.type);
    const available = QUESTION_TYPE_OPTIONS.find((type) => !usedTypes.includes(type));
    setQuestionTypes([...questionTypes, { type: available || QUESTION_TYPE_OPTIONS[0], count: 1, marks: 1 }]);
  }

  function updateQuestionType(index: number, field: keyof QuestionType, value: string | number) {
    setQuestionTypes((current) =>
      current.map((qt, currentIndex) => {
        if (currentIndex !== index) return qt;
        if (field === 'type') return { ...qt, type: String(value) };
        return { ...qt, [field]: Math.max(1, Number(value) || 1) };
      })
    );
  }

  function removeQuestionType(index: number) {
    if (questionTypes.length === 1) return;
    setQuestionTypes(questionTypes.filter((_, currentIndex) => currentIndex !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();
    if (!validateDetails() || !validateQuestionTypes() || isUploading) return;

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
        contentText: contentText || undefined,
      });

      joinAssignmentRoom(assignmentId);
      router.push(`/assignments/${assignmentId}/output`);
    } catch {
      // Store owns the visible error message.
    }
  }

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="app-main">
        <Header breadcrumb="Assignments" showBack />

        <div className="create-page page-content">
          <div className="create-shell">
            <div className="create-heading">
              <div>
                <h1>Create Assignment</h1>
                <p>Build a structured AI-generated assessment in three focused steps.</p>
              </div>
              <div className="create-summary">
                <span>{totalQuestions} questions</span>
                <strong>{totalMarks} marks</strong>
              </div>
            </div>

            <div className="stepper" aria-label="Assignment creation steps">
              {['Upload Material', 'Assignment Details', 'Question Types'].map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={`stepper-item ${step === index ? 'active' : ''} ${step > index ? 'done' : ''}`}
                  onClick={() => setStep(index as Step)}
                >
                  <span>{index + 1}</span>
                  {label}
                </button>
              ))}
            </div>

            {(error || uploadError) && (
              <div className="form-alert">
                {error || uploadError}
              </div>
            )}

            <form onSubmit={handleSubmit} id="create-assignment-form">
              {step === 0 && (
                <section className="form-section">
                  <h2 className="form-section-title">Upload Material</h2>
                  <div
                    className={`upload-area ${isDragging ? 'dragging' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('file-input')?.click()}
                    role="button"
                    tabIndex={0}
                    id="file-upload-area"
                  >
                    <input
                      type="file"
                      id="file-input"
                      accept=".pdf,.txt,.doc,.docx"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file);
                      }}
                    />
                    {isUploading ? (
                      <div className="upload-success">
                        <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                        Parsing {uploadedFile?.name}
                      </div>
                    ) : uploadedFileName ? (
                      <div className="upload-success">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {uploadedFileName}
                      </div>
                    ) : (
                      <>
                        <svg className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L8 8m4-4l4 4M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                        </svg>
                        <p className="upload-text">Drop study material here or click to browse</p>
                        <p className="upload-subtext">PDF, DOC, DOCX or TXT up to 10MB</p>
                      </>
                    )}
                  </div>
                  {contentText && (
                    <div className="parsed-preview">
                      <strong>Extracted preview</strong>
                      <p>{contentText.slice(0, 280)}{contentText.length > 280 ? '...' : ''}</p>
                    </div>
                  )}
                </section>
              )}

              {step === 1 && (
                <section className="form-section">
                  <h2 className="form-section-title">Assignment Details</h2>
                  <div className="form-group">
                    <label className="form-label" htmlFor="assignment-title">Assignment Title *</label>
                    <input
                      id="assignment-title"
                      className={`form-input ${errors.title ? 'error' : ''}`}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Quiz on Electricity"
                    />
                    {errors.title && <p className="form-error">{errors.title}</p>}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="subject">Subject *</label>
                      <input
                        id="subject"
                        className={`form-input ${errors.subject ? 'error' : ''}`}
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Science"
                      />
                      {errors.subject && <p className="form-error">{errors.subject}</p>}
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="class-name">Class *</label>
                      <input
                        id="class-name"
                        className={`form-input ${errors.className ? 'error' : ''}`}
                        value={className}
                        onChange={(e) => setClassName(e.target.value)}
                        placeholder="Class 8B"
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
                        onChange={(e) => setDueDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                      />
                      {errors.dueDate && <p className="form-error">{errors.dueDate}</p>}
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="duration">Duration (minutes) *</label>
                      <input
                        id="duration"
                        type="number"
                        className={`form-input ${errors.duration ? 'error' : ''}`}
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                        min={5}
                        max={300}
                      />
                      {errors.duration && <p className="form-error">{errors.duration}</p>}
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor="additional-instructions">Additional Instructions</label>
                    <textarea
                      id="additional-instructions"
                      className="form-input"
                      rows={4}
                      value={additionalInstructions}
                      onChange={(e) => setAdditionalInstructions(e.target.value)}
                      placeholder="Focus on Chapter 3, include application-based questions, follow CBSE style."
                    />
                  </div>
                </section>
              )}

              {step === 2 && (
                <section className="form-section">
                  <h2 className="form-section-title">Question Types</h2>
                  <table className="question-type-table" id="question-types-table">
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th style={{ textAlign: 'center' }}>Questions</th>
                        <th style={{ textAlign: 'center' }}>Marks</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {questionTypes.map((qt, index) => (
                        <tr key={`${qt.type}-${index}`}>
                          <td>
                            <select
                              className="question-type-select"
                              value={qt.type}
                              onChange={(e) => updateQuestionType(index, 'type', e.target.value)}
                            >
                              {QUESTION_TYPE_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              className="number-input"
                              type="number"
                              value={qt.count}
                              min={1}
                              max={50}
                              onChange={(e) => updateQuestionType(index, 'count', e.target.value)}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              className="number-input"
                              type="number"
                              value={qt.marks}
                              min={1}
                              max={100}
                              onChange={(e) => updateQuestionType(index, 'marks', e.target.value)}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => removeQuestionType(index)}
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

                  <button type="button" className="add-question-type-btn" onClick={addQuestionType}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Question Type
                  </button>

                  <div className="question-totals">
                    <span>Total Questions: <strong>{totalQuestions}</strong></span>
                    <span>Total Marks: <strong>{totalMarks}</strong></span>
                  </div>
                </section>
              )}

              <div className="form-actions">
                <button type="button" className="btn btn-outline" onClick={goBack}>
                  {step === 0 ? 'Cancel' : 'Previous'}
                </button>
                {step < 2 ? (
                  <button type="button" className="btn btn-primary" onClick={goNext} disabled={isUploading}>
                    {isUploading ? 'Parsing file...' : 'Next'}
                  </button>
                ) : (
                  <button type="submit" className="btn btn-primary" disabled={isCreating || isUploading}>
                    {isCreating ? (
                      <>
                        <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                        Generating...
                      </>
                    ) : (
                      'Create Assignment'
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
