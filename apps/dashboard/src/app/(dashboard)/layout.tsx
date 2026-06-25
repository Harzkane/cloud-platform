'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, getStoredUser, logoutUser } from '@/lib/api';

interface MenuItem {
  name: string;
  path: string;
  icon: string;
  badge?: string;
  badgeType?: string;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; email: string; plan: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [projectsCount, setProjectsCount] = useState<number | null>(null);
  const [runningCount, setRunningCount] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    const stored = getStoredUser();
    if (!stored) {
      router.push('/login');
      return;
    }
    setUser(stored);

    const fetchData = async () => {
      try {
        const projData = await apiFetch<{ projects: any[] }>('/projects');
        setProjectsCount(projData.projects.length);

        const depData = await apiFetch<{ deployments: any[] }>('/deployments?limit=100');
        const activeDeps = depData.deployments.filter((d: any) => 
          ['QUEUED', 'CLONING', 'BUILDING', 'PUSHING', 'STARTING'].includes(d.status)
        );
        setRunningCount(activeDeps.length);

        // Poll faster when there are active deployments
        return activeDeps.length > 0;
      } catch (err) {
        console.error('Failed to load dynamic sidebar badges', err);
        return false;
      }
    };

    let intervalId: ReturnType<typeof setTimeout>;
    const scheduleNext = async () => {
      const hasActive = await fetchData();
      intervalId = setTimeout(scheduleNext, hasActive ? 5000 : 15000);
    };

    scheduleNext();

    // Listen for explicit refresh requests from other pages
    const onRefresh = () => fetchData();
    window.addEventListener('sidebar:refresh', onRefresh);

    return () => {
      clearTimeout(intervalId);
      window.removeEventListener('sidebar:refresh', onRefresh);
    };
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

  const mainItems: MenuItem[] = [
    { name: 'Overview', path: '/overview', icon: '⊞' },
    { 
      name: 'Projects', 
      path: '/projects', 
      icon: '📁', 
      badge: projectsCount !== null ? String(projectsCount) : undefined, 
      badgeType: 'info' 
    },
    { 
      name: 'Deployments', 
      path: '/deployments', 
      icon: '🚀',
      badge: runningCount ? String(runningCount) : undefined,
      badgeType: 'success'
    },
    { name: 'Databases', path: '/databases', icon: '🗄️' },
    { name: 'Domains', path: '/domains', icon: '🌐' },
  ];

  const accountItems: MenuItem[] = [
    { 
      name: 'Billing', 
      path: '/billing', 
      icon: '💳', 
      badge: user.plan === 'STARTER' ? '!' : undefined, 
      badgeType: 'warn' 
    },
    { name: 'API Keys', path: '/api-keys', icon: '🔑' },
    { name: 'Settings', path: '/settings', icon: '⚙️' },
  ];

  const activityItems: MenuItem[] = [
    { name: 'Activity Log', path: '/activity', icon: '📋' },
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
