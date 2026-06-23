'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getMockLogs, parseRealLogs } from '@/lib/mockLogs';

interface Deployment {
  id: string;
  projectId: string;
  status: string;
  commitHash: string;
  commitMsg: string;
  branch: string;
  startedAt: string;
  finishedAt: string | null;
  duration: number | null;
  triggeredBy: string;
  liveUrl: string | null;
  project: { name: string };
  environment: { name: string; variables?: any };
}

export default function DeploymentsPage() {
  const router = useRouter();
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  // Drawer States
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [drawerDeployment, setDrawerDeployment] = useState<any>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [redeploying, setRedeploying] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchDeployments();
  }, [page, statusFilter]);

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

  const fetchDeployments = async () => {
    setLoading(true);
    try {
      const url = `/deployments?page=${page}&limit=15${statusFilter ? `&status=${statusFilter}` : ''}`;
      const data = await apiFetch<{ deployments: Deployment[]; pages: number }>(url);
      setDeployments(data.deployments);
      setTotalPages(data.pages || 1);
    } catch (err) {
      console.error('Failed to load deployments', err);
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

  // Helper to resolve build step indicators dynamically
  const getStepIndicator = (stepIndex: number, currentStatus: string) => {
    const statuses = ['QUEUED', 'CLONING', 'BUILDING', 'PUSHING', 'STARTING', 'READY'];
    const curIdx = statuses.indexOf(currentStatus);
    
    if (currentStatus === 'FAILED') {
      // If failed, show failure at the current step or fallback
      return <div className="step-indicator step-pending">✕</div>;
    }

    if (curIdx >= stepIndex) {
      return <div className="step-indicator step-done">✓</div>;
    } else if (curIdx === stepIndex - 1) {
      return <div className="step-indicator step-active">●</div>;
    } else {
      return <div className="step-indicator step-pending">{stepIndex}</div>;
    }
  };

  return (
    <>
      <div className="page-fade">
        <div className="page-header">
          <div>
            <h1 className="page-title">Deployments</h1>
            <p className="page-subtitle">Global build pipeline activity log for Lagos Node</p>
          </div>
        </div>

        {/* Filter panel */}
        <div className="panel" style={{ padding: '12px 20px' }}>
          <div className="filter-bar">
            <span className="filter-label">Filter Status:</span>
            {['', 'QUEUED', 'BUILDING', 'READY', 'FAILED'].map((st) => (
              <button
                key={st}
                className={`filter-btn ${statusFilter === st ? 'active' : ''}`}
                onClick={() => { setStatusFilter(st); setPage(1); }}
              >
                {st || 'ALL'}
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div className="panel-title">Build Activities</div>
            <div className="panel-meta">Page {page} of {totalPages}</div>
          </div>
          
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--ink3)' }}>
              POLLING_DEPLOYMENTS_QUEUE...
            </div>
          ) : deployments.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink4)' }}>
              No deployments found.
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Project</th>
                    <th>Environment</th>
                    <th>Commit</th>
                    <th>Triggered At</th>
                    <th>Duration</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deployments.map((dep) => (
                    <tr
                      key={dep.id}
                      className="clickable"
                      onClick={() => setSelectedDeploymentId(dep.id)}
                    >
                      <td>{getStatusBadge(dep.status)}</td>
                      <td className="td-primary">{dep.project?.name}</td>
                      <td>
                        <span className={`badge ${dep.environment?.name === 'PRODUCTION' ? 'badge-success' : 'badge-staging'}`}>
                          {dep.environment?.name || 'Production'}
                        </span>
                      </td>
                      <td className="td-mono">
                        <span style={{ color: 'var(--accent)' }}>{dep.commitHash.slice(0, 7)}</span>
                        {' '}· {dep.commitMsg || 'Manual deploy'}
                      </td>
                      <td>{new Date(dep.startedAt).toLocaleString()}</td>
                      <td>{dep.duration ? `${dep.duration}s` : '--'}</td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/deployments/${dep.id}`);
                          }}
                        >
                          View Logs
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination footer */}
          {totalPages > 1 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '11px' }}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '11px' }}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
              </button>
            </div>
          )}
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
                    // Refresh listing
                    fetchDeployments();
                    // Close drawer
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
