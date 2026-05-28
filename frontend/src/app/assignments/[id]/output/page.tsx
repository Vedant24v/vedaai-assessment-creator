'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { useAssignmentStore } from '@/store/assignmentStore';
import { useSocket, joinAssignmentRoom } from '@/lib/socket';
import { GeneratedPaper, GeneratedSection, GeneratedQuestion } from '@/store/assignmentStore';

interface PageParams {
  params: Promise<{ id: string }>;
}

function DifficultyBadge({ difficulty }: { difficulty: 'easy' | 'medium' | 'hard' }) {
  const labels = { easy: 'Easy', medium: 'Moderate', hard: 'Hard' };
  return (
    <span className={`difficulty-badge ${difficulty}`}>
      {labels[difficulty] || difficulty}
    </span>
  );
}

function GeneratingState() {
  return (
    <div className="generating-card" id="generating-state">
      <div className="generating-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h2 className="generating-title">AI is crafting your question paper</h2>
      <p className="generating-desc">
        Generating structured questions with proper difficulty distribution and marks allocation...
      </p>
      <div className="progress-dots">
        <div className="progress-dot" />
        <div className="progress-dot" />
        <div className="progress-dot" />
      </div>
    </div>
  );
}

function QuestionPaperView({ paper, assignmentId }: { paper: GeneratedPaper; assignmentId: string }) {
  const printRef = useRef<HTMLDivElement>(null);
  const { regenerateAssignment } = useAssignmentStore();
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Counter for global question numbering
  let questionCounter = 0;

  const handlePrint = () => {
    window.print();
  };

  const handleRegenerate = async () => {
    if (!confirm('Regenerate this question paper? The current paper will be replaced.')) return;
    setIsRegenerating(true);
    await regenerateAssignment(assignmentId);
    setIsRegenerating(false);
  };

  const handleDownloadPDF = () => {
    // Use browser print for PDF
    const style = document.createElement('style');
    style.innerHTML = `
      @media print {
        body > * { display: none; }
        #printable-paper { display: block !important; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    document.head.removeChild(style);
  };

  return (
    <div className="paper-container" id="question-paper-container">
      {/* Action Bar */}
      <div className="paper-action-bar" id="paper-action-bar">
        <div className="paper-action-bar-title">
          ✨ Certainly! Here are customised Question Papers for your {paper.subject} classes
        </div>
        <div className="paper-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRegenerate}
            disabled={isRegenerating}
            id="regenerate-paper-btn"
          >
            {isRegenerating ? (
              <><span className="spinner" style={{ width: '12px', height: '12px', borderWidth: '2px' }} /> Regenerating...</>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate
              </>
            )}
          </button>

          <button className="btn btn-primary btn-sm" onClick={handleDownloadPDF} id="download-pdf-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download as PDF
          </button>
        </div>
      </div>

      {/* Question Paper */}
      <div className="question-paper" ref={printRef} id="printable-paper">
        {/* School Header */}
        <div className="paper-school-header">
          <div className="paper-school-name">{paper.schoolName || 'Delhi Public School, Sector-4, Bokaro'}</div>
          <div className="paper-subject-line">Subject: {paper.subject}</div>
          <div className="paper-class-line">Class: {paper.className}</div>
        </div>

        {/* Meta Information */}
        <div className="paper-meta">
          <div className="paper-meta-item">
            <strong>Time Allowed:</strong> {paper.duration} minutes
          </div>
          <div className="paper-meta-item" style={{ textAlign: 'right' }}>
            <strong>Maximum Marks:</strong> {paper.totalMarks}
          </div>
        </div>

        {/* General Instructions */}
        <div className="paper-general-instruction">
          All questions are compulsory unless stated otherwise.
        </div>

        {/* Student Info Section */}
        <div className="student-info-section">
          <div className="student-info-row">
            <div className="student-info-field">
              <span className="student-info-label">Name:</span>
              <div className="student-info-line" />
            </div>
            <div className="student-info-field">
              <span className="student-info-label">Roll Number:</span>
              <div className="student-info-line" />
            </div>
          </div>
          <div className="student-info-row">
            <div className="student-info-field" style={{ maxWidth: '200px' }}>
              <span className="student-info-label">Section:</span>
              <div className="student-info-line" />
            </div>
            <div className="student-info-field" style={{ flex: 0 }}>
              <span className="student-info-label">Class: {paper.className}</span>
            </div>
          </div>
        </div>

        {/* Question Sections */}
        {paper.sections.map((section: GeneratedSection) => (
          <div key={section.id} className="paper-section" id={`section-${section.id}`}>
            <h2 className="paper-section-title">{section.title}</h2>
            <p className="paper-section-instruction">{section.instruction}</p>

            {section.questions.map((question: GeneratedQuestion) => {
              questionCounter++;
              const num = questionCounter;
              return (
                <div key={question.id} className="paper-question" id={`question-${question.id}`}>
                  <span className="paper-question-num">{num}.</span>
                  <div className="paper-question-content">
                    <p className="paper-question-text">{question.text}</p>
                    <div className="paper-question-footer">
                      <DifficultyBadge difficulty={question.difficulty} />
                      <span className="paper-question-marks">
                        [{question.marks} {question.marks === 1 ? 'Mark' : 'Marks'}]
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Answer Key */}
        {paper.answerKey && paper.answerKey.length > 0 && (
          <div className="answer-key-section" id="answer-key-section">
            <h3 className="answer-key-title">Answer Key</h3>
            {paper.answerKey.map((ak, idx) => (
              <div key={ak.questionId} style={{ marginBottom: '8px', fontSize: '13px', color: '#333' }}>
                <strong>{idx + 1}.</strong> {ak.answer}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AssignmentOutputPage({ params }: PageParams) {
  const { id } = use(params);
  const router = useRouter();
  const { currentAssignment, fetchAssignment, isLoading } = useAssignmentStore();

  // Initialize WebSocket
  useSocket();

  useEffect(() => {
    fetchAssignment(id);
    joinAssignmentRoom(id);
  }, [id, fetchAssignment]);

  // Auto-poll when pending/processing
  useEffect(() => {
    if (!currentAssignment) return;
    if (currentAssignment.jobStatus === 'completed' || currentAssignment.jobStatus === 'failed') return;

    const interval = setInterval(() => {
      fetchAssignment(id);
    }, 3000);

    return () => clearInterval(interval);
  }, [currentAssignment?.jobStatus, id, fetchAssignment]);

  if (isLoading && !currentAssignment) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="app-main">
          <Header breadcrumb="AI Teacher's Toolkit" showBack />
          <div className="page-content" style={{ marginTop: 'var(--header-height)' }}>
            <div className="loading-spinner">
              <div className="spinner spinner-lg" />
              <span>Loading...</span>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!currentAssignment) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="app-main">
          <Header breadcrumb="Assignment" showBack />
          <div className="page-content" style={{ marginTop: 'var(--header-height)', textAlign: 'center', paddingTop: '60px' }}>
            <h2 style={{ fontSize: '20px', color: 'var(--color-text-secondary)' }}>Assignment not found</h2>
            <button className="btn btn-primary" onClick={() => router.push('/assignments')} style={{ marginTop: '20px' }}>
              Go to Assignments
            </button>
          </div>
        </main>
      </div>
    );
  }

  const { jobStatus, generatedPaper, jobError, title } = currentAssignment;

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="app-main">
        <Header breadcrumb="AI Teacher's Toolkit" showBack />

        <div className="page-content" style={{ marginTop: 'var(--header-height)' }}>
          {/* Sidebar-style nav for output page */}
          <div style={{ display: 'flex', gap: '24px' }}>
            {/* Left mini nav */}
            <div style={{
              width: '160px',
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}>
              {[
                { label: 'Home', href: '/' },
                { label: 'My Groups', href: '/groups' },
                { label: 'Assignments', href: '/assignments' },
                { label: "AI Teacher's Toolkit", href: '/toolkit', active: true },
                { label: 'My Library', href: '/library' },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  style={{
                    padding: '8px 12px',
                    fontSize: '13px',
                    borderRadius: 'var(--radius-sm)',
                    textDecoration: 'none',
                    color: item.active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    background: item.active ? 'var(--color-primary-light)' : 'transparent',
                    fontWeight: item.active ? '600' : '400',
                  }}
                >
                  {item.label}
                </a>
              ))}
              
              {/* School card mini */}
              <div style={{
                marginTop: '24px',
                padding: '10px',
                background: 'white',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
              }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-text-primary)' }}>
                  Delhi Public School
                </div>
                <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                  Bokaro, India
                </div>
              </div>
            </div>

            {/* Main content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Status indicator */}
              {(jobStatus === 'pending' || jobStatus === 'processing') && (
                <GeneratingState />
              )}

              {jobStatus === 'failed' && (
                <div style={{
                  background: 'white',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '48px',
                  textAlign: 'center',
                }}>
                  <div style={{
                    width: '64px', height: '64px',
                    background: 'rgba(239,68,68,0.1)',
                    borderRadius: 'var(--radius-xl)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 20px',
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h2 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>Generation Failed</h2>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', marginBottom: '24px' }}>
                    {jobError || 'An unexpected error occurred. Please try again.'}
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={() => useAssignmentStore.getState().regenerateAssignment(id)}
                    id="retry-generation-btn"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {jobStatus === 'completed' && generatedPaper && (
                <QuestionPaperView paper={generatedPaper} assignmentId={id} />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
