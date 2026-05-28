'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import AssignmentCard from '@/components/AssignmentCard';
import { useAssignmentStore, useAssignments } from '@/store/assignmentStore';
import { useSocket } from '@/lib/socket';

// Empty state illustration SVG
function EmptyIllustration() {
  return (
    <svg className="empty-state-illustration" viewBox="0 0 220 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Document */}
      <rect x="60" y="20" width="100" height="130" rx="8" fill="#F0F0F0" stroke="#E0E0E0" strokeWidth="1.5" />
      <rect x="72" y="35" width="76" height="8" rx="4" fill="#E0E0E0" />
      <rect x="72" y="50" width="55" height="6" rx="3" fill="#EAEAEA" />
      <rect x="72" y="63" width="65" height="6" rx="3" fill="#EAEAEA" />
      <rect x="72" y="76" width="45" height="6" rx="3" fill="#EAEAEA" />
      {/* Magnifying glass */}
      <circle cx="115" cy="105" r="40" fill="white" stroke="#E0E0E0" strokeWidth="2" />
      <circle cx="110" cy="100" r="24" fill="white" stroke="#CCCCCC" strokeWidth="2.5" />
      <line x1="128" y1="118" x2="148" y2="138" stroke="#CCCCCC" strokeWidth="5" strokeLinecap="round" />
      {/* X mark */}
      <circle cx="110" cy="100" r="14" fill="#FECACA" />
      <path d="M104 94l12 12M116 94l-12 12" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" />
      {/* Sparkles */}
      <path d="M55 50 L57 44 L59 50 L65 52 L59 54 L57 60 L55 54 L49 52 Z" fill="#E0E0E0" />
      <circle cx="165" cy="65" r="4" fill="#E0E0E0" />
      <circle cx="55" cy="130" r="5" fill="#EAEAEA" />
    </svg>
  );
}

export default function AssignmentsPage() {
  const { fetchAssignments, isLoading } = useAssignmentStore();
  const assignments = useAssignments();
  const [searchQuery, setSearchQuery] = useState('');

  // Initialize WebSocket listeners
  useSocket();

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const filtered = assignments.filter(
    (a) =>
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="app-layout">
      <Sidebar />

      <main className="app-main">
        <Header breadcrumb="Assignment" />

        <div className="page-content">
          {isLoading ? (
            <div className="loading-spinner">
              <div className="spinner spinner-lg" />
              <span>Loading assignments...</span>
            </div>
          ) : assignments.length === 0 ? (
            /* Empty State */
            <div className="empty-state" id="assignments-empty-state">
              <EmptyIllustration />
              <h1 className="empty-state-title">No assignments yet</h1>
              <p className="empty-state-desc">
                Create your first AI assessment with source material, structured question types,
                answer keys, and print-ready output.
              </p>
              <Link href="/assignments/create" className="btn btn-primary" id="create-first-assignment-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create Your First Assignment
              </Link>
            </div>
          ) : (
            /* Filled State */
            <>
              <div className="page-header">
                <div>
                  <div className="page-title-group">
                    <div className="page-status-dot" />
                    <h1 className="page-title">Assignments</h1>
                  </div>
                  <p className="page-subtitle">Manage and create assignments for your classes.</p>
                </div>
              </div>

              <div className="filter-bar">
                <button className="filter-btn" id="filter-assignments-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  Filter By
                </button>

                <div className="search-input-wrapper">
                  <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="search"
                    className="search-input"
                    placeholder="Search Assignment"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    id="search-assignments-input"
                    aria-label="Search assignments"
                  />
                </div>
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
                  No assignments match your search.
                </div>
              ) : (
                <div className="assignment-grid" id="assignments-grid">
                  {filtered.map((assignment) => (
                    <AssignmentCard key={assignment._id} assignment={assignment} />
                  ))}
                </div>
              )}

              {/* Floating Create Button */}
              <Link href="/assignments/create" className="btn btn-primary" id="create-assignment-fab" style={{
                position: 'fixed',
                bottom: '32px',
                left: '50%',
                transform: 'translateX(-50%)',
                borderRadius: 'var(--radius-full)',
                padding: '12px 24px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create Assignment
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
