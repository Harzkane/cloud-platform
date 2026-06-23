'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Deployment {
  id: string;
  status: string;
  commitHash: string;
  commitMsg: string;
  branch: string;
  startedAt: string;
  finishedAt: string | null;
  duration: number | null;
  liveUrl: string | null;
  logs: string;
  project: { id: string; name: string; gitRepo: string };
  environment: { name: string };
}

export default function DeploymentDetailPage() {
  const router = useRouter();
  const { id } = useParams();
  const deploymentId = id as string;

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [logs, setLogs] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDeployment();
  }, [deploymentId]);

  const fetchDeployment = async () => {
    try {
      const data = await apiFetch<{ deployment: Deployment }>(`/deployments/${deploymentId}`);
      setDeployment(data.deployment);
      setStatus(data.deployment.status);
    } catch (err) {
      console.error('Failed to load deployment details', err);
      router.push('/deployments');
    }
  };

  useEffect(() => {
    if (!deployment) return;

    let active = true;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    const startStreaming = async () => {
      try {
        const token = localStorage.getItem('token');
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
        const res = await fetch(`${API_URL}/deployments/${deploymentId}/logs`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          setLogs(data.logs || '');
          setLoading(false);
          return;
        }

        if (!res.body) return;
        setLoading(false);
        reader = res.body.getReader();
        const decoder = new TextDecoder();
        let currentLogs = '';

        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);

          const lines = text.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.chunk) {
                  currentLogs += data.chunk;
                  setLogs(currentLogs);
                }
                if (data.done) {
                  setStatus(data.status);
                  fetchDeployment(); // Refresh metadata
                  break;
                }
              } catch (e) {
                // Ignore partial JSON parsing errors
              }
            }
          }
        }
      } catch (err) {
        console.error('Error streaming logs', err);
      } finally {
        setLoading(false);
      }
    };

    const activeStatuses = ['QUEUED', 'CLONING', 'BUILDING', 'PUSHING', 'STARTING'];
    if (activeStatuses.includes(deployment.status)) {
      startStreaming();
    } else {
      setLogs(deployment.logs || '');
      setLoading(false);
    }

    return () => {
      active = false;
      if (reader) reader.cancel();
    };
  }, [deploymentId, deployment?.status]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleCancelDeployment = async () => {
    if (!confirm('Cancel this build job?')) return;
    try {
      await apiFetch(`/deployments/${deploymentId}`, { method: 'DELETE' });
      fetchDeployment();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel deployment');
    }
  };

  const getStatusDot = (st: string) => {
    switch (st) {
      case 'READY':
      case 'RUNNING':
      case 'SUCCESS':
        return <span className="status-dot dot-success" />;
      case 'FAILED':
        return <span className="status-dot dot-danger" />;
      case 'QUEUED':
      case 'CLONING':
      case 'BUILDING':
      case 'PUSHING':
      case 'STARTING':
        return <span className="status-dot dot-success animate-pulse" style={{ background: 'var(--accent)' }} />;
      default:
        return <span className="status-dot dot-muted" />;
    }
  };

  const formatLogLine = (line: string, index: number) => {
    let className = 'log-muted';
    if (line.includes('[INFO]') || line.includes('info')) className = 'log-info';
    else if (line.includes('[SUCCESS]') || line.includes('success') || line.includes('successfully')) className = 'log-success';
    else if (line.includes('[WARN]') || line.includes('warn')) className = 'log-warn';
    else if (line.includes('[ERROR]') || line.includes('error') || line.includes('failed')) className = 'log-error';

    return (
      <div key={index} className="log-line">
        <span className="log-time">[{index + 1}]</span>
        <span className={className}>{line}</span>
      </div>
    );
  };

  if (loading && !deployment) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        fontFamily: 'var(--font-mono), monospace',
        color: 'var(--ink3)'
      }}>
        LOADING_BUILD_STREAM...
      </div>
    );
  }

  const isCancelable = ['QUEUED', 'CLONING', 'BUILDING', 'PUSHING', 'STARTING'].includes(status);

  return (
    <div className="page-fade">
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <Link href="/deployments" style={{ color: 'var(--ink3)' }}>Deployments</Link>
            <span style={{ color: 'var(--ink4)' }}>/</span>
            <h1 className="page-title" style={{ margin: 0 }}>Build #{deploymentId.slice(-6)}</h1>
          </div>
          <p className="page-subtitle">
            Project:{' '}
            <Link href={`/projects/${deployment?.project.id}`} className="auth-link">
              {deployment?.project.name}
            </Link>{' '}
            · Env: <strong>{deployment?.environment.name}</strong>
          </p>
        </div>
        <div className="page-actions">
          {isCancelable && (
            <button className="btn btn-danger" onClick={handleCancelDeployment}>
              Cancel Build
            </button>
          )}
          {deployment?.liveUrl && status === 'RUNNING' && (
            <a href={deployment.liveUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
              Visit Site 🌐
            </a>
          )}
        </div>
      </div>

      {/* Info panel */}
      <div className="grid-2">
        <div className="panel" style={{ padding: '20px' }}>
          <h3 className="drawer-section-title">Deployment Info</h3>
          <div className="drawer-grid" style={{ marginTop: '12px' }}>
            <div className="drawer-field">
              <div className="df-label">Status</div>
              <div className="df-val" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {getStatusDot(status)}
                {status}
              </div>
            </div>
            <div className="drawer-field">
              <div className="df-label">Branch / Commit</div>
              <div className="df-val mono">
                {deployment?.branch} @ {deployment?.commitHash.slice(0, 7)}
              </div>
            </div>
            <div className="drawer-field">
              <div className="df-label">Duration</div>
              <div className="df-val">
                {deployment?.duration ? `${deployment.duration}s` : '--'}
              </div>
            </div>
            <div className="drawer-field">
              <div className="df-label">Repository</div>
              <div className="df-val" style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {deployment?.project.gitRepo}
              </div>
            </div>
          </div>
        </div>

        <div className="panel" style={{ padding: '20px' }}>
          <h3 className="drawer-section-title">Metadata</h3>
          <div className="drawer-grid" style={{ marginTop: '12px' }}>
            <div className="drawer-field">
              <div className="df-label">Commit Message</div>
              <div className="df-val">{deployment?.commitMsg}</div>
            </div>
            <div className="drawer-field">
              <div className="df-label">Started At</div>
              <div className="df-val">
                {deployment && new Date(deployment.startedAt).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Terminal logs */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Console Build Logs</div>
          <div className="panel-meta">WAT stream</div>
        </div>
        <div className="panel-body" style={{ background: '#0a0e13', padding: 0 }}>
          <div className="log-terminal">
            {logs.trim() === '' ? (
              <div className="log-line">
                <span className="log-time">{"[>]"}</span>
                <span className="log-muted">Waiting for build logs to stream...</span>
              </div>
            ) : (
              logs.split('\n').map((line, idx) => formatLogLine(line, idx))
            )}
            <div ref={terminalEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
