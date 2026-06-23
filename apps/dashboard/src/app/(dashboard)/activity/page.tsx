'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface TimelineEvent {
  id: string;
  type: 'success' | 'info' | 'warning' | 'danger';
  title: string;
  desc: string;
  timestamp: number;
}

export default function ActivityLogPage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const getRelativeTime = (timestamp: number) => {
    const diffMs = Date.now() - timestamp;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    return `${diffDays}d ago`;
  };

  useEffect(() => {
    const loadActivity = async () => {
      try {
        let realEvents: TimelineEvent[] = [];
        try {
          // Fetch real deployments
          const data = await apiFetch<{ deployments: any[] }>('/deployments');
          realEvents = data.deployments.map((d) => {
            const isSuccess = d.status === 'READY' || d.status === 'RUNNING';
            const isFailed = d.status === 'FAILED';
            const eventType: TimelineEvent['type'] = isSuccess ? 'success' : isFailed ? 'danger' : 'warning';

            return {
              id: d.id,
              type: eventType,
              title: `Deployment ${d.id.slice(0, 10)} ${d.status.toLowerCase()}`,
              desc: `${d.project?.name || 'Project'} → ${d.environment?.name || 'Production'} · ${d.branch}@${d.commitHash?.slice(0, 7) || 'HEAD'}`,
              timestamp: new Date(d.startedAt).getTime()
            };
          });
        } catch (err) {
          console.error('Failed to load deployments for activity log', err);
        }

        // Generate mock audit events relative to current time
        const now = Date.now();
        const mockEvents: TimelineEvent[] = [
          {
            id: 'mock_1',
            type: 'info',
            title: 'API key accessed — Production Deployer',
            desc: 'Scope: deploy · IP: 197.210.64.12 · Lagos, Nigeria',
            timestamp: now - 3 * 60 * 1000 // 3 minutes ago
          },
          {
            id: 'mock_2',
            type: 'warning',
            title: 'Monthly egress bandwidth limit warning',
            desc: 'Consuming 128 GB of 200 GB (64%) allotted limit on Pro Plan',
            timestamp: now - 45 * 60 * 1000 // 45 minutes ago
          },
          {
            id: 'mock_3',
            type: 'info',
            title: 'Team member join request',
            desc: 'Amaka Okonkwo was added to workspace as Developer',
            timestamp: now - 4 * 3600 * 1000 // 4 hours ago
          },
          {
            id: 'mock_4',
            type: 'success',
            title: 'Database replication backup completed',
            desc: 'pg-ecommerce-prod · 4.2 GB file size saved to af-south-1 storage node',
            timestamp: now - 6 * 3600 * 1000 // 6 hours ago
          },
          {
            id: 'mock_5',
            type: 'info',
            title: 'SSL certificate successfully renewed',
            desc: 'CNAME: *.nexgenhost.com · Issued by Let\'s Encrypt authority · Valid for 90 days',
            timestamp: now - 12 * 3600 * 1000 // 12 hours ago
          },
          {
            id: 'mock_6',
            type: 'info',
            title: 'Login from new device detected',
            desc: 'macOS · Lagos, Nigeria · Chrome 125 · Authorized via session token',
            timestamp: now - 23 * 3600 * 1000 // 23 hours ago
          }
        ];

        // Merge and sort events by timestamp descending
        const merged = [...realEvents, ...mockEvents].sort((a, b) => b.timestamp - a.timestamp);
        setEvents(merged);
      } catch (err) {
        console.error('Failed to build activity log', err);
      } finally {
        setLoading(false);
      }
    };

    loadActivity();
  }, []);

  if (loading) {
    return (
      <div style={{
        padding: '40px',
        textAlign: 'center',
        fontFamily: 'var(--font-mono), monospace',
        color: 'var(--ink3)'
      }}>
        LOADING_ACTIVITY_TRAIL...
      </div>
    );
  }

  return (
    <div className="page-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Activity Log</h1>
          <p className="page-subtitle">All platform events · Audit trail</p>
        </div>
        <div className="page-actions">
          <button
            className="btn btn-ghost"
            onClick={() => alert('Exporting audit log timeline to audit-log.csv...')}
          >
            ⬇ Export Log
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Recent Activity</div>
          <div className="panel-meta">Showing last 20 events chronologically</div>
        </div>

        <div className="timeline" style={{ padding: '0 20px' }}>
          {events.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ink4)' }}>
              No recent activity found.
            </div>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="timeline-item">
                <div className="timeline-dot-col">
                  <div className={`t-dot ${ev.type}`} />
                  <div className="timeline-line" />
                </div>
                <div className="t-content">
                  <div className="t-title">{ev.title}</div>
                  <div className="t-desc">{ev.desc}</div>
                  <div className="t-time">{getRelativeTime(ev.timestamp)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
