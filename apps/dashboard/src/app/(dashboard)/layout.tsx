'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getStoredUser, logoutUser } from '@/lib/api';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; email: string; plan: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = getStoredUser();
    if (!stored) {
      router.push('/login');
    } else {
      setUser(stored);
    }
  }, [router]);

  if (!mounted || !user) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0d1117',
        color: '#b0bec9',
        fontFamily: 'var(--font-mono), monospace'
      }}>
        LOADING_CONSOLE...
      </div>
    );
  }

  const mainItems = [
    { name: 'Overview', path: '/', icon: '⊞' },
    { name: 'Projects', path: '/projects', icon: '📁', badge: '12', badgeType: 'info' },
    { name: 'Deployments', path: '/deployments', icon: '🚀' },
    { name: 'Databases', path: '/databases', icon: '🗄️' },
    { name: 'Domains', path: '/domains', icon: '🌐' },
  ];

  const accountItems = [
    { name: 'Billing', path: '/billing', icon: '💳', badge: '!', badgeType: 'warn' },
    { name: 'API Keys', path: '/api-keys', icon: '🔑' },
    { name: 'Settings', path: '/settings', icon: '⚙️' },
  ];

  const activityItems = [
    { name: 'Activity Log', path: '/activity', icon: '📋', badge: '3', badgeType: '' },
  ];

  return (
    <div className="app-layout-root">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-logo">
          <div className="logo-mark">🚀</div>
          <div className="logo-text">
            <span className="logo-name">NexGenHost</span>
            <span className="logo-tagline">Cloud Control</span>
          </div>
        </div>
        <div className="topbar-center">
          <div className="topbar-search">
            <span className="search-icon">🔍</span>
            <input type="text" placeholder="Search resources, docs (⌘K)..." readOnly />
            <span className="search-shortcut">⌘K</span>
          </div>
        </div>
        <div className="topbar-right">
          <button className="topbar-btn" title="Notifications">
            🔔
            <span className="notif-badge"></span>
          </button>
          <button className="topbar-btn" title="Documentation">📖</button>
          <div className="topbar-divider"></div>
          <div className="user-avatar" title={user.name}>
            {user.name.slice(0, 2).toUpperCase()}
          </div>
        </div>
      </header>

      <div className="app-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-content">
            <div className="sidebar-section">
              <div className="sidebar-heading">Main</div>
              {mainItems.map((item) => {
                const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`sidebar-item ${isActive ? 'active' : ''}`}
                  >
                    <span className="si-icon">{item.icon}</span>
                    {item.name}
                    {item.badge && (
                      <span className={`si-badge ${item.badgeType || ''}`}>{item.badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="sidebar-divider"></div>

            <div className="sidebar-section">
              <div className="sidebar-heading">Account</div>
              {accountItems.map((item) => {
                const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`sidebar-item ${isActive ? 'active' : ''}`}
                  >
                    <span className="si-icon">{item.icon}</span>
                    {item.name}
                    {item.badge && (
                      <span className={`si-badge ${item.badgeType || ''}`}>{item.badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="sidebar-divider"></div>

            <div className="sidebar-section">
              <div className="sidebar-heading">Activity</div>
              {activityItems.map((item) => {
                const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    className={`sidebar-item ${isActive ? 'active' : ''}`}
                  >
                    <span className="si-icon">{item.icon}</span>
                    {item.name}
                    {item.badge && (
                      <span className={`si-badge ${item.badgeType || ''}`}>{item.badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="sidebar-footer">
            <div className="user-card" onClick={logoutUser} title="Click to Logout">
              <div className="user-avatar-sm">
                {user.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="user-info">
                <div className="user-name">{user.name}</div>
                <div className="user-plan">
                  <span className="plan-dot"></span>
                  {user.plan} PLAN
                </div>
              </div>
              <div style={{ color: 'var(--ink4)', fontSize: '10px' }}>🚪</div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="main">
          {children}
        </main>
      </div>
    </div>
  );
}
