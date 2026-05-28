'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  breadcrumb?: string;
  showBack?: boolean;
}

export default function Header({ breadcrumb = 'Assignment', showBack = false }: HeaderProps) {
  const router = useRouter();

  return (
    <header className="header" role="banner">
      {showBack && (
        <button
          className="header-back"
          onClick={() => router.back()}
          aria-label="Go back"
          id="header-back-btn"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      <div className="header-breadcrumb">
        <svg className="breadcrumb-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        <span className="breadcrumb-text">{breadcrumb}</span>
      </div>

      <div className="header-actions">
        {/* Notification Bell */}
        <div className="header-notification" role="button" aria-label="Notifications" id="header-notifications">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="notification-dot" aria-hidden="true" />
        </div>

        {/* User Menu */}
        <div className="user-menu" role="button" aria-label="User menu" id="header-user-menu">
          <div className="user-avatar">
            <span>J</span>
          </div>
          <span className="user-name">John Doe</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </header>
  );
}
