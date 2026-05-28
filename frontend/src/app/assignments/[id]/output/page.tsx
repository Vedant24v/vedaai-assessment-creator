'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { GeneratedPaper, GeneratedQuestion, GeneratedSection, useAssignmentStore } from '@/store/assignmentStore';
import { joinAssignmentRoom, useSocket } from '@/lib/socket';

interface PageParams {
  params: Promise<{ id: string }>;
}

function DifficultyBadge({ difficulty }: { difficulty: 'easy' | 'medium' | 'hard' }) {
  const labels = { easy: 'Easy', medium: 'Moderate', hard: 'Hard' };
  return <span className={`difficulty-badge ${difficulty}`}>{labels[difficulty]}</span>;
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
        Generating structured questions with balanced difficulty and marks allocation.
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
  const { regenerateAssignment, fetchAssignment } = useAssignmentStore();
  const [isRegenerating, setIsRegenerating] = useState(false);

  async function handleRegenerate() {
    if (!confirm('Regenerate this question paper? The current paper will be replaced.')) return;
    setIsRegenerating(true);
    await regenerateAssignment(assignmentId);
    await fetchAssignment(assignmentId);
    setIsRegenerating(false);
  }

  return (
    <div className="paper-container" id="question-paper-container">
      <div className="paper-action-bar" id="paper-action-bar">
        <div className="paper-action-bar-title">
          Custom question paper for {paper.subject} / {paper.className}
        </div>
        <div className="paper-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRegenerate}
            disabled={isRegenerating}
            id="regenerate-paper-btn"
          >
            {isRegenerating ? (
              <>
                <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
                Regenerating...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate
              </>
            )}
          </button>

          <button className="btn btn-primary btn-sm" onClick={() => window.print()} id="download-pdf-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download as PDF
          </button>
        </div>
      </div>

      <div className="question-paper" ref={printRef} id="printable-paper">
        <div className="paper-school-header">
          <div className="paper-school-name">{paper.schoolName || 'Delhi Public School, Sector-4, Bokaro'}</div>
          <div className="paper-subject-line">Subject: {paper.subject}</div>
          <div className="paper-class-line">Class: {paper.className}</div>
        </div>

        <div className="paper-meta">
          <div className="paper-meta-item">
            <strong>Time Allowed:</strong> {paper.duration} minutes
          </div>
          <div className="paper-meta-item paper-meta-right">
            <strong>Maximum Marks:</strong> {paper.totalMarks}
          </div>
        </div>

        <div className="paper-general-instruction">
          General Instructions: All questions are compulsory unless stated otherwise. Read every question carefully.
        </div>

        <div className="student-info-section">
          <div className="student-info-row">
            <div className="student-info-field">
              <span className="student-info-label">Name:</span>
              <div className="student-info-line" />
            </div>
            <div className="student-info-field">
              <span className="student-info-label">Roll No:</span>
              <div className="student-info-line" />
            </div>
          </div>
          <div className="student-info-row">
            <div className="student-info-field">
              <span className="student-info-label">Section:</span>
              <div className="student-info-line" />
            </div>
            <div className="student-info-field">
              <span className="student-info-label">Class:</span>
              <div className="student-info-line" />
            </div>
          </div>
        </div>

        {paper.sections.map((section: GeneratedSection, sectionIndex) => {
          const questionOffset = paper.sections
            .slice(0, sectionIndex)
            .reduce((sum, previousSection) => sum + previousSection.questions.length, 0);

          return (
          <div key={section.id} className="paper-section" id={`section-${section.id}`}>
            <h2 className="paper-section-title">{section.title}</h2>
            <p className="paper-section-instruction">{section.instruction}</p>

            {section.questions.map((question: GeneratedQuestion, questionIndex) => {
              const questionNumber = questionOffset + questionIndex + 1;
              return (
                <div key={question.id} className="paper-question" id={`question-${question.id}`}>
                  <span className="paper-question-num">{questionNumber}.</span>
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
          );
        })}

        {paper.answerKey && paper.answerKey.length > 0 && (
          <div className="answer-key-section" id="answer-key-section">
            <h3 className="answer-key-title">Answer Key</h3>
            {paper.answerKey.map((answer, index) => (
              <div key={`${answer.questionId}-${index}`} className="answer-key-item">
                <strong>{index + 1}.</strong> {answer.answer}
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

  useSocket();

  useEffect(() => {
    void fetchAssignment(id);
    joinAssignmentRoom(id);
  }, [id, fetchAssignment]);

  useEffect(() => {
    if (!currentAssignment) return;
    if (currentAssignment.jobStatus === 'completed' || currentAssignment.jobStatus === 'failed') return;

    const interval = window.setInterval(() => {
      void fetchAssignment(id);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [currentAssignment, currentAssignment?.jobStatus, id, fetchAssignment]);

  if (isLoading && !currentAssignment) {
    return (
      <div className="app-layout">
        <Sidebar />
        <main className="app-main">
          <Header breadcrumb="AI Teacher's Toolkit" showBack />
          <div className="page-content">
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
          <div className="page-content empty-state">
            <h2 className="empty-state-title">Assignment not found</h2>
            <button className="btn btn-primary" onClick={() => router.push('/assignments')}>
              Go to Assignments
            </button>
          </div>
        </main>
      </div>
    );
  }

  const { jobStatus, generatedPaper, jobError } = currentAssignment;

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <Header breadcrumb="AI Teacher's Toolkit" showBack />
        <div className="page-content">
          {jobStatus === 'pending' || jobStatus === 'processing' ? <GeneratingState /> : null}

          {jobStatus === 'failed' && (
            <div className="generating-card">
              <h2 className="generating-title">Generation Failed</h2>
              <p className="generating-desc">{jobError || 'An unexpected error occurred. Please try again.'}</p>
              <button
                className="btn btn-primary"
                onClick={() => void useAssignmentStore.getState().regenerateAssignment(id)}
                id="retry-generation-btn"
                style={{ marginTop: 24 }}
              >
                Try Again
              </button>
            </div>
          )}

          {jobStatus === 'completed' && generatedPaper && (
            <QuestionPaperView paper={generatedPaper} assignmentId={id} />
          )}
        </div>
      </main>
    </div>
  );
}
