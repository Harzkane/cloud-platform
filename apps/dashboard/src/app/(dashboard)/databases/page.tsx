'use client';

import React, { useState } from 'react';

interface Database {
  id: string;
  name: string;
  engine: 'PostgreSQL' | 'Redis';
  version: string;
  env: 'Production' | 'Staging';
  status: 'Healthy' | 'High Load' | 'Provisioning';
  usageValue: string;
  usageLimit: string;
  usagePercent: number;
  connections: string;
  queriesPerSec: string;
  latency: string;
  icon: string;
}

export default function DatabasesPage() {
  const [databases, setDatabases] = useState<Database[]>([
    {
      id: 'db_001',
      name: 'pg-ecommerce-prod',
      engine: 'PostgreSQL',
      version: '16',
      env: 'Production',
      status: 'Healthy',
      usageValue: '4.2 GB',
      usageLimit: '20 GB',
      usagePercent: 21,
      connections: '12 / 100',
      queriesPerSec: '142',
      latency: '2.1 ms',
      icon: '🐘',
    },
    {
      id: 'db_002',
      name: 'redis-queue-prod',
      engine: 'Redis',
      version: '7',
      env: 'Production',
      status: 'Healthy',
      usageValue: '180 MB',
      usageLimit: '512 MB',
      usagePercent: 35,
      connections: '2,841 keys',
      queriesPerSec: '4,200 ops/s',
      latency: '14 jobs',
      icon: '🔴',
    },
    {
      id: 'db_003',
      name: 'pg-analytics-staging',
      engine: 'PostgreSQL',
      version: '16',
      env: 'Staging',
      status: 'High Load',
      usageValue: '8.9 GB',
      usageLimit: '10 GB',
      usagePercent: 89,
      connections: '88 / 100',
      queriesPerSec: '891',
      latency: '18.4 ms',
      icon: '🐘',
    },
  ]);

  // Provision Database Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dbName, setDbName] = useState('');
  const [engine, setEngine] = useState<'PostgreSQL' | 'Redis'>('PostgreSQL');
  const [version, setVersion] = useState('16');
  const [env, setEnv] = useState<'Production' | 'Staging'>('Production');
  const [provisioning, setProvisioning] = useState(false);

  // Drawer state
  const [selectedDbId, setSelectedDbId] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const handleCreateDatabase = (e: React.FormEvent) => {
    e.preventDefault();
    setProvisioning(true);

    setTimeout(() => {
      const newDb: Database = {
        id: `db_${Math.random().toString(36).substr(2, 9)}`,
        name: dbName,
        engine,
        version: engine === 'PostgreSQL' ? version : '7',
        env,
        status: 'Healthy',
        usageValue: '0 GB',
        usageLimit: env === 'Production' ? '20 GB' : '10 GB',
        usagePercent: 0,
        connections: engine === 'PostgreSQL' ? '0 / 100' : '0 keys',
        queriesPerSec: '0',
        latency: engine === 'PostgreSQL' ? '0.0 ms' : '0 jobs',
        icon: engine === 'PostgreSQL' ? '🐘' : '🔴',
      };

      setDatabases([newDb, ...databases]);
      setIsModalOpen(false);
      setDbName('');
      setProvisioning(false);
    }, 1500);
  };

  const selectedDb = databases.find((d) => d.id === selectedDbId);

  // Helper to copy connection strings
  const getConnectionString = (db: Database) => {
    const isPg = db.engine === 'PostgreSQL';
    const cleanName = db.name.replace(/-/g, '_');
    return isPg
      ? `postgresql://ngx_user:••••••••@pg-prod.lagos.nexgenhost.com:5432/${cleanName}?sslmode=require`
      : `redis://:••••••••@redis-prod.lagos.nexgenhost.com:6379/0`;
  };

  return (
    <>
      <div className="page-fade">
        <div className="page-header">
          <div>
            <h1 className="page-title">Databases</h1>
            <p className="page-subtitle">Fully-managed PostgreSQL and Redis cache instances in Lagos Node</p>
          </div>
          <div className="page-actions">
            <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
              + New Database
            </button>
          </div>
        </div>

        <div className="notice notice-info">
          ℹ️ &nbsp; All databases are hosted in <strong>af-south-1 (Lagos, Nigeria)</strong> — data never leaves African soil. Automated daily backups are included.
        </div>

        {/* Database Cards Grid */}
        <div className="grid-3">
          {databases.map((db) => (
            <div
              key={db.id}
              className="db-card clickable"
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedDbId(db.id)}
            >
              <div className="db-card-header">
                <span className="db-icon">{db.icon}</span>
                <div>
                  <div className="db-name">{db.name}</div>
                  <div className="db-type">
                    {db.engine} {db.version} · {db.env}
                  </div>
                </div>
                <span
                  className={`badge ${
                    db.status === 'Healthy' ? 'badge-success' :
                    db.status === 'High Load' ? 'badge-danger' : 'badge-warning'
                  }`}
                  style={{ marginLeft: 'auto' }}
                >
                  {db.status}
                </span>
              </div>

              <div className="db-stats">
                <div>
                  <div className="db-stat-label">
                    {db.engine === 'PostgreSQL' ? 'Storage' : 'Memory'}
                  </div>
                  <div className="db-stat-value">
                    {db.usageValue} / {db.usageLimit}
                  </div>
                </div>
                <div>
                  <div className="db-stat-label">
                    {db.engine === 'PostgreSQL' ? 'Connections' : 'Keys'}
                  </div>
                  <div className="db-stat-value">{db.connections}</div>
                </div>
                <div>
                  <div className="db-stat-label">
                    {db.engine === 'PostgreSQL' ? 'Queries/sec' : 'Ops/sec'}
                  </div>
                  <div className="db-stat-value">{db.queriesPerSec}</div>
                </div>
                <div>
                  <div className="db-stat-label">
                    {db.engine === 'PostgreSQL' ? 'Avg Latency' : 'Queue Depth'}
                  </div>
                  <div className="db-stat-value">{db.latency}</div>
                </div>
              </div>

              <div className="progress-bar" style={{ marginTop: '14px' }}>
                <div
                  className={`progress-fill ${db.status === 'High Load' ? 'danger' : ''}`}
                  style={{ width: `${db.usagePercent}%` }}
                ></div>
              </div>
              <div
                style={{
                  fontSize: '10px',
                  color: db.status === 'High Load' ? 'var(--danger)' : 'var(--ink4)',
                  marginTop: '4px',
                }}
              >
                {db.usagePercent}% {db.engine === 'PostgreSQL' ? 'storage' : 'memory'} used
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Provision Database Modal */}
      {isModalOpen && (
          <div className="modal-backdrop open">
            <div className="modal">
              <div className="modal-header">
                <h2 className="modal-title">Provision Managed Database</h2>
                <button className="modal-close" onClick={() => setIsModalOpen(false)}>
                  &times;
                </button>
              </div>
              <form onSubmit={handleCreateDatabase}>
                <div className="modal-body">
                  <div className="form-group">
                    <label className="form-label" htmlFor="db-name">Database Name</label>
                    <input
                      id="db-name"
                      type="text"
                      className="form-input"
                      placeholder="e.g. pg-customers-prod"
                      value={dbName}
                      onChange={(e) => setDbName(e.target.value)}
                      required
                      disabled={provisioning}
                    />
                    <span className="form-hint">Lowercase alphanumeric characters and hyphens only</span>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="db-engine">Database Engine</label>
                      <select
                        id="db-engine"
                        className="form-select"
                        value={engine}
                        onChange={(e) => setEngine(e.target.value as any)}
                        disabled={provisioning}
                      >
                        <option value="PostgreSQL">PostgreSQL (Relational)</option>
                        <option value="Redis">Redis (Key-Value / Cache)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="db-env">Deployment Environment</label>
                      <select
                        id="db-env"
                        className="form-select"
                        value={env}
                        onChange={(e) => setEnv(e.target.value as any)}
                        disabled={provisioning}
                      >
                        <option value="Production">Production</option>
                        <option value="Staging">Staging</option>
                      </select>
                    </div>
                  </div>

                  {engine === 'PostgreSQL' && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="db-version">Engine Version</label>
                      <select
                        id="db-version"
                        className="form-select"
                        value={version}
                        onChange={(e) => setVersion(e.target.value)}
                        disabled={provisioning}
                      >
                        <option value="16">PostgreSQL 16 (Recommended)</option>
                        <option value="15">PostgreSQL 15</option>
                        <option value="14">PostgreSQL 14</option>
                      </select>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsModalOpen(false)}
                    disabled={provisioning}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={provisioning}>
                    {provisioning ? 'Provisioning Lagos Node...' : 'Provision Database'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      {/* Database Detail Drawer Backdrop */}
      <div
        className={`drawer-backdrop ${selectedDbId ? 'open' : ''}`}
        onClick={() => setSelectedDbId(null)}
      />

      {/* Database Detail Drawer */}
      <div className={`drawer ${selectedDbId ? 'open' : ''}`}>
        <div className="drawer-header">
          {selectedDb && (
            <>
              <div>
                <div className="drawer-title">{selectedDb.name}</div>
                <div className="drawer-subtitle">
                  {selectedDb.engine} {selectedDb.version} · af-south-1 · {selectedDb.env}
                </div>
              </div>
              <button className="drawer-close" onClick={() => setSelectedDbId(null)}>✕</button>
            </>
          )}
        </div>

        <div className="drawer-body">
          {selectedDb && (
            <>
              {/* Connection Parameters Section */}
              <div>
                <h3 className="drawer-section-title">Connection Details</h3>
                <div className="drawer-grid" style={{ marginTop: '10px' }}>
                  <div className="drawer-field">
                    <div className="df-label">Host</div>
                    <div className="df-val mono">
                      {selectedDb.engine === 'PostgreSQL' ? 'pg-prod.lagos.nexgenhost.com' : 'redis-prod.lagos.nexgenhost.com'}
                    </div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Port</div>
                    <div className="df-val mono">{selectedDb.engine === 'PostgreSQL' ? '5432' : '6379'}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Database</div>
                    <div className="df-val mono">{selectedDb.name.replace(/-/g, '_')}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">User</div>
                    <div className="df-val mono">{selectedDb.engine === 'PostgreSQL' ? 'ngx_user' : 'default'}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">SSL Mode</div>
                    <div className="df-val">{selectedDb.engine === 'PostgreSQL' ? 'require' : 'optional'}</div>
                  </div>
                  <div className="drawer-field">
                    <div className="df-label">Status</div>
                    <div className="df-val">
                      <span className={`badge ${selectedDb.status === 'Healthy' ? 'badge-success' : 'badge-danger'}`}>
                        {selectedDb.status}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  className="btn btn-ghost"
                  style={{ marginTop: '12px', fontSize: '11px', width: '100%', justifyContent: 'center' }}
                  onClick={() => {
                    navigator.clipboard.writeText(getConnectionString(selectedDb));
                    setActionSuccessMessage('📋 Connection string copied!');
                    setTimeout(() => setActionSuccessMessage(null), 4000);
                  }}
                >
                  Copy Connection String
                </button>
              </div>

              {/* Resource Metrics Section */}
              <div>
                <h3 className="drawer-section-title">Performance & Usage</h3>
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--ink4)' }}>{selectedDb.engine === 'PostgreSQL' ? 'Storage Usage' : 'Memory Usage'}</span>
                      <span style={{ color: 'var(--ink)' }}>{selectedDb.usageValue} / {selectedDb.usageLimit}</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${selectedDb.status === 'High Load' ? 'danger' : ''}`}
                        style={{ width: `${selectedDb.usagePercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="drawer-grid">
                    <div className="drawer-field">
                      <div className="df-label">Connections Active</div>
                      <div className="df-val">{selectedDb.connections}</div>
                    </div>
                    <div className="drawer-field">
                      <div className="df-label">{selectedDb.engine === 'PostgreSQL' ? 'Queries/sec' : 'Ops/sec'}</div>
                      <div className="df-val">{selectedDb.queriesPerSec}</div>
                    </div>
                    <div className="drawer-field">
                      <div className="df-label">Latency Average</div>
                      <div className="df-val">{selectedDb.latency}</div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {selectedDb && (
          <div className="drawer-footer" style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => {
                navigator.clipboard.writeText(getConnectionString(selectedDb));
                setActionSuccessMessage('📋 Connection string copied!');
                setTimeout(() => setActionSuccessMessage(null), 4000);
              }}
            >
              Copy URI
            </button>
            <button
              className="btn btn-danger"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => {
                if (confirm(`Are you sure you want to terminate database "${selectedDb.name}"?`)) {
                  setDatabases(databases.filter((d) => d.id !== selectedDb.id));
                  setSelectedDbId(null);
                }
              }}
            >
              Delete
            </button>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => setSelectedDbId(null)}
            >
              Close
            </button>
          </div>
        )}

        {actionSuccessMessage && (
          <div className="notice notice-success" style={{ margin: '0 24px 12px 24px', fontSize: '11px' }}>
            {actionSuccessMessage}
          </div>
        )}
      </div>
    </>
  );
}
