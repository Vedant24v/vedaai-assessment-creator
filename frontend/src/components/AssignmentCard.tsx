'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Assignment, useAssignmentStore } from '@/store/assignmentStore';

interface AssignmentCardProps {
  assignment: Assignment;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'pending': return { label: '● Queued', cls: 'pending' };
    case 'processing': return { label: '⟳ Generating...', cls: 'processing' };
    case 'completed': return { label: '✓ Ready', cls: 'completed' };
    case 'failed': return { label: '✕ Failed', cls: 'failed' };
    default: return { label: status, cls: 'pending' };
  }
}

export default function AssignmentCard({ assignment }: AssignmentCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { deleteAssignment } = useAssignmentStore();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const statusInfo = getStatusLabel(assignment.jobStatus);

  const handleView = () => {
    router.push(`/assignments/${assignment._id}/output`);
    setMenuOpen(false);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this assignment? This cannot be undone.')) {
      await deleteAssignment(assignment._id);
    }
    setMenuOpen(false);
  };

  const handleCardClick = () => {
    router.push(`/assignments/${assignment._id}/output`);
  };

  const assignedDate = formatDate(assignment.createdAt);
  const dueDate = formatDate(assignment.dueDate);

  return (
    <article
      className="assignment-card"
      onClick={handleCardClick}
      role="button"
      aria-label={`Assignment: ${assignment.title}`}
      id={`assignment-card-${assignment._id}`}
    >
      <div className="assignment-card-header">
        <div>
          <h3 className="assignment-card-title">{assignment.title}</h3>
          {(assignment.jobStatus === 'pending' || assignment.jobStatus === 'processing') && (
            <span className={`status-badge ${statusInfo.cls}`} style={{ marginTop: '6px', display: 'inline-flex' }}>
              {assignment.jobStatus === 'processing' && (
                <span className="spinner" style={{ width: '10px', height: '10px', marginRight: '4px' }} />
              )}
              {statusInfo.label}
            </span>
          )}
        </div>

        <div
          className="assignment-card-menu"
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="menu-trigger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Assignment options"
            id={`assignment-menu-${assignment._id}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="19" r="1.5" />
            </svg>
          </button>

          {menuOpen && (
            <div className="dropdown-menu">
              <button className="dropdown-item" onClick={handleView} id={`view-assignment-${assignment._id}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Assignment
              </button>
              <button className="dropdown-item danger" onClick={handleDelete} id={`delete-assignment-${assignment._id}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="assignment-card-footer">
        <div className="assignment-date">
          Assigned on: <span>{assignedDate}</span>
        </div>
        <div className="assignment-date">
          Due: <span>{dueDate}</span>
        </div>
      </div>
    </article>
  );
}
