'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, getStoredUser } from '@/lib/api';
import { getMockLogs, parseRealLogs } from '@/lib/mockLogs';
import { getStepIndicator } from '@/lib/deploySteps';

interface Project {
  id: string;
  name: string;
  gitRepo: string;
  runtime: string;
  createdAt: string;
  deployments: { status: string; startedAt: string; liveUrl: string | null }[];
}

interface Deployment {
  id: string;
  projectId: string;
  commitHash: string;
  commitMsg: string;
  status: string;
  startedAt: string;
  project: { name: string };
  environment: { name: string };
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function OverviewPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveTime, setLiveTime] = useState('');

  // Drawer States
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [drawerDeployment, setDrawerDeployment] = useState<any>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [redeploying, setRedeploying] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setUser(getStoredUser());

    // Update live clock
    const updateTime = () => {
      const now = new Date();
      setLiveTime(now.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos' }) + ' WAT');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);

    // Fetch dashboard stats
    fetchDashboardData();
    return () => clearInterval(interval);
  }, []);

  // Load detailed deployment info when drawer is opened
  useEffect(() => {
    if (selectedDeploymentId) {
      setDrawerLoading(true);
      setDrawerDeployment(null);
      apiFetch<any>(`/deployments/${selectedDeploymentId}`)
        .then((data) => {
          setDrawerDeployment(data.deployment);
        })
        .catch((err) => {
          console.error('Failed to load deployment details', err);
        })
        .finally(() => {
          setDrawerLoading(false);
        });
    } else {
      setDrawerDeployment(null);
    }
  }, [selectedDeploymentId]);

  const fetchDashboardData = async () => {
    try {
      const projData = await apiFetch<{ projects: Project[] }>('/projects');
      setProjects(projData.projects);

      const depData = await apiFetch<{ deployments: Deployment[] }>('/deployments?limit=5');
      setDeployments(depData.deployments);
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'READY':
      case 'SUCCESS':
      case 'RUNNING':
        return <span className="badge badge-success">{status}</span>;
      case 'FAILED':
        return <span className="badge badge-danger">{status}</span>;
      case 'QUEUED':
      case 'CLONING':
      case 'BUILDING':
      case 'PUSHING':
      case 'STARTING':
        return <span className="badge badge-warning">{status}</span>;
      default:
        return <span className="badge badge-muted">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        fontFamily: 'var(--font-mono), monospace',
        color: 'var(--ink3)'
      }}>
        INITIALIZING_STATS_ENGINE...
      </div>
    );
  }

  // Calculate stats
  const activeDeploymentsCount = deployments.filter(d => ['QUEUED', 'CLONING', 'BUILDING'].includes(d.status)).length;
  const healthyProjectsCount = projects.filter(p => p.deployments[0]?.status === 'READY').length;
  const deploymentsThisMonth = deployments.length;
  const bandwidthPct = 36.8;

  return (
    <>
      <div className="page-fade">
        <div className="page-header">
          <div>
            <h1 className="page-title">Welcome back, {user?.name || 'Developer'} 👋</h1>
            <p className="page-subtitle">
              Here's what's happening with your projects ·{' '}
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent)' }}>
                {liveTime}
              </span>
            </p>
          </div>
          <div className="page-actions">
            <Link href="/activity" className="btn btn-secondary">
              📋 Activity
            </Link>
            <Link href="/projects?new=true" className="btn btn-primary">
              + New Project
            </Link>
          </div>
        </div>

        {/* Stat cards */}
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-icon">📁</div>
            <div className="stat-label">Projects</div>
            <div className="stat-value">{projects.length}</div>
            <div className="stat-sub up">
              ↑ {healthyProjectsCount} Ready · {projects.length - healthyProjectsCount} Stopped
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🚀</div>
            <div className="stat-label">Deployments</div>
            <div className="stat-value">{deploymentsThisMonth}</div>
            <div className="stat-sub up">
              {activeDeploymentsCount > 0 ? `↑ ${activeDeploymentsCount} Active` : `↑ ${deploymentsThisMonth} this month`}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🗄️</div>
            <div className="stat-label">Databases</div>
            <div className="stat-value">3</div>
            <div className="stat-sub">3 Active · Lagos</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📡</div>
            <div className="stat-label">Bandwidth</div>
            <div className="stat-value">
              18.4 <span style={{ fontSize: '16px', color: 'var(--ink3)' }}>GB</span>
            </div>
            <div className="stat-sub warn">⚠ {bandwidthPct}% this month</div>
          </div>
        </div>

        {/* Recent Deployments + Quick Stats */}
        <div className="grid-6040">
          {/* Left: Recent Deployments — card-style rows matching mockup */}
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title">Recent Deployments</div>
              <div className="panel-actions">
                <Link href="/deployments" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: '11px' }}>
                  View All →
                </Link>
              </div>
            </div>

            {/* Deploy rows (mockup-style inline cards, not a data-table) */}
            <div id="recent-deploy-list">
              {deployments.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink4)', fontSize: '12px' }}>
                  No deployments triggered yet.
                </div>
              ) : (
                deployments.map((dep) => {
                  const isSuccess = dep.status === 'READY' || dep.status === 'SUCCESS' || dep.status === 'RUNNING';
                  const isFailed = dep.status === 'FAILED';
                  const dotClass = isSuccess ? 'dot-success' : isFailed ? 'dot-danger' : 'dot-warning';
                  const envBadge = dep.environment?.name === 'PRODUCTION' ? 'badge-success' : 'badge-staging';

                  return (
                    <div
                      key={dep.id}
                      className="deploy-row"
                      onClick={() => setSelectedDeploymentId(dep.id)}
                    >
                      <span className={`status-dot ${dotClass}`} />
                      <div style={{ flex: 1 }}>
                        <div className="deploy-project-name">
                          {dep.project?.name}
                          <span className={`badge ${envBadge}`} style={{ marginLeft: '6px' }}>
                            {dep.environment?.name || 'Production'}
                          </span>
                        </div>
                        <div className="deploy-commit">
                          {dep.commitHash?.slice(0, 7)} · {dep.commitMsg || 'Manual deploy'}
                        </div>
                      </div>
                      <div className="deploy-time">{timeAgo(dep.startedAt)}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right column: resource usage + platform status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">Resource Usage</div>
                <div className="panel-meta">{user?.plan || 'STARTER'} Plan · Renews Jul 15</div>
              </div>
              <div style={{ padding: '16px 20px' }}>
                <div className="usage-item">
                  <div className="usage-header">
                    <span className="usage-label">CPU</span>
                    <span className="usage-value">12.4%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: '12.4%' }}></div>
                  </div>
                </div>
                <div className="usage-item">
                  <div className="usage-header">
                    <span className="usage-label">Memory</span>
                    <span className="usage-value">512 MB / 1 GB</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: '50%' }}></div>
                  </div>
                </div>
                <div className="usage-item">
                  <div className="usage-header">
                    <span className="usage-label">Bandwidth</span>
                    <span className="usage-value">18.4 GB / 50 GB</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill warn" style={{ width: '36.8%' }}></div>
                  </div>
                </div>
                <div className="usage-item">
                  <div className="usage-header">
                    <span className="usage-label">Projects</span>
                    <span className="usage-value">{projects.length} / 5</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(projects.length / 5) * 100}%` }}></div>
                  </div>
                </div>
                <Link href="/billing" className="btn btn-primary" style={{ width: '100%', marginTop: '8px', justifyContent: 'center' }}>
                  Upgrade Plan →
                </Link>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">Platform Status</div>
                <div className="panel-meta">
                  <span className="status-dot dot-success" style={{ display: 'inline-block', marginRight: '4px' }}></span>
                  All Systems Operational
                </div>
              </div>
              <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{ color: 'var(--ink2)' }}>API Gateway</span>
                  <span className="badge badge-success">99.98% uptime</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{ color: 'var(--ink2)' }}>Worker Nodes (Go)</span>
                  <span className="badge badge-success">Healthy ×4</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{ color: 'var(--ink2)' }}>Redis Queue</span>
                  <span className="badge badge-success">Active</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{ color: 'var(--ink2)' }}>PostgreSQL</span>
                  <span className="badge badge-success">Healthy</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{ color: 'var(--ink2)' }}>Cloudflare CDN</span>
                  <span className="badge badge-success">Active</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                  <span style={{ color: 'var(--ink2)' }}>Lagos Node (OCI)</span>
                  <span className="badge badge-warning">Maintenance</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deployment Detail Drawer Backdrop */}
      <div
        className={`drawer-backdrop ${selectedDeploymentId ? 'open' : ''}`}
        onClick={() => setSelectedDeploymentId(null)}
      />

      {/* Deployment Detail Drawer */}
      <div className={`drawer ${selectedDeploymentId ? 'open' : ''}`}>
        <div className="drawer-header">
          {(() => {
            const basicDep = deployments.find(d => d.id === selectedDeploymentId);
            if (!basicDep) return null;
            return (
              <>
                <div>
                  <div className="drawer-title">Deployment Details</div>
                  <div className="drawer-subtitle">
                    ID: {basicDep.id.slice(0, 15)}... · {basicDep.project?.name}
                  </div>
                </div>
                <button className="drawer-close" onClick={() => setSelectedDeploymentId(null)}>✕</button>
              </>
            );
          })()}
        </div>

        <div className="drawer-body">
          {drawerLoading && (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              fontFamily: 'var(--font-mono), monospace',
              color: 'var(--ink4)'
            }}>
              LOADING_DEPLOYMENT_DETAILS...
            </div>
          )}
          {!drawerLoading && drawerDeployment && (
            <>
              {/* Deployment Info Section */}
              <div>
                <h3 className="drawer-section-title">Deployment Info</h3>
                <div className="drawer-grid" style={{ marginTop: '10px' }}>
                  <div className="drawer-field">
                    <div className="df-label">Project</div>
                    <div className="df-val">{drawerDeployment.project?.name}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Environment</div>
                    <div className="df-val">
                      <span className={`badge ${drawerDeployment.environment?.name === 'PRODUCTION' ? 'badge-success' : 'badge-staging'}`}>
                        {drawerDeployment.environment?.name || 'Production'}
                      </span>
                    </div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Commit</div>
                    <div className="df-val mono">{drawerDeployment.commitHash?.slice(0, 8)}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Branch</div>
                    <div className="df-val mono">{drawerDeployment.branch}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Duration</div>
                    <div className="df-val">{drawerDeployment.duration ? `${drawerDeployment.duration}s` : '--'}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Status</div>
                    <div className="df-val">{getStatusBadge(drawerDeployment.status)}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Triggered By</div>
                    <div className="df-val">{drawerDeployment.triggeredBy || 'manual'}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Live URL</div>
                    <div className="df-val mono" style={{ color: 'var(--accent)' }}>
                      {drawerDeployment.liveUrl || 'Not available'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Build Steps Section */}
              <div>
                <h3 className="drawer-section-title">Build Steps</h3>
                <div className="deploy-steps" style={{ marginTop: '10px' }}>
                  <div className="deploy-step">
                    {getStepIndicator(1, drawerDeployment.status)}
                    <div className="step-label">Clone repository from GitHub</div>
                  </div>
                  <div className="deploy-step">
                    {getStepIndicator(2, drawerDeployment.status)}
                    <div className="step-label">Build Docker image ({drawerDeployment.project?.runtime || 'node'})</div>
                  </div>
                  <div className="deploy-step">
                    {getStepIndicator(3, drawerDeployment.status)}
                    <div className="step-label">Push image to container registry</div>
                  </div>
                  <div className="deploy-step">
                    {getStepIndicator(4, drawerDeployment.status)}
                    <div className="step-label">Start container on worker node</div>
                  </div>
                  <div className="deploy-step">
                    {getStepIndicator(5, drawerDeployment.status)}
                    <div className="step-label">Health check checkup</div>
                  </div>
                  <div className="deploy-step">
                    {getStepIndicator(6, drawerDeployment.status)}
                    <div className="step-label">Update DNS & SSL routing</div>
                  </div>
                </div>
              </div>

              {/* Terminal Logs Section */}
              <div>
                <div className="drawer-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Build Logs</span>
                  <Link href={`/deployments/${drawerDeployment.id}`} className="project-link" style={{ color: 'var(--accent)', fontSize: '10px' }}>
                    ▶ Stream / Fullscreen
                  </Link>
                </div>
                <div className="log-terminal" style={{ maxHeight: '220px', overflowY: 'auto', marginTop: '8px', fontSize: '11px' }}>
                  {(() => {
                    const lines = drawerDeployment.logs
                      ? parseRealLogs(drawerDeployment.logs)
                      : getMockLogs(
                          drawerDeployment.status,
                          drawerDeployment.startedAt,
                          drawerDeployment.project?.runtime
                        );
                    return lines.map((line, idx) => (
                      <div key={idx} className="log-line" style={{ display: 'flex', gap: '10px' }}>
                        {line.time && (
                          <span style={{ color: 'var(--ink4)', minWidth: '56px', flexShrink: 0 }}>{line.time}</span>
                        )}
                        <span
                          style={{
                            color:
                              line.kind === 'success' ? 'var(--green)' :
                              line.kind === 'error'   ? 'var(--red)' :
                              line.kind === 'info'    ? 'var(--accent)' :
                              'var(--ink4)',
                          }}
                        >
                          {line.text}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </>
          )}
        </div>

        {(() => {
          const basicDep = deployments.find(d => d.id === selectedDeploymentId);
          if (!basicDep) return null;
          return (
            <div className="drawer-footer" style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                disabled={redeploying}
                onClick={async () => {
                  setRedeploying(true);
                  try {
                    const { deployment } = await apiFetch<any>('/deployments', {
                      method: 'POST',
                      body: {
                        projectId: basicDep.projectId,
                        environment: basicDep.environment?.name || 'PRODUCTION',
                        commitMsg: 'Manual redeployment',
                      },
                    });
                    setActionSuccessMessage(`Redeployment ${deployment.id} triggered!`);
                    setTimeout(() => setActionSuccessMessage(null), 4000);
                    fetchDashboardData();
                    setSelectedDeploymentId(null);
                  } catch (err) {
                    console.error(err);
                    alert('Failed to trigger redeployment');
                  } finally {
                    setRedeploying(false);
                  }
                }}
              >
                {redeploying ? 'Redeploying...' : '⚡ Redeploy'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => router.push(`/deployments/${basicDep.id}`)}
              >
                View Full Logs
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setSelectedDeploymentId(null)}
              >
                Close
              </button>
            </div>
          );
        })()}

        {actionSuccessMessage && (
          <div className="notice notice-success" style={{ margin: '0 24px 12px 24px', fontSize: '11px' }}>
            {actionSuccessMessage}
          </div>
        )}
      </div>
    </>
  );
}
