'use client';

import React, { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Domain {
  id: string;
  domain: string;
  type: string;
  sslStatus: string;
  project: { name: string };
}

interface Project {
  id: string;
  name: string;
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Domain form state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [domainName, setDomainName] = useState('');
  const [targetProjectId, setTargetProjectId] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<any>(null);

  useEffect(() => {
    fetchDomainsAndProjects();
  }, []);

  const fetchDomainsAndProjects = async () => {
    try {
      const domData = await apiFetch<{ domains: Domain[] }>('/domains');
      setDomains(domData.domains);

      const projData = await apiFetch<{ projects: Project[] }>('/projects');
      setProjects(projData.projects);
      if (projData.projects.length > 0) {
        setTargetProjectId(projData.projects[0].id);
      }
    } catch (err) {
      console.error('Failed to load domains data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setInstructions(null);
    setFormLoading(true);

    try {
      const data = await apiFetch<{ domain: Domain; instructions: any }>('/domains', {
        method: 'POST',
        body: {
          projectId: targetProjectId,
          domain: domainName,
        },
      });

      setDomainName('');
      setInstructions(data.instructions);
      fetchDomainsAndProjects();
    } catch (err: any) {
      setFormError(err.message || 'Failed to add domain');
    } finally {
      setFormLoading(false);
    }
  };

  const handleRemoveDomain = async (domainId: string) => {
    if (!confirm('Are you sure you want to delete this custom domain?')) return;
    try {
      await apiFetch(`/domains/${domainId}`, { method: 'DELETE' });
      fetchDomainsAndProjects();
    } catch (err: any) {
      alert(err.message || 'Failed to remove domain');
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
        LOADING_DOMAINS_MAP...
      </div>
    );
  }

  const activeSslCount = domains.filter((d) => d.sslStatus === 'ACTIVE').length;

  return (
    <>
      <div className="page-fade">
      <div className="page-header">
        <div>
          <h1 className="page-title">Domains</h1>
          <p className="page-subtitle">
            {domains.length} domains configured · {activeSslCount} active SSL certificates
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
            + Add Domain
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">Domains Directory</div>
          <div className="panel-meta">Let's Encrypt certificates · Auto-renewal enabled</div>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Target Project</th>
                <th>Type</th>
                <th>SSL Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((dom) => (
                <tr key={dom.id}>
                  <td className="td-primary">{dom.domain}</td>
                  <td>{dom.project.name}</td>
                  <td>
                    <span className={`badge ${dom.type === 'subdomain' ? 'badge-muted' : 'badge-staging'}`}>
                      {dom.type === 'subdomain' ? 'System Subdomain' : 'Custom Domain'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${dom.sslStatus === 'ACTIVE' ? 'badge-success' : 'badge-warning'}`}>
                      {dom.sslStatus}
                    </span>
                  </td>
                  <td>
                    {dom.type === 'custom' ? (
                      <button
                        className="btn btn-danger"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                        onClick={() => handleRemoveDomain(dom.id)}
                      >
                        Remove
                      </button>
                    ) : (
                      <span style={{ color: 'var(--ink4)', fontSize: '11px' }}>System Domain</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Add Domain Modal */}
      {isModalOpen && (
        <div className="modal-backdrop open">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Configure Custom Domain</h2>
              <button className="modal-close" onClick={() => { setIsModalOpen(false); setInstructions(null); }}>
                &times;
              </button>
            </div>
            <form onSubmit={handleAddDomain}>
              <div className="modal-body">
                {formError && <div className="notice notice-danger">❌ {formError}</div>}
                {instructions && (
                  <div className="notice notice-success" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                    <strong>Configure DNS records for the domain:</strong>
                    <p style={{ fontSize: '11px' }}>Type: <strong>{instructions.type}</strong></p>
                    <p style={{ fontSize: '11px' }}>Name: <strong>{instructions.name}</strong></p>
                    <p style={{ fontSize: '11px' }}>Value: <strong>{instructions.value}</strong></p>
                    <p style={{ fontSize: '10px', color: 'var(--ink2)', marginTop: '4px' }}>{instructions.note}</p>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="dom-name">Domain Name</label>
                  <input
                    id="dom-name"
                    type="text"
                    className="form-input"
                    placeholder="e.g. app.mydomain.com"
                    value={domainName}
                    onChange={(e) => setDomainName(e.target.value)}
                    required
                    disabled={formLoading}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="dom-proj">Target Application</label>
                  <select
                    id="dom-proj"
                    className="form-select"
                    value={targetProjectId}
                    onChange={(e) => setTargetProjectId(e.target.value)}
                    disabled={formLoading}
                  >
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setIsModalOpen(false); setInstructions(null); }}
                  disabled={formLoading}
                >
                  Close
                </button>
                {!instructions && (
                  <button type="submit" className="btn btn-primary" disabled={formLoading}>
                    {formLoading ? 'Adding...' : 'Add Domain'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
